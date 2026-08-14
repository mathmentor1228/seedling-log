import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Megaphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const DISMISS_KEY = 'publicAnnouncementDismissed_v1';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(s: Set<string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...s]));
}

export function PublicAnnouncementBar() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed());
  const [activeIdx, setActiveIdx] = useState(0);

  const fetchItems = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('system_announcements')
      .select('*')
      .eq('is_active', true)
      .eq('visibility', 'public')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(10);
    setItems((data ?? []) as Announcement[]);
  }, []);

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel('public-announcements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_announcements' },
        () => fetchItems()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  useEffect(() => {
    const visible = items.filter((i) => !dismissed.has(i.id));
    if (visible.length <= 1) {
      setActiveIdx(0);
      return;
    }
    const id = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % visible.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [items, dismissed]);

  const visible = items.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  const current = visible[activeIdx % visible.length];
  const isCritical = current.severity === 'critical';
  const isWarning = current.severity === 'warning';

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div
      className={cn(
        'border-b shadow-md',
        isCritical && 'bg-destructive text-destructive-foreground border-destructive animate-pulse-strong',
        isWarning && 'bg-destructive/90 text-destructive-foreground border-destructive/80 animate-pulse-strong',
        !isCritical && !isWarning && 'bg-primary text-primary-foreground border-primary/80'
      )}
    >
      <div className="max-w-7xl mx-auto px-3 lg:px-4 py-2.5 flex items-center gap-3">
        <Megaphone className={cn('w-4 h-4 flex-shrink-0', (isCritical || isWarning) && 'animate-bounce')} />
        <div className="flex-1 min-w-0 text-sm flex items-baseline gap-2 flex-wrap">
          <span className="font-bold">{current.title}</span>
          <span className="opacity-95">{current.message}</span>
        </div>
        {visible.length > 1 && (
          <span className="text-[10px] opacity-80 font-mono flex-shrink-0">
            {(activeIdx % visible.length) + 1}/{visible.length}
          </span>
        )}
        <button
          onClick={() => handleDismiss(current.id)}
          className="p-1 rounded hover:bg-background/20 transition-colors flex-shrink-0"
          title="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
