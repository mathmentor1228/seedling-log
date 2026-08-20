import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// ATTENDANCE-NORMALIZE-V1: 레거시 값('출석'/'결석'/'미등원') 포함 판정
import { isAbsent, isLate } from '../_shared/attendance.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // KST = UTC+9
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = kstNow.toISOString().split('T')[0];

    // Last 7 days
    const weekAgo = new Date(kstNow.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    // Previous week range (for trend comparison)
    const twoWeeksAgo = new Date(kstNow.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

    const alerts: Array<{ type: string; description: string; priority: string; student_id?: string }> = [];

    // ═══════ 1. Student Patterns ═══════

    // Fetch this week's attendance logs
    const { data: weekLogs } = await supabase
      .from('attendance_logs')
      .select('student_id, student_name, date, checked_in_at')
      .gte('date', weekAgoStr)
      .lte('date', today);

    if (weekLogs && weekLogs.length > 0) {
      // --- 1a. 지각 3+ times detection ---
      // A student is "지각" if they checked in but late (we use class_schedules start_time as reference)
      // Simplified: group by student, count entries where checked_in_at is after expected time
      // For now, we detect "지각" based on lesson_records attendance_status
      const { data: lessonRecords } = await supabase
        .from('lesson_records')
        .select('student_id, lesson_date, attendance_status')
        .gte('lesson_date', weekAgoStr)
        .lte('lesson_date', today)
        .eq('submitted', true);

      if (lessonRecords) {
        // Count 지각 per student
        const lateCountMap = new Map<string, { count: number; name: string }>();
        for (const lr of lessonRecords) {
          const statuses = lr.attendance_status || [];
          if (isLate(statuses)) {
            const existing = lateCountMap.get(lr.student_id) || { count: 0, name: '' };
            existing.count += 1;
            lateCountMap.set(lr.student_id, existing);
          }
        }

        // Fetch student names for those with 3+ late
        const lateStudentIds = [...lateCountMap.entries()]
          .filter(([, v]) => v.count >= 3)
          .map(([id]) => id);

        if (lateStudentIds.length > 0) {
          const { data: students } = await supabase
            .from('students')
            .select('id, name')
            .in('id', lateStudentIds);

          for (const s of students || []) {
            alerts.push({
              type: '학생패턴',
              description: `${s.name} 이번 주 ${lateCountMap.get(s.id)!.count}회 지각`,
              priority: '높음',
              student_id: s.id,
            });
          }
        }

        // --- 1b. 2+ consecutive absent days ---
        const absentByStudent = new Map<string, string[]>();
        for (const lr of lessonRecords) {
          const statuses = lr.attendance_status || [];
          if (isAbsent(statuses)) {
            const dates = absentByStudent.get(lr.student_id) || [];
            if (!dates.includes(lr.lesson_date)) {
              dates.push(lr.lesson_date);
            }
            absentByStudent.set(lr.student_id, dates);
          }
        }

        const consecutiveAbsentIds: string[] = [];
        for (const [studentId, dates] of absentByStudent.entries()) {
          dates.sort();
          for (let i = 0; i < dates.length - 1; i++) {
            const d1 = new Date(dates[i]);
            const d2 = new Date(dates[i + 1]);
            const diffDays = (d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000);
            if (diffDays <= 1) {
              consecutiveAbsentIds.push(studentId);
              break;
            }
          }
        }

        if (consecutiveAbsentIds.length > 0) {
          const { data: students } = await supabase
            .from('students')
            .select('id, name')
            .in('id', consecutiveAbsentIds);

          for (const s of students || []) {
            alerts.push({
              type: '학생패턴',
              description: `${s.name} 2일 연속 결석`,
              priority: '높음',
              student_id: s.id,
            });
          }
        }
      }
    }

    // ═══════ 2. Classroom Patterns ═══════
    const { data: classrooms } = await supabase
      .from('classrooms')
      .select('id, name, capacity')
      .eq('is_active', true);

    if (classrooms && weekLogs) {
      // Group logs by room_id + hour + date
      const roomHourDateCount = new Map<string, Map<string, number>>();

      for (const log of weekLogs) {
        if (!log.checked_in_at) continue;
        const hour = new Date(log.checked_in_at).getHours();
        // We don't have room_id on all logs, use a simplified approach
        const key = `unknown_${hour}`;
        if (!roomHourDateCount.has(key)) roomHourDateCount.set(key, new Map());
        const dateMap = roomHourDateCount.get(key)!;
        dateMap.set(log.date, (dateMap.get(log.date) || 0) + 1);
      }

      // Check attendance_logs with room_id
      const { data: roomLogs } = await supabase
        .from('attendance_logs')
        .select('room_id, date, checked_in_at')
        .gte('date', weekAgoStr)
        .lte('date', today)
        .not('room_id', 'is', null);

      if (roomLogs) {
        const roomHourDate = new Map<string, Map<string, number>>();
        for (const log of roomLogs) {
          if (!log.checked_in_at || !log.room_id) continue;
          const hour = new Date(log.checked_in_at).getHours();
          const key = `${log.room_id}_${hour}`;
          if (!roomHourDate.has(key)) roomHourDate.set(key, new Map());
          const dm = roomHourDate.get(key)!;
          dm.set(log.date, (dm.get(log.date) || 0) + 1);
        }

        for (const [key, dateMap] of roomHourDate.entries()) {
          const [roomId, hourStr] = key.split('_');
          const classroom = classrooms.find(c => c.id === roomId);
          if (!classroom || classroom.capacity <= 0) continue;

          let overCapDays = 0;
          for (const [, count] of dateMap.entries()) {
            if (count / classroom.capacity > 0.9) overCapDays++;
          }

          if (overCapDays >= 3) {
            alerts.push({
              type: '강의실패턴',
              description: `${classroom.name} ${hourStr}시 시간대 반복 혼잡 (${overCapDays}일)`,
              priority: '중간',
            });
          }
        }
      }
    }

    // ═══════ 3. Trend Analysis ═══════
    // This week's total students who attended vs enrolled
    const { data: enrolledStudents } = await supabase
      .from('students')
      .select('id')
      .neq('enrollment_status', '퇴원');

    const totalEnrolled = enrolledStudents?.length || 1;

    // This week unique attendees
    const thisWeekAttendees = new Set(
      (weekLogs || []).filter(l => l.checked_in_at).map(l => l.student_id)
    );

    // Last week logs
    const { data: prevWeekLogs } = await supabase
      .from('attendance_logs')
      .select('student_id, checked_in_at')
      .gte('date', twoWeeksAgoStr)
      .lt('date', weekAgoStr);

    const prevWeekAttendees = new Set(
      (prevWeekLogs || []).filter(l => l.checked_in_at).map(l => l.student_id)
    );

    const thisWeekRate = (thisWeekAttendees.size / totalEnrolled) * 100;
    const prevWeekRate = (prevWeekAttendees.size / totalEnrolled) * 100;

    if (prevWeekRate > 0) {
      const dropPercent = prevWeekRate - thisWeekRate;
      if (dropPercent > 10) {
        alerts.push({
          type: '트렌드',
          description: `전체 출석률 전주 대비 ${Math.round(dropPercent)}% 하락`,
          priority: '높음',
        });
      }
    }

    // ═══════ Insert Alerts ═══════
    if (alerts.length > 0) {
      const rows = alerts.map(a => ({
        type: a.type,
        description: a.description,
        priority: a.priority,
        student_id: a.student_id || null,
        created_date: today,
        resolved: false,
      }));

      // Avoid duplicates: check existing alerts for today
      const { data: existingAlerts } = await supabase
        .from('pattern_alerts')
        .select('description')
        .eq('created_date', today);

      const existingDescs = new Set((existingAlerts || []).map(a => a.description));
      const newRows = rows.filter(r => !existingDescs.has(r.description));

      if (newRows.length > 0) {
        await supabase.from('pattern_alerts').insert(newRows);
      }
    }

    return new Response(JSON.stringify({ ok: true, alerts_created: alerts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
