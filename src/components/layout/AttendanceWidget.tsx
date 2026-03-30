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

    const { data: capData } = await supabase
      .from('room_capacities')
      .select('room_id, capacity, label');
    const capMap: Record<string, number> = {};
    (capData ?? []).forEach((r) => {
      capMap[r.room_id] = r.capacity;
    });
    setCapacities(capMap);

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

    const { data: assigned } = await supabase
      .from('room_assignments')
      .select('student_ids, student_names, room')
      .in('room', ['room10', 'glass'])
      .or(
        `and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${today})`
      );

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
    if (!user?.id) return;
    fetchData();
    const channel = supabase
      .channel('widget_attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchData]);

  if (!user) return null;

  const notArrived = entries.filter((e) => e.status === 'not_arrived').length;
  const checkedIn = entries.filter((e) => e.status === 'checked_in').length;
  const checkedOut = entries.filter((e) => e.status === 'checked_out').length;

  // Per-room breakdown for summary cards
  const roomBreakdown = (roomId: string) => {
    const roomEntries = entries.filter((e) => e.roomId === roomId);
    return {
      in: roomEntries.filter((e) => e.status === 'checked_in').length,
      na: roomEntries.filter((e) => e.status === 'not_arrived').length,
      out: roomEntries.filter((e) => e.status === 'checked_out').length,
    };
  };

  return (
    <div
      style={{
        padding: 10,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>강의실 현황</span>
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: 'rgba(126,255,212,0.15)', color: '#7effd4', fontWeight: 500 }}>실시간</span>
      </div>

      {/* Room summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        {ROOMS.map((room) => {
          const count = roomCounts[room.id] ?? 0;
          const cap = capacities[room.id] ?? 8;
          const isFull = count >= cap;
          const bd = roomBreakdown(room.id);
          const hasNotArrived = bd.na > 0;

          return (
            <div
              key={room.id}
              style={{
                borderRadius: 8,
                padding: '8px 10px',
                textAlign: 'center',
                background: isFull || hasNotArrived
                  ? 'rgba(231,76,60,0.25)'
                  : count > 0
                  ? 'rgba(29,158,117,0.25)'
                  : 'rgba(255,255,255,0.08)',
                border: isFull ? '1px solid rgba(231,76,60,0.6)' : '1px solid transparent',
              }}
            >
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{room.label}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: isFull ? '#ffaaaa' : '#7effd4' }}>
                입실 {count}명
              </div>
              <div style={{ fontSize: 10, marginTop: 2, display: 'flex', justifyContent: 'center', gap: 8 }}>
                <span style={{ color: '#ffaaaa' }}>미입실 {bd.na}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>퇴실 {bd.out}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Student list */}
      {loading ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 8 }}>로딩 중…</div>
      ) : entries.length === 0 ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 8 }}>배정된 학생 없음</div>
      ) : (
        <div style={{ maxHeight: 160, overflowY: 'auto' }} className="space-y-0.5">
          {entries.map((e) => {
            const isNA = e.status === 'not_arrived';
            const isIn = e.status === 'checked_in';
            const isOut = e.status === 'checked_out';
            return (
              <div
                key={`${e.studentId}_${e.roomId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  padding: '5px 8px',
                  opacity: isOut ? 0.4 : 1,
                  background: isNA
                    ? 'rgba(231,76,60,0.15)'
                    : isIn
                    ? 'rgba(29,158,117,0.15)'
                    : 'transparent',
                  borderLeft: isNA
                    ? '3px solid #E24B4A'
                    : isIn
                    ? '3px solid #1D9E75'
                    : '3px solid rgba(255,255,255,0.2)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: isNA ? '#ffaaaa' : isIn ? '#7effd4' : 'rgba(255,255,255,0.6)',
                  }}>
                    {e.studentName}
                  </span>
                  <span style={{
                    fontSize: 10,
                    marginLeft: 4,
                    color: isNA ? '#ffaaaa' : isIn ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)',
                  }}>
                    {e.roomLabel} · {isNA ? '미입실' : isIn ? `입실 ${e.time}` : `퇴실 ${e.time}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary bar */}
      {entries.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 10, paddingTop: 6 }}>
          <span style={{ color: '#ffaaaa', fontWeight: 500 }}>미입실 {notArrived}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ color: '#7effd4', fontWeight: 500 }}>입실 {checkedIn}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>퇴실 {checkedOut}</span>
        </div>
      )}
    </div>
  );
}
