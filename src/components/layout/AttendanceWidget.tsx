import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

type StudentStatus = 'not_arrived' | 'checked_in' | 'checked_out';

interface StudentEntry {
  studentId: string;
  studentName: string;
  roomId: string;
  roomLabel: string;
  status: StudentStatus;
  time?: string;
}

const ROOMS = [
  { id: 'room10', label: '10강' },
  { id: 'glass', label: '유리문' },
];

const getDayOfWeek = (dateStr: string): string => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr).getDay()];
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export function AttendanceWidget() {
  const { user, role } = useAuth();
  const [entries, setEntries] = useState<StudentEntry[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = getDayOfWeek(today);

    // Fetch capacities
    const { data: capData } = await supabase
      .from('room_capacities')
      .select('room_id, capacity, label');
    const capMap: Record<string, number> = {};
    (capData ?? []).forEach((r) => {
      capMap[r.room_id] = r.capacity;
    });
    setCapacities(capMap);

    // My classes → my student ids
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', user.id);
    const classIds = classes?.map((c) => c.id) ?? [];

    if (classIds.length === 0) {
      setEntries([]);
      setRoomCounts({});
      setLoading(false);
      return;
    }

    const { data: cs } = await supabase
      .from('class_students')
      .select('student_id')
      .in('class_id', classIds);
    const myStudentIds = [...new Set(cs?.map((r) => r.student_id) ?? [])];

    if (myStudentIds.length === 0) {
      setEntries([]);
      setRoomCounts({});
      setLoading(false);
      return;
    }

    // Today's assignments for room10, glass — column is "room" not "room_id", "assigned_date" not "date"
    const { data: assigned } = await supabase
      .from('room_assignments')
      .select('student_ids, student_names, room')
      .in('room', ['room10', 'glass'])
      .or(
        `and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${today})`
      );

    // Extract assigned students that are mine
    interface AssignedStudent { studentId: string; studentName: string; roomId: string; }
    const assignedStudents: AssignedStudent[] = [];
    const seenKeys = new Set<string>();
    (assigned ?? []).forEach((a) => {
      const ids = (a.student_ids ?? []) as string[];
      const names = (a.student_names ?? []) as string[];
      ids.forEach((id: string, i: number) => {
        if (myStudentIds.includes(id)) {
          const key = `${id}_${a.room}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            assignedStudents.push({
              studentId: id,
              studentName: names[i] ?? '이름없음',
              roomId: a.room,
            });
          }
        }
      });
    });

    // Today's logs for my students
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('id, student_id, student_name, room_id, date, checked_in_at, checked_out_at')
      .in('student_id', myStudentIds)
      .in('room_id', ['room10', 'glass'])
      .eq('date', today);

    const logMap = new Map<string, { checked_in_at: string | null; checked_out_at: string | null }>();
    (logs ?? []).forEach((l) => {
      logMap.set(`${l.student_id}_${l.room_id}`, { checked_in_at: l.checked_in_at, checked_out_at: l.checked_out_at });
    });

    // Build entries
    const result: StudentEntry[] = assignedStudents.map((s) => {
      const log = logMap.get(`${s.studentId}_${s.roomId}`);
      const roomLabel = ROOMS.find((r) => r.id === s.roomId)?.label ?? s.roomId;
      if (!log || !log.checked_in_at) {
        return { studentId: s.studentId, studentName: s.studentName, roomId: s.roomId, roomLabel, status: 'not_arrived' as const };
      }
      if (log.checked_out_at) {
        return { studentId: s.studentId, studentName: s.studentName, roomId: s.roomId, roomLabel, status: 'checked_out' as const, time: fmtTime(log.checked_out_at) };
      }
      return { studentId: s.studentId, studentName: s.studentName, roomId: s.roomId, roomLabel, status: 'checked_in' as const, time: fmtTime(log.checked_in_at) };
    });

    const order: Record<StudentStatus, number> = { not_arrived: 0, checked_in: 1, checked_out: 2 };
    result.sort((a, b) => order[a.status] - order[b.status]);
    setEntries(result);

    // Room counts (全体)
    const { data: allLogs } = await supabase
      .from('attendance_logs')
      .select('room_id')
      .in('room_id', ['room10', 'glass'])
      .eq('date', today)
      .not('checked_in_at', 'is', null)
      .is('checked_out_at', null);
    const counts: Record<string, number> = {};
    (allLogs ?? []).forEach((l) => {
      if (l.room_id) counts[l.room_id] = (counts[l.room_id] ?? 0) + 1;
    });
    setRoomCounts(counts);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (role !== 'teacher') return;
    fetchData();
    const channel = supabase
      .channel('widget_attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, fetchData]);

  if (!user) return null;

  const notArrived = entries.filter((e) => e.status === 'not_arrived').length;
  const checkedIn = entries.filter((e) => e.status === 'checked_in').length;
  const checkedOut = entries.filter((e) => e.status === 'checked_out').length;

  return (
    <div className="p-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold text-sidebar-foreground">강의실 현황</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">실시간</span>
      </div>

      {/* Room summary cards */}
      <div className="grid grid-cols-2 gap-1.5">
        {ROOMS.map((room) => {
          const count = roomCounts[room.id] ?? 0;
          const cap = capacities[room.id] ?? 8;
          const isFull = count >= cap;
          return (
            <div
              key={room.id}
              className="rounded-md px-2 py-1.5 text-center"
              style={{
                backgroundColor: isFull ? '#FCEBEB' : room.id === 'room10' ? 'hsl(var(--accent))' : 'hsl(var(--muted))',
              }}
            >
              <div className="text-[10px] text-sidebar-foreground/60">{room.label}</div>
              <div
                className="text-sm font-bold"
                style={{ color: isFull ? '#E24B4A' : 'hsl(var(--sidebar-foreground))' }}
              >
                {count} / {cap}
              </div>
            </div>
          );
        })}
      </div>

      {/* Student list */}
      {loading ? (
        <div className="text-[11px] text-sidebar-foreground/50 text-center py-2">로딩 중…</div>
      ) : entries.length === 0 ? (
        <div className="text-[11px] text-sidebar-foreground/50 text-center py-2">배정된 학생 없음</div>
      ) : (
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {entries.map((e) => {
            const isNotArrived = e.status === 'not_arrived';
            const isIn = e.status === 'checked_in';
            const isOut = e.status === 'checked_out';
            return (
              <div
                key={`${e.studentId}_${e.roomId}`}
                className="flex items-center gap-1.5 rounded px-2 py-1"
                style={{
                  backgroundColor: isNotArrived ? '#FCEBEB' : isIn ? '#E1F5EE' : 'hsl(var(--muted))',
                  border: isNotArrived ? '1px solid #E24B4A' : '1px solid transparent',
                  opacity: isOut ? 0.65 : 1,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isNotArrived ? '#E24B4A' : isIn ? '#1D9E75' : '#999' }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium" style={{ color: isNotArrived ? '#791F1F' : isIn ? '#085041' : '#666' }}>
                    {e.studentName}
                  </span>
                  <span className="text-[10px] ml-1" style={{ color: isNotArrived ? '#791F1F' : isIn ? '#085041' : '#999' }}>
                    {e.roomLabel} · {isNotArrived ? '미입실' : isIn ? `입실 ${e.time}` : `퇴실 ${e.time}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary bar */}
      {entries.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-[10px] pt-1">
          <span style={{ color: '#E24B4A' }}>미입실 {notArrived}</span>
          <span className="text-sidebar-foreground/30">|</span>
          <span style={{ color: '#1D9E75' }}>입실 {checkedIn}</span>
          <span className="text-sidebar-foreground/30">|</span>
          <span className="text-sidebar-foreground/50">퇴실 {checkedOut}</span>
        </div>
      )}
    </div>
  );
}
