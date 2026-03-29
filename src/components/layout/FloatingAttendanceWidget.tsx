import { useState, useEffect, useCallback, useRef } from 'react';
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
  logId?: string;
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

export function FloatingAttendanceWidget() {
  const { user, role } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState('room10');
  const [entries, setEntries] = useState<StudentEntry[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Drag state
  const [pos, setPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 80 : 0, y: typeof window !== 'undefined' ? window.innerHeight - 120 : 0 });
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      didDrag.current = true;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Touch drag support
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      didDrag.current = true;
      const t = e.touches[0];
      setPos({ x: t.clientX - offset.current.x, y: t.clientY - offset.current.y });
    };
    const onTouchEnd = () => { dragging.current = false; };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    didDrag.current = false;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const onTouchStart = (e: React.TouchEvent) => {
    dragging.current = true;
    didDrag.current = false;
    const t = e.touches[0];
    offset.current = { x: t.clientX - pos.x, y: t.clientY - pos.y };
  };

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = getDayOfWeek(today);

    const { data: capData } = await supabase
      .from('room_capacities')
      .select('room_id, capacity');
    const capMap: Record<string, number> = {};
    (capData ?? []).forEach((r) => { capMap[r.room_id] = r.capacity; });
    setCapacities(capMap);

    // All assignments for both rooms
    const { data: assigned } = await supabase
      .from('room_assignments')
      .select('student_ids, student_names, room')
      .in('room', ['room10', 'glass'])
      .or(`and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${today})`);

    interface AssignedStudent { studentId: string; studentName: string; roomId: string; }
    const assignedStudents: AssignedStudent[] = [];
    const seenKeys = new Set<string>();
    (assigned ?? []).forEach((a) => {
      const ids = (a.student_ids ?? []) as string[];
      const names = (a.student_names ?? []) as string[];
      ids.forEach((id: string, i: number) => {
        const key = `${id}_${a.room}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          assignedStudents.push({ studentId: id, studentName: names[i] ?? '이름없음', roomId: a.room });
        }
      });
    });

    // All logs
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('id, student_id, room_id, checked_in_at, checked_out_at')
      .in('room_id', ['room10', 'glass'])
      .eq('date', today);

    const logMap = new Map<string, { id: string; checked_in_at: string | null; checked_out_at: string | null }>();
    (logs ?? []).forEach((l) => {
      logMap.set(`${l.student_id}_${l.room_id}`, { id: l.id, checked_in_at: l.checked_in_at, checked_out_at: l.checked_out_at });
    });

    const result: StudentEntry[] = assignedStudents.map((s) => {
      const log = logMap.get(`${s.studentId}_${s.roomId}`);
      const roomLabel = ROOMS.find((r) => r.id === s.roomId)?.label ?? s.roomId;
      if (!log || !log.checked_in_at) {
        return { studentId: s.studentId, studentName: s.studentName, roomId: s.roomId, roomLabel, status: 'not_arrived' as const, logId: log?.id };
      }
      if (log.checked_out_at) {
        return { studentId: s.studentId, studentName: s.studentName, roomId: s.roomId, roomLabel, status: 'checked_out' as const, time: fmtTime(log.checked_out_at), logId: log.id };
      }
      return { studentId: s.studentId, studentName: s.studentName, roomId: s.roomId, roomLabel, status: 'checked_in' as const, time: fmtTime(log.checked_in_at), logId: log.id };
    });

    const order: Record<StudentStatus, number> = { not_arrived: 0, checked_in: 1, checked_out: 2 };
    result.sort((a, b) => order[a.status] - order[b.status]);
    setEntries(result);

    // Room counts
    const counts: Record<string, number> = {};
    (logs ?? []).forEach((l) => {
      if (l.checked_in_at && !l.checked_out_at && l.room_id) {
        counts[l.room_id] = (counts[l.room_id] ?? 0) + 1;
      }
    });
    setRoomCounts(counts);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchData();
    const channel = supabase
      .channel('floating_widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchData]);

  // Actions
  const handleCheckIn = async (studentId: string, roomId: string) => {
    const cap = capacities[roomId] ?? 999;
    const currentCount = roomCounts[roomId] ?? 0;
    if (currentCount >= cap) {
      alert('해당 강의실은 만석입니다. 원장과 상의해 주세요.');
      return;
    }
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const { data: existing } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('student_id', studentId)
      .eq('date', today)
      .eq('room_id', roomId)
      .maybeSingle();
    if (existing) {
      await supabase.from('attendance_logs').update({ checked_in_at: now, checked_out_at: null }).eq('id', existing.id);
    } else {
      await supabase.from('attendance_logs').insert({
        student_id: studentId,
        room_id: roomId,
        date: today,
        checked_in_at: now,
        recorded_by: user!.id,
      });
    }
  };

  const handleCheckOut = async (logId: string) => {
    await supabase.from('attendance_logs').update({ checked_out_at: new Date().toISOString() }).eq('id', logId);
  };

  const handleCancelCheckIn = async (logId: string) => {
    await supabase.from('attendance_logs').update({ checked_in_at: null, checked_out_at: null }).eq('id', logId);
  };

  const handleCancelCheckOut = async (logId: string) => {
    await supabase.from('attendance_logs').update({ checked_out_at: null }).eq('id', logId);
  };

  // Role guard
  console.log('[FloatingAttendanceWidget] role:', role);
  if (!user) return null;
  if (role && role !== 'assistant' && role !== 'admin') return null;

  const totalIn = (roomCounts['room10'] ?? 0) + (roomCounts['glass'] ?? 0);
  const totalCap = (capacities['room10'] ?? 8) + (capacities['glass'] ?? 8);
  const isFull = totalIn >= totalCap;

  const filteredEntries = entries.filter((e) => e.roomId === selectedRoom);
  const notArrived = filteredEntries.filter((e) => e.status === 'not_arrived').length;
  const checkedIn = filteredEntries.filter((e) => e.status === 'checked_in').length;
  const checkedOut = filteredEntries.filter((e) => e.status === 'checked_out').length;
  const roomIn = roomCounts[selectedRoom] ?? 0;
  const roomCap = capacities[selectedRoom] ?? 8;
  const roomFull = roomIn >= roomCap;

  if (!expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 9999,
          width: 52,
          height: 52,
          borderRadius: '50%',
          backgroundColor: isFull ? '#FCEBEB' : '#E1F5EE',
          border: `2px solid ${isFull ? '#E24B4A' : '#1D9E75'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          userSelect: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onMouseEnter={() => { if (!dragging.current) setExpanded(true); }}
        onClick={() => { if (!didDrag.current) setExpanded(true); }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: isFull ? '#E24B4A' : '#1D9E75', lineHeight: 1.1 }}>
          {totalIn}/{totalCap}
        </span>
        <span style={{ fontSize: 8, color: isFull ? '#E24B4A' : '#1D9E75', fontWeight: 600 }}>입실중</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: 280,
        userSelect: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className="bg-sidebar text-sidebar-foreground"
        style={{ borderRadius: 12 }}
      >
        {/* Header - drag handle */}
        <div
          style={{ cursor: 'move', padding: '8px 12px', borderBottom: '1px solid hsl(var(--sidebar-border))' }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: 13, fontWeight: 600 }}>강의실 현황</span>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 9, backgroundColor: 'rgba(29,158,117,0.2)', color: '#1D9E75', fontWeight: 600 }}>실시간</span>
          </div>
          {/* Room tabs */}
          <div className="flex gap-1">
            {ROOMS.map((room) => (
              <button
                key={room.id}
                onClick={(e) => { e.stopPropagation(); setSelectedRoom(room.id); }}
                style={{
                  fontSize: 11,
                  padding: '2px 10px',
                  borderRadius: 6,
                  border: 'none',
                  fontWeight: selectedRoom === room.id ? 600 : 400,
                  backgroundColor: selectedRoom === room.id ? 'hsl(var(--accent))' : 'transparent',
                  color: 'hsl(var(--sidebar-foreground))',
                  cursor: 'pointer',
                }}
              >
                {room.label}
              </button>
            ))}
          </div>
        </div>

        {/* Room summary */}
        <div style={{ padding: '6px 12px', borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: 'hsl(var(--sidebar-foreground))', opacity: 0.7 }}>현재입실</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: roomFull ? '#E24B4A' : '#1D9E75' }}>
              {roomIn} / {roomCap}
            </span>
            {roomFull && <span style={{ fontSize: 9, color: '#E24B4A', fontWeight: 600 }}>만석</span>}
          </div>
        </div>

        {/* Student list */}
        <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 8px' }}>
          {loading ? (
            <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>로딩 중…</div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>배정된 학생 없음</div>
          ) : (
            filteredEntries.map((e) => {
              const isNA = e.status === 'not_arrived';
              const isIn = e.status === 'checked_in';
              const isOut = e.status === 'checked_out';
              return (
                <div
                  key={`${e.studentId}_${e.roomId}`}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: '5px 8px',
                    marginBottom: 2,
                    borderRadius: 6,
                    backgroundColor: isNA ? '#FCEBEB' : isIn ? '#E1F5EE' : 'hsl(var(--muted))',
                    border: isNA ? '1px solid #E24B4A' : '1px solid transparent',
                    opacity: isOut ? 0.55 : 1,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: isNA ? '#E24B4A' : isIn ? '#1D9E75' : '#999' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: isNA ? '#791F1F' : isIn ? '#085041' : '#666' }}>
                      {e.studentName}
                    </span>
                    <span style={{ fontSize: 10, marginLeft: 4, color: isNA ? '#791F1F' : isIn ? '#085041' : '#999' }}>
                      {isNA ? '미입실' : isIn ? `입실 ${e.time}` : `퇴실 ${e.time}`}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {isNA && (
                      <button
                        onClick={() => handleCheckIn(e.studentId, e.roomId)}
                        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#E1F5EE', border: '1px solid #1D9E75', color: '#1D9E75', fontWeight: 600, cursor: 'pointer' }}
                      >
                        입실
                      </button>
                    )}
                    {isIn && (
                      <>
                        <button
                          onClick={() => e.logId && handleCheckOut(e.logId)}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#FCEBEB', border: '1px solid #E24B4A', color: '#E24B4A', fontWeight: 600, cursor: 'pointer' }}
                        >
                          퇴실
                        </button>
                        <button
                          onClick={() => e.logId && handleCancelCheckIn(e.logId)}
                          style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
                        >
                          취소
                        </button>
                      </>
                    )}
                    {isOut && (
                      <button
                        onClick={() => e.logId && handleCancelCheckOut(e.logId)}
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
                      >
                        퇴실취소
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary bar */}
        {filteredEntries.length > 0 && (
          <div style={{ padding: '6px 12px', borderTop: '1px solid hsl(var(--sidebar-border))', display: 'flex', justifyContent: 'center', gap: 8, fontSize: 10 }}>
            <span style={{ color: '#E24B4A' }}>미입실 {notArrived}</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span style={{ color: '#1D9E75' }}>입실 {checkedIn}</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span style={{ opacity: 0.5 }}>퇴실 {checkedOut}</span>
          </div>
        )}
      </div>
    </div>
  );
}
