import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useFloatingDrag } from './floating-attendance/useFloatingDrag';
import { useAttendanceData } from './floating-attendance/useAttendanceData';
import { useAttendanceActions } from './floating-attendance/useAttendanceActions';
import { ROLE_COLORS, ROOMS } from './floating-attendance/types';
import { AssistantView } from './floating-attendance/AssistantView';
import { TeacherView } from './floating-attendance/TeacherView';
import { AdminView } from './floating-attendance/AdminView';

export function FloatingAttendanceWidget() {
  const { user, role } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState('room10');
  const { pos, didDrag, onMouseDown, onTouchStart } = useFloatingDrag();

  const effectiveRole = role === 'assistant' || role === 'teacher' || role === 'admin' ? role : null;

  const { entries, setEntries, allEntries, setAllEntries, roomCounts, setRoomCounts, capacities, loading, refetch } = useAttendanceData({
    userId: user?.id,
    role: effectiveRole,
    selectedRoom,
  });

  const { handleCheckIn, handleCheckOut, handleCancelCheckIn, handleCancelCheckOut, loadingIds } = useAttendanceActions(
    user?.id,
    roomCounts,
    capacities,
    { setEntries, setAllEntries, setRoomCounts, refetch }
  );

  // Role guard
  console.log('[FloatingAttendanceWidget] role:', role);
  if (!user) return null;
  if (!effectiveRole) return null;

  const colors = ROLE_COLORS[effectiveRole];
  const totalIn = (roomCounts['room10'] ?? 0) + (roomCounts['glass'] ?? 0);
  const totalCap = (capacities['room10'] ?? 8) + (capacities['glass'] ?? 8);
  const isFull = totalIn >= totalCap;

  const widgetWidth = effectiveRole === 'admin' ? 250 : 220;

  // Mini state
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
          backgroundColor: isFull ? '#FCEBEB' : colors.bg,
          border: `2px solid ${isFull ? '#E24B4A' : colors.border}`,
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
        onClick={() => { if (!didDrag.current) setExpanded(true); }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: isFull ? '#E24B4A' : colors.text, lineHeight: 1.1 }}>
          {totalIn}/{totalCap}
        </span>
        <span style={{ fontSize: 8, color: isFull ? '#E24B4A' : colors.text, fontWeight: 600 }}>입실중</span>
      </div>
    );
  }

  // Expanded state
  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: widgetWidth,
        userSelect: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(false);
        }}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          zIndex: 2,
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(0,0,0,0.15)',
          color: 'white',
          fontSize: 12,
          lineHeight: '18px',
          cursor: 'pointer',
        }}
      >
        ×
      </button>

      {/* Drag handle area over header */}
      <div
        style={{ cursor: 'move', position: 'absolute', top: 0, left: 0, right: 0, height: 36, zIndex: 1 }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      />

      {effectiveRole === 'assistant' && (
        <AssistantView
          selectedRoom={selectedRoom}
          onSelectRoom={setSelectedRoom}
          entries={entries}
          roomCounts={roomCounts}
          capacities={capacities}
          loading={loading}
          loadingIds={loadingIds}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onCancelCheckIn={handleCancelCheckIn}
          onCancelCheckOut={handleCancelCheckOut}
        />
      )}

      {effectiveRole === 'teacher' && (
        <TeacherView
          entries={allEntries}
          loading={loading}
          loadingIds={loadingIds}
          teacherName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onCancelCheckIn={handleCancelCheckIn}
          onCancelCheckOut={handleCancelCheckOut}
        />
      )}

      {effectiveRole === 'admin' && (
        <AdminView
          allEntries={allEntries}
          roomCounts={roomCounts}
          capacities={capacities}
          loading={loading}
          loadingIds={loadingIds}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onCancelCheckIn={handleCancelCheckIn}
          onCancelCheckOut={handleCancelCheckOut}
        />
      )}
    </div>
  );
}
