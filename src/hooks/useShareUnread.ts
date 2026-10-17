// SHARE-CHANNEL-V1: 사이드바 "자료·전달" 배지 + 새 글 토스트.
// 숫자는 DB 함수 share_unread_count() (RLS 적용) 로 세고, 새 글은 Realtime 으로 받는다.
// 채널 화면이 읽음을 기록하면 notifyShareUnreadChanged() 로 배지를 다시 센다.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export const SHARE_UNREAD_EVENT = 'share-unread-changed';

export function notifyShareUnreadChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SHARE_UNREAD_EVENT));
}

export function useShareUnread(enabled: boolean) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId || !enabled) {
      setUnread(0);
      return;
    }
    // share_* 는 Lovable 이 types.ts 를 재생성하기 전까지 타입 정보가 없다.
    const { data, error } = await (supabase as any).rpc('share_unread_count');
    if (!error && typeof data === 'number') setUnread(data);
  }, [userId, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener(SHARE_UNREAD_EVENT, handler);
    return () => window.removeEventListener(SHARE_UNREAD_EVENT, handler);
  }, [refresh]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const channel = supabase
      .channel(`share-unread-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'share_posts' }, (payload) => {
        const row = payload.new as { created_by?: string; title?: string };
        if (row.created_by === userId) return;
        toast.info(`📎 새 자료·전달: ${row.title ?? ''}`, {
          duration: 8000,
          action: { label: '열기', onClick: () => navigate('/share') },
        });
        void refresh();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'share_posts' }, () => { void refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, enabled, refresh, navigate]);

  return { unread, refresh };
}
