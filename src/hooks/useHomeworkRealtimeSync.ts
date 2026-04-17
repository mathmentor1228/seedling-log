// HW-REALTIME-SYNC-V1: Subscribe to homework_assignments / homework_submissions / lesson_records
// changes so that homework check status stays in sync across:
//  - Assistant page (AssistantDashboard)
//  - Teacher dashboard roster
//  - Lessons > Batch input tab
//  - DailyHomeworkChecklist
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseHomeworkRealtimeSyncOptions {
  /** Called whenever any homework-related change is observed */
  onChange: () => void;
  /** Disable the subscription (e.g. while a modal is closed) */
  enabled?: boolean;
  /** Debounce window in ms to coalesce bursts of changes */
  debounceMs?: number;
  /** Stable channel suffix (per-screen) so multiple screens get their own channel */
  channelKey: string;
}

export function useHomeworkRealtimeSync({
  onChange,
  enabled = true,
  debounceMs = 400,
  channelKey,
}: UseHomeworkRealtimeSyncOptions) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callbackRef.current?.();
      }, debounceMs);
    };

    const channel = supabase
      .channel(`hw-sync-${channelKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homework_assignments' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homework_submissions' }, trigger)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lesson_records' }, (payload: any) => {
        // Only re-fetch if the homework_status actually changed (reduces noise)
        const oldStatus = payload?.old?.homework_status;
        const newStatus = payload?.new?.homework_status;
        const oldNote = payload?.old?.homework_check_note;
        const newNote = payload?.new?.homework_check_note;
        if (oldStatus !== newStatus || oldNote !== newNote) {
          trigger();
        }
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, debounceMs, channelKey]);
}
