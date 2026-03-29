import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StudentEntry, getDayOfWeek, fmtTime, ROOMS } from './types';

interface UseAttendanceDataOptions {
  userId: string | undefined;
  role: string | null;
  selectedRoom: string;
}

export function useAttendanceData({ userId, role, selectedRoom }: UseAttendanceDataOptions) {
  const [entries, setEntries] = useState<StudentEntry[]>([]);
  const [allEntries, setAllEntries] = useState<StudentEntry[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = getDayOfWeek(today);

    // Fetch capacities
    const { data: capData } = await supabase
      .from('room_capacities')
      .select('room_id, capacity');
    const capMap: Record<string, number> = {};
    (capData ?? []).forEach((r) => { capMap[r.room_id] = r.capacity; });
    setCapacities(capMap);

    // Determine rooms to query
    const roomIds = role === 'admin' ? ['room10', 'glass'] : ['room10', 'glass'];

    // Get teacher's student IDs if teacher role
    let myStudentIds: string[] | null = null;
    if (role === 'teacher') {
      const { data: classes } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', userId);
      const classIds = classes?.map(c => c.id) ?? [];
      if (classIds.length > 0) {
        const { data: cs } = await supabase
          .from('class_students')
          .select('student_id')
          .in('class_id', classIds);
        myStudentIds = [...new Set(cs?.map(r => r.student_id) ?? [])];
      } else {
        myStudentIds = [];
      }
    }

    // All assignments for rooms
    const { data: assigned } = await supabase
      .from('room_assignments')
      .select('student_ids, student_names, room, slot_start, teacher_id')
      .in('room', roomIds)
      .or(`and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${today})`);

    interface AssignedStudent {
      studentId: string;
      studentName: string;
      roomId: string;
      slotStart?: string;
      teacherId?: string;
    }
    const assignedStudents: AssignedStudent[] = [];
    const seenKeys = new Set<string>();
    (assigned ?? []).forEach((a) => {
      const ids = (a.student_ids ?? []) as string[];
      const names = (a.student_names ?? []) as string[];
      ids.forEach((id: string, i: number) => {
        const key = `${id}_${a.room}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          // Filter for teacher's students only
          if (myStudentIds === null || myStudentIds.includes(id)) {
            assignedStudents.push({
              studentId: id,
              studentName: names[i] ?? '이름없음',
              roomId: a.room,
              slotStart: a.slot_start ?? undefined,
              teacherId: a.teacher_id ?? undefined,
            });
          }
        }
      });
    });

    // All logs for today
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('id, student_id, room_id, checked_in_at, checked_out_at')
      .in('room_id', roomIds)
      .eq('date', today);

    const logMap = new Map<string, { id: string; checked_in_at: string | null; checked_out_at: string | null }>();
    (logs ?? []).forEach((l) => {
      logMap.set(`${l.student_id}_${l.room_id}`, { id: l.id, checked_in_at: l.checked_in_at, checked_out_at: l.checked_out_at });
    });

    // Fetch teacher names for admin view
    let teacherNameMap: Record<string, string> = {};
    if (role === 'admin') {
      const teacherIds = [...new Set(assignedStudents.map(s => s.teacherId).filter(Boolean))] as string[];
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);
        (profiles ?? []).forEach(p => {
          teacherNameMap[p.id] = p.full_name || '선생님';
        });
      }
    }

    const result: StudentEntry[] = assignedStudents.map((s) => {
      const log = logMap.get(`${s.studentId}_${s.roomId}`);
      const roomLabel = ROOMS.find((r) => r.id === s.roomId)?.label ?? s.roomId;
      const base = {
        studentId: s.studentId,
        studentName: s.studentName,
        roomId: s.roomId,
        roomLabel,
        logId: log?.id,
        slotStart: s.slotStart,
        teacherId: s.teacherId,
        teacherName: s.teacherId ? teacherNameMap[s.teacherId] : undefined,
      };
      if (!log || !log.checked_in_at) {
        return { ...base, status: 'not_arrived' as const };
      }
      if (log.checked_out_at) {
        return { ...base, status: 'checked_out' as const, time: fmtTime(log.checked_out_at) };
      }
      return { ...base, status: 'checked_in' as const, time: fmtTime(log.checked_in_at) };
    });

    const order: Record<string, number> = { not_arrived: 0, checked_in: 1, checked_out: 2 };
    result.sort((a, b) => order[a.status] - order[b.status]);
    setAllEntries(result);
    setEntries(result.filter(e => e.roomId === selectedRoom));

    // Room counts (all rooms, all students)
    const counts: Record<string, number> = {};
    (logs ?? []).forEach((l) => {
      if (l.checked_in_at && !l.checked_out_at && l.room_id) {
        counts[l.room_id] = (counts[l.room_id] ?? 0) + 1;
      }
    });
    setRoomCounts(counts);
    setLoading(false);
  }, [userId, role, selectedRoom]);

  useEffect(() => {
    if (!userId) return;
    fetchData();
    const channel = supabase
      .channel('floating_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_assignments' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchData]);

  return { entries, allEntries, roomCounts, capacities, loading, refetch: fetchData };
}
