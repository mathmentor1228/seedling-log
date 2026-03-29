import { StudentEntry } from './types';

interface StudentRowProps {
  entry: StudentEntry;
  readOnly?: boolean;
  showRoom?: boolean;
  showTeacher?: boolean;
  onCheckIn?: (studentId: string, roomId: string) => void;
  onCheckOut?: (logId: string) => void;
  onCancelCheckIn?: (logId: string) => void;
  onCancelCheckOut?: (logId: string) => void;
}

export function StudentRow({
  entry: e,
  readOnly = false,
  showRoom = false,
  showTeacher = false,
  onCheckIn,
  onCheckOut,
  onCancelCheckIn,
  onCancelCheckOut,
}: StudentRowProps) {
  const isNA = e.status === 'not_arrived';
  const isIn = e.status === 'checked_in';
  const isOut = e.status === 'checked_out';

  const statusText = isNA
    ? '미입실'
    : isIn
    ? `입실 ${e.time}`
    : `퇴실 ${e.time}`;

  const roomText = showRoom ? `${e.roomLabel} · ` : '';
  const teacherInitial = showTeacher && e.teacherName ? e.teacherName.charAt(0) : '';

  return (
    <div
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
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: isNA ? '#E24B4A' : isIn ? '#1D9E75' : '#999',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: isNA ? '#791F1F' : isIn ? '#085041' : '#666' }}>
          {showTeacher && teacherInitial && (
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: 'hsl(var(--accent))',
                textAlign: 'center',
                lineHeight: '14px',
                fontSize: 8,
                fontWeight: 700,
                marginRight: 3,
                verticalAlign: 'middle',
              }}
            >
              {teacherInitial}
            </span>
          )}
          {e.studentName}
        </span>
        <span style={{ fontSize: 10, marginLeft: 4, color: isNA ? '#791F1F' : isIn ? '#085041' : '#999' }}>
          {roomText}{statusText}
        </span>
      </div>
      {!readOnly && (
        <div className="flex gap-1 flex-shrink-0">
          {isNA && onCheckIn && (
            <button
              onClick={() => onCheckIn(e.studentId, e.roomId)}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#E1F5EE', border: '1px solid #1D9E75', color: '#1D9E75', fontWeight: 600, cursor: 'pointer' }}
            >
              입실
            </button>
          )}
          {isIn && (
            <>
              {onCheckOut && (
                <button
                  onClick={() => e.logId && onCheckOut(e.logId)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#FCEBEB', border: '1px solid #E24B4A', color: '#E24B4A', fontWeight: 600, cursor: 'pointer' }}
                >
                  퇴실
                </button>
              )}
              {onCancelCheckIn && (
                <button
                  onClick={() => e.logId && onCancelCheckIn(e.logId)}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
                >
                  취소
                </button>
              )}
            </>
          )}
          {isOut && onCancelCheckOut && (
            <button
              onClick={() => e.logId && onCancelCheckOut(e.logId)}
              style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
            >
              퇴실취소
            </button>
          )}
        </div>
      )}
    </div>
  );
}
