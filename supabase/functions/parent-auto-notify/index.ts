import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    // 1. Students in "등원" status for 30+ minutes without entering class
    const { data: arrivedStudents } = await supabase
      .from('attendance_logs')
      .select('student_id, student_name, checked_in_at')
      .eq('date', today)
      .not('checked_in_at', 'is', null)
      .is('checked_out_at', null)
      .lt('checked_in_at', thirtyMinsAgo);

    if (arrivedStudents && arrivedStudents.length > 0) {
      for (const log of arrivedStudents) {
        if (!log.student_id) continue;

        // Check student is still in 등원 status
        const { data: student } = await supabase
          .from('students')
          .select('id, name, parent_phone, status')
          .eq('id', log.student_id)
          .eq('status', '등원')
          .maybeSingle();

        if (!student || !student.parent_phone) continue;

        // Check if we already sent this notification today
        const { data: existing } = await supabase
          .from('parent_notifications')
          .select('id')
          .eq('student_id', student.id)
          .eq('type', '지각')
          .gte('timestamp', `${today}T00:00:00`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from('parent_notifications').insert({
          student_id: student.id,
          parent_phone: student.parent_phone,
          type: '지각',
          message: `${student.name} 학생이 등원 후 30분이 경과했으나 아직 수업에 입실하지 않았습니다.`,
        });
      }
    }

    // 2. Students whose status changed to "결석" today
    const { data: absentStudents } = await supabase
      .from('students')
      .select('id, name, parent_phone')
      .eq('status', '결석')
      .not('parent_phone', 'is', null);

    if (absentStudents) {
      for (const student of absentStudents) {
        if (!student.parent_phone) continue;

        const { data: existing } = await supabase
          .from('parent_notifications')
          .select('id')
          .eq('student_id', student.id)
          .eq('type', '결석')
          .gte('timestamp', `${today}T00:00:00`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from('parent_notifications').insert({
          student_id: student.id,
          parent_phone: student.parent_phone,
          type: '결석',
          message: `${student.name} 학생이 오늘 결석 처리되었습니다.`,
        });
      }
    }

    // 3. Makeup schedule confirmations (check recent schedule_overrides)
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: recentOverrides } = await supabase
      .from('schedule_overrides')
      .select('id, class_id, new_date, new_start_time, new_end_time, override_type')
      .eq('override_type', 'reschedule')
      .gte('created_at', fiveMinAgo);

    if (recentOverrides) {
      for (const override of recentOverrides) {
        // Get students in this class
        const { data: classStudents } = await supabase
          .from('class_students')
          .select('student_id, students(id, name, parent_phone)')
          .eq('class_id', override.class_id);

        if (!classStudents) continue;

        for (const cs of classStudents) {
          const s = cs.students as any;
          if (!s || !s.parent_phone) continue;

          const { data: existing } = await supabase
            .from('parent_notifications')
            .select('id')
            .eq('student_id', s.id)
            .eq('type', '보강확정')
            .gte('timestamp', fiveMinAgo)
            .limit(1);

          if (existing && existing.length > 0) continue;

          const dateStr = override.new_date || '미정';
          const timeStr = override.new_start_time
            ? `${override.new_start_time}~${override.new_end_time || ''}`
            : '';

          await supabase.from('parent_notifications').insert({
            student_id: s.id,
            parent_phone: s.parent_phone,
            type: '보강확정',
            message: `${s.name} 학생의 보강 수업이 확정되었습니다. 일정: ${dateStr} ${timeStr}`,
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
