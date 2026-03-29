import { StudentEntry, ROOMS } from './types';
import { StudentRow } from './StudentRow';

interface AdminViewProps {
  allEntries: StudentEntry[];
  roomCounts: Record<string, number>;
  capacities: Record<string, number>;
  loading: boolean;
}

export function AdminView({ allEntries, roomCounts, capacities, loading }: AdminViewProps) {
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  const totalIn = ROOMS.reduce((sum, r) => sum + (roomCounts[r.id] ?? 0), 0);
  const notArrived = allEntries.filter((e) => e.status === 'not_arrived').length;
  const checkedOut = allEntries.filter((e) => e.status === 'checked_out').length;

  return (
    <div className="bg-sidebar text-sidebar-foreground" style={{ borderRadius: 12 }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 13, fontWeight: 600 }}>전체 현황</span>
          <span style={{ fontSize: 10, color: 'hsl(var(--sidebar-foreground))', opacity: 0.6 }}>{today}</span>
        </div>
      </div>

      {/* Room summary cards */}
      <div style={{ padding: '6px 8px', display: 'flex', gap: 4, borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        {ROOMS.map((room) => {
          const count = roomCounts[room.id] ?? 0;
          const cap = capacities[room.id] ?? 8;
          const full = count >= cap;
          return (
            <div
              key={room.id}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 6, textAlign: 'center',
                backgroundColor: full ? '#FCEBEB' : 'hsl(var(--muted))',
                border: full ? '1px solid #E24B4A' : '1px solid transparent',
              }}
            >
              <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 2 }}>{room.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: full ? '#E24B4A' : '#1D9E75' }}>
                {count}/{cap}
              </div>
            </div>
          );
        })}
      </div>

      {/* All students (read-only) */}
      <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 8px' }}>
        {loading ? (
          <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>로딩 중…</div>
        ) : allEntries.length === 0 ? (
          <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>배정된 학생 없음</div>
        ) : (
          allEntries.map((e) => (
            <StudentRow
              key={`${e.studentId}_${e.roomId}`}
              entry={e}
              readOnly
              showRoom
              showTeacher
            />
          ))
        )}
      </div>

      {/* Summary */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid hsl(var(--sidebar-border))', display: 'flex', justifyContent: 'center', gap: 8, fontSize: 10 }}>
        <span style={{ color: '#1D9E75' }}>총입실 {totalIn}</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span style={{ color: '#E24B4A' }}>미입실 {notArrived}</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span style={{ opacity: 0.5 }}>퇴실 {checkedOut}</span>
      </div>
    </div>
  );
}
