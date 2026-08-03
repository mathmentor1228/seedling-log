import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback } from 'react';
import { StudentEntry, fmtTime } from './types';
import { toast } from 'sonner';
import { getTodayKST } from '@/lib/utils';

interface OptimisticSetters {
  setEntries: React.Dispatch<React.SetStateAction<StudentEntry[]>>;
  setAllEntries: React.Dispatch<React.SetStateAction<StudentEntry[]>>;
  setRoomCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  refetch: () => Promise<void>;
}

function updateEntryInList(
  list: StudentEntry[],
  studentId: string,
  roomId: string,
  updater: (e: StudentEntry) => StudentEntry
): StudentEntry[] {
  return list.map(e =>
    e.studentId === studentId && e.roomId === roomId ? updater(e) : e
  );
}

function updateEntryByLogId(
  list: StudentEntry[],
  logId: string,
  updater: (e: StudentEntry) => StudentEntry
): StudentEntry[] {
  return list.map(e => (e.logId === logId ? updater(e) : e));
}

export function useAttendanceActions(
  userId: string | undefined,
  roomCounts: Record<string, number>,
  capacities: Record<string, number>,
  setters: OptimisticSetters
) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const addLoading = (id: string) =>
    setLoadingIds(prev => new Set(prev).add(id));
  const removeLoading = (id: string) =>
    setLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });

  const handleCheckIn = useCallback(async (studentId: string, roomId: string) => {
    if (!userId) {
      toast.error('로그인 정보를 확인할 수 없습니다');
      return;
    }
    const cap = capacities[roomId] ?? 999;
    const currentCount = roomCounts[roomId] ?? 0;
    if (currentCount >= cap) {
      alert('해당 강의실은 만석입니다. 원장과 상의해 주세요.');
      return;
    }

    const now = new Date().toISOString();
    const today = getTodayKST();
    const timeStr = fmtTime(now);

    // Optimistic update
    const updater = (e: StudentEntry): StudentEntry => ({
      ...e,
      status: 'checked_in',
      time: timeStr,
      logId: e.logId || `temp-${studentId}`,
    });
    setters.setEntries(prev => updateEntryInList(prev, studentId, roomId, updater));
    setters.setAllEntries(prev => updateEntryInList(prev, studentId, roomId, updater));
    setters.setRoomCounts(prev => ({ ...prev, [roomId]: (prev[roomId] ?? 0) + 1 }));
    addLoading(studentId);

    try {
      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('date', today)
        .eq('room_id', roomId)
        .maybeSingle();

      let persistedLogId: string;
      if (existing) {
        const { error } = await supabase.from('attendance_logs')
          .update({ checked_in_at: now, checked_out_at: null })
          .eq('id', existing.id);
        if (error) throw error;
        persistedLogId = existing.id;
      } else {
        const { data: inserted, error } = await supabase
          .from('attendance_logs')
          .insert({
            student_id: studentId,
            room_id: roomId,
            date: today,
            checked_in_at: now,
            recorded_by: userId,
          })
          .select('id')
          .single();
        if (error) throw error;
        persistedLogId = inserted.id;
      }

      const syncPersistedId = (e: StudentEntry): StudentEntry => ({ ...e, logId: persistedLogId });
      setters.setEntries(prev => updateEntryInList(prev, studentId, roomId, syncPersistedId));
      setters.setAllEntries(prev => updateEntryInList(prev, studentId, roomId, syncPersistedId));
    } catch {
      // Rollback
      await setters.refetch();
      toast.error('저장 실패 — 다시 시도해주세요');
    } finally {
      removeLoading(studentId);
    }
  }, [userId, roomCounts, capacities, setters]);

  const handleCheckOut = useCallback(async (logId: string) => {
    const now = new Date().toISOString();
    const timeStr = fmtTime(now);

    // Find entry to get roomId for count update
    const updater = (e: StudentEntry): StudentEntry => ({
      ...e,
      status: 'checked_out',
      time: timeStr,
    });
    let roomId: string | undefined;
    setters.setEntries(prev => {
      const entry = prev.find(e => e.logId === logId);
      if (entry) roomId = entry.roomId;
      return updateEntryByLogId(prev, logId, updater);
    });
    setters.setAllEntries(prev => updateEntryByLogId(prev, logId, updater));
    if (roomId) {
      const resolvedRoomId = roomId;
      setters.setRoomCounts(prev => ({ ...prev, [resolvedRoomId]: Math.max((prev[resolvedRoomId] ?? 0) - 1, 0) }));
    }
    addLoading(logId);

    try {
      const { error } = await supabase.from('attendance_logs')
        .update({ checked_out_at: now })
        .eq('id', logId);
      if (error) throw error;
    } catch {
      await setters.refetch();
      toast.error('저장 실패 — 다시 시도해주세요');
    } finally {
      removeLoading(logId);
    }
  }, [setters]);

  const handleCancelCheckIn = useCallback(async (logId: string) => {
    let roomId: string | undefined;
    const updater = (e: StudentEntry): StudentEntry => {
      roomId = e.roomId;
      return { ...e, status: 'not_arrived', time: undefined, logId: undefined };
    };
    setters.setEntries(prev => updateEntryByLogId(prev, logId, updater));
    setters.setAllEntries(prev => updateEntryByLogId(prev, logId, updater));
    if (roomId) {
      const resolvedRoomId = roomId;
      setters.setRoomCounts(prev => ({ ...prev, [resolvedRoomId]: Math.max((prev[resolvedRoomId] ?? 0) - 1, 0) }));
    }
    addLoading(logId);

    try {
      const { error } = await supabase.from('attendance_logs')
        .update({ checked_in_at: null, checked_out_at: null })
        .eq('id', logId);
      if (error) throw error;
    } catch {
      await setters.refetch();
      toast.error('저장 실패 — 다시 시도해주세요');
    } finally {
      removeLoading(logId);
    }
  }, [setters]);

  const handleCancelCheckOut = useCallback(async (logId: string) => {
    let roomId: string | undefined;
    const updater = (e: StudentEntry): StudentEntry => {
      roomId = e.roomId;
      return { ...e, status: 'checked_in', time: fmtTime(new Date().toISOString()) };
    };
    setters.setEntries(prev => updateEntryByLogId(prev, logId, updater));
    setters.setAllEntries(prev => updateEntryByLogId(prev, logId, updater));
    if (roomId) {
      const resolvedRoomId = roomId;
      setters.setRoomCounts(prev => ({ ...prev, [resolvedRoomId]: (prev[resolvedRoomId] ?? 0) + 1 }));
    }
    addLoading(logId);

    try {
      const { error } = await supabase.from('attendance_logs')
        .update({ checked_out_at: null })
        .eq('id', logId);
      if (error) throw error;
    } catch {
      await setters.refetch();
      toast.error('저장 실패 — 다시 시도해주세요');
    } finally {
      removeLoading(logId);
    }
  }, [setters]);

  return { handleCheckIn, handleCheckOut, handleCancelCheckIn, handleCancelCheckOut, loadingIds };
}
