import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface RecentTask {
  id: string;
  title: string;
  category: string;
  status: string;
  created_by_name: string;
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  category: string;
  status: string;
  created_by_name: string;
  created_at: string;
  type: 'office' | 'textbook';
}

export function AdminOfficeBell() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [textbookOrderCount, setTextbookOrderCount] = useState(0);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const initializedRef = useRef(false);

  // Check if user is admin or allowed email
  const isAllowed = role === 'admin' || user?.email === 'bfkor8810@naver.com';

  const fetchLastRead = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('admin_office_read_status')
      .select('last_read_at')
      .eq('user_id', user.id)
      .single();
    const lr = (data as any)?.last_read_at || null;
    setLastReadAt(lr);
    return lr;
  }, [user]);

  const fetchTextbookOrders = useCallback(async () => {
    // Count pending textbook orders (교재신청 status) not created by current user
    const { count } = await supabase
      .from('textbook_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', '교재신청')
      .neq('requested_by', user?.id || '');
    setTextbookOrderCount(count || 0);
  }, [user]);

  const fetchUnreadCount = useCallback(async (lr?: string | null) => {
    const readAt = lr ?? lastReadAt;
    let query = supabase.from('admin_office_tasks').select('id', { count: 'exact', head: true });
    if (readAt) {
      query = query.gt('created_at', readAt);
    }
    const { count } = await query;

    // Also count new comments
    let commentQuery = supabase.from('admin_office_task_comments').select('id', { count: 'exact', head: true });
    if (readAt) {
      commentQuery = commentQuery.gt('created_at', readAt);
    }
    // Filter out own comments
    if (user) {
      commentQuery = commentQuery.neq('author_id', user.id);
    }
    const { count: commentCount } = await commentQuery;

    setUnreadCount((count || 0) + (commentCount || 0));
  }, [lastReadAt, user]);

  const fetchRecentItems = useCallback(async () => {
    // Fetch office tasks
    const { data: officeTasks } = await supabase
      .from('admin_office_tasks')
      .select('id, title, category, status, created_by_name, created_at')
      .order('created_at', { ascending: false })
      .limit(8);

    // Fetch recent textbook orders
    const { data: textbookOrders } = await supabase
      .from('textbook_orders')
      .select('id, textbook_name, status, requested_by_name, created_at')
      .eq('status', '교재신청')
      .order('created_at', { ascending: false })
      .limit(5);

    const items: NotificationItem[] = [
      ...((officeTasks || []) as any[]).map(t => ({
        id: t.id, title: t.title, category: t.category, status: t.status,
        created_by_name: t.created_by_name, created_at: t.created_at, type: 'office' as const,
      })),
      ...((textbookOrders || []) as any[]).map(o => ({
        id: o.id, title: `📦 교재 신청: ${o.textbook_name}`,
        category: '교재주문', status: o.status,
        created_by_name: o.requested_by_name, created_at: o.created_at, type: 'textbook' as const,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
     .slice(0, 12);

    setRecentItems(items);
  }, []);

  // Init
  useEffect(() => {
    if (!isAllowed || !user || initializedRef.current) return;
    initializedRef.current = true;
    fetchLastRead().then((lr) => {
      fetchUnreadCount(lr);
      fetchRecentItems();
      fetchTextbookOrders();
    });
  }, [isAllowed, user, fetchLastRead, fetchUnreadCount, fetchRecentItems, fetchTextbookOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!isAllowed || !user) return;

    const channel = supabase
      .channel('admin-office-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_office_tasks' },
        (payload) => {
          const newTask = payload.new as any;
          // Don't notify for own tasks
          if (newTask.created_by !== user.id) {
            toast.info('새로운 행정 업무가 등록되었습니다', {
              description: newTask.title,
              duration: 3000,
              action: {
                label: '보기',
                onClick: () => navigate('/admin/office'),
              },
            });
          }
          setUnreadCount(prev => prev + (newTask.created_by !== user.id ? 1 : 0));
          fetchRecentItems();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_office_task_comments' },
        (payload) => {
          const newComment = payload.new as any;
          if (newComment.author_id !== user.id) {
            toast.info('행정 업무에 새 댓글이 달렸습니다', {
              description: newComment.body?.substring(0, 50),
              duration: 3000,
            });
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'textbook_orders' },
        (payload) => {
          const newOrder = payload.new as any;
          if (newOrder.requested_by !== user.id) {
            toast.info(`📦 교재 주문 신청`, {
              description: `${newOrder.requested_by_name}님이 "${newOrder.textbook_name}" 교재를 신청했습니다`,
              duration: 6000,
              action: {
                label: '확인',
                onClick: () => navigate('/textbooks'),
              },
            });
            setTextbookOrderCount(prev => prev + 1);
          }
          fetchRecentItems();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'textbook_orders' },
        () => { fetchTextbookOrders(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAllowed, user, navigate, fetchRecentItems, fetchTextbookOrders]);

  // Mark as read
  const markAsRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    await supabase
      .from('admin_office_read_status')
      .upsert({ user_id: user.id, last_read_at: now } as any, { onConflict: 'user_id' });
    setLastReadAt(now);
    setUnreadCount(0);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchRecentItems();
      fetchTextbookOrders();
    }
  };

  const handleItemClick = (item: NotificationItem) => {
    markAsRead();
    setOpen(false);
    if (item.type === 'textbook') {
      navigate('/textbooks');
    } else if (item.category === '수납' || item.title.includes('수납') || item.title.includes('입금') || item.title.includes('교재비')) {
      navigate('/textbook?tab=payment');
    } else {
      navigate('/admin/office');
    }
  };

  if (!isAllowed) return null;

  const totalBadge = unreadCount + textbookOrderCount;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
          <Bell className="w-4 h-4" />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-pulse">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">알림</p>
            {textbookOrderCount > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                📦 교재 {textbookOrderCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAsRead}>
              모두 읽음
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {recentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">등록된 알림이 없습니다</p>
          ) : (
            recentItems.map(item => {
              const isUnread = item.type === 'textbook'
                ? item.status === '교재신청'
                : (lastReadAt ? new Date(item.created_at) > new Date(lastReadAt) : true);
              return (
                  <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors",
                    isUnread && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isUnread && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0">NEW</Badge>
                        )}
                        <Badge variant="outline" className="text-[9px]">{item.category}</Badge>
                        <Badge
                          variant={item.status === '완료' || item.status === '입고완료' ? 'success' : item.status === '진행 중' || item.status === '주문중' ? 'default' : 'warning'}
                          className="text-[9px]"
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {item.created_by_name} · {format(new Date(item.created_at), 'MM/dd HH:mm')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-8"
            onClick={() => { setOpen(false); navigate('/admin/office'); }}
          >
            전체 보기 →
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
