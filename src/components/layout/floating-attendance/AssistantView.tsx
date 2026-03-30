import { useState } from 'react';
import { StudentEntry, ROOMS, getCurrentSlot } from './types';
import { StudentRow } from './StudentRow';
import { supabase } from '@/integrations/supabase/client';

interface AssistantViewProps {
  selectedRoom: string;
  onSelectRoom: (room: string) => void;
  entries: StudentEntry[];
  roomCounts: Record<string, number>;
  capacities: Record<string, number>;
  loading: boolean;
  loadingIds: Set<string>;
  onCheckIn: (studentId: string, roomId: string) => void;
  onCheckOut: (logId: string) => void;
  onCancelCheckIn: (logId: string) => void;
  onCancelCheckOut: (logId: string) => void;
}

export function AssistantView({
  selectedRoom,
  onSelectRoom,
  entries,
  roomCounts,
  capacities,
  loading,
  loadingIds,
  onCheckIn,
  onCheckOut,
  onCancelCheckIn,
  onCancelCheckOut,
}: AssistantViewProps) {
  const [showOther, setShowOther] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const roomIn = roomCounts[selectedRoom] ?? 0;
  const roomCap = capacities[selectedRoom] ?? 8;
  const roomFull = roomIn >= roomCap;

  // Split entries by current time slot proximity
  const now = new Date();
  const currentSlot = getCurrentSlot(now);
  const currentEntries = entries.filter((e) => {
    if (!e.slotStart) return true; // no slot info → show as current
    const slotMinutes = parseInt(e.slotStart.split(':')[0]) * 60 + parseInt(e.slotStart.split(':')[1]);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = slotMinutes - nowMinutes;
    return diff >= -30 && diff <= 60;
  });
  const otherEntries = entries.filter((e) => !currentEntries.includes(e));

  const notArrived = entries.filter((e) => e.status === 'not_arrived').length;
  const checkedIn = entries.filter((e) => e.status === 'checked_in').length;
  const checkedOut = entries.filter((e) => e.status === 'checked_out').length;

  const handleSearch = async (name: string) => {
    setSearchName(name);
    if (name.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('students')
      .select('id, name')
      .ilike('name', `%${name}%`)
      .limit(5);
    setSearchResults(data ?? []);
    setSearching(false);
  };

  const handleGuerillaAdd = async (studentId: string, studentName: string) => {
    const today = new Date().toISOString().split('T')[0];
    const { getDayOfWeek } = await import('./types');
    await supabase.from('room_assignments').insert({
      student_ids: [studentId],
      student_names: [studentName],
      room: selectedRoom,
      day: getDayOfWeek(today),
      slot_start: currentSlot,
      slot_end: (() => {
        const [h, m] = currentSlot.split(':').map(Number);
        const totalMin = h * 60 + m + 60;
        return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
      })(),
      span: 2,
      is_fixed: false,
      assigned_date: today,
    });
    setSearchName('');
    setSearchResults([]);
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground" style={{ borderRadius: 12 }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontSize: 13, fontWeight: 600 }}>입퇴실 관리</span>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 9, backgroundColor: 'rgba(29,158,117,0.2)', color: '#1D9E75', fontWeight: 600 }}>실시간</span>
        </div>
        <div className="flex gap-1">
          {ROOMS.map((room) => (
            <button
              key={room.id}
              onClick={(e) => { e.stopPropagation(); onSelectRoom(room.id); }}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 6, border: 'none',
                fontWeight: selectedRoom === room.id ? 600 : 400,
                backgroundColor: selectedRoom === room.id ? 'hsl(var(--accent))' : 'transparent',
                color: 'hsl(var(--sidebar-foreground))', cursor: 'pointer',
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
          <span style={{ fontSize: 11, opacity: 0.7 }}>현재입실</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: roomFull ? '#E24B4A' : '#1D9E75' }}>
            {roomIn} / {roomCap}
          </span>
          {roomFull && <span style={{ fontSize: 9, color: '#E24B4A', fontWeight: 600 }}>만석</span>}
        </div>
      </div>

      {/* Student list */}
      <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 8px' }}>
        {loading ? (
          <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>로딩 중…</div>
        ) : currentEntries.length === 0 && otherEntries.length === 0 ? (
          <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>배정된 학생 없음</div>
        ) : (
          <>
            {currentEntries.map((e) => (
              <StudentRow
                key={`${e.studentId}_${e.roomId}`}
                entry={e}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                onCancelCheckIn={onCancelCheckIn}
                onCancelCheckOut={onCancelCheckOut}
              />
            ))}
            {otherEntries.length > 0 && !showOther && (
              <button
                onClick={() => setShowOther(true)}
                style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', padding: '4px 8px', cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'center' }}
              >
                더보기 (다른 시간대 {otherEntries.length}명)
              </button>
            )}
            {showOther && otherEntries.map((e) => (
              <StudentRow
                key={`${e.studentId}_${e.roomId}`}
                entry={e}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                onCancelCheckIn={onCancelCheckIn}
                onCancelCheckOut={onCancelCheckOut}
              />
            ))}
          </>
        )}
      </div>

      {/* Guerrilla add */}
      <div style={{ padding: '6px 8px', borderTop: '1px solid hsl(var(--sidebar-border))' }}>
        <input
          type="text"
          placeholder="학생 즉석 추가…"
          value={searchName}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            width: '100%', fontSize: 10, padding: '4px 8px', borderRadius: 4,
            border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))', outline: 'none',
          }}
        />
        {searchResults.length > 0 && (
          <div style={{ marginTop: 2 }}>
            {searchResults.map((s) => (
              <button
                key={s.id}
                onClick={() => handleGuerillaAdd(s.id, s.name)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', fontSize: 10,
                  padding: '3px 8px', cursor: 'pointer', background: 'none',
                  border: 'none', color: 'hsl(var(--foreground))',
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = 'hsl(var(--accent))'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        {searchName.length >= 2 && !searching && searchResults.length === 0 && (
          <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', padding: '3px 8px' }}>
            검색 결과 없음
          </div>
        )}
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid hsl(var(--sidebar-border))', display: 'flex', justifyContent: 'center', gap: 8, fontSize: 10 }}>
          <span style={{ color: '#E24B4A' }}>미입실 {notArrived}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span style={{ color: '#1D9E75' }}>입실 {checkedIn}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span style={{ opacity: 0.5 }}>퇴실 {checkedOut}</span>
        </div>
      )}
    </div>
  );
}
