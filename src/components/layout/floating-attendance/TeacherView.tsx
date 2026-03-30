import { StudentEntry } from './types';
import { StudentRow } from './StudentRow';

interface TeacherViewProps {
  entries: StudentEntry[];
  loading: boolean;
  loadingIds: Set<string>;
  teacherName: string;
  onCheckIn: (studentId: string, roomId: string) => void;
  onCheckOut: (logId: string) => void;
  onCancelCheckIn: (logId: string) => void;
  onCancelCheckOut: (logId: string) => void;
}

export function TeacherView({
  entries,
  loading,
  loadingIds,
  teacherName,
  onCheckIn,
  onCheckOut,
  onCancelCheckIn,
  onCancelCheckOut,
}: TeacherViewProps) {
  // Combine all rooms, show room label per student
  const allEntries = entries;
  const notArrived = allEntries.filter((e) => e.status === 'not_arrived').length;
  const checkedIn = allEntries.filter((e) => e.status === 'checked_in').length;
  const checkedOut = allEntries.filter((e) => e.status === 'checked_out').length;

  return (
    <div className="bg-sidebar text-sidebar-foreground" style={{ borderRadius: 12 }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 13, fontWeight: 600 }}>내 학생 현황</span>
          <span style={{ fontSize: 10, color: 'hsl(var(--sidebar-foreground))', opacity: 0.6 }}>{teacherName}</span>
        </div>
      </div>

      {/* Student list */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 8px' }}>
        {loading ? (
          <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>로딩 중…</div>
        ) : allEntries.length === 0 ? (
          <div style={{ fontSize: 11, textAlign: 'center', padding: 12, opacity: 0.5 }}>오늘 배정된 학생 없음</div>
        ) : (
          allEntries.map((e) => (
            <StudentRow
              key={`${e.studentId}_${e.roomId}`}
              entry={e}
              showRoom
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              onCancelCheckIn={onCancelCheckIn}
              onCancelCheckOut={onCancelCheckOut}
            />
          ))
        )}
      </div>

      {/* Summary */}
      {allEntries.length > 0 && (
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
