import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Megaphone, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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

const DISMISS_KEY = 'systemAnnouncementDismissed_v1';

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

export function SystemAnnouncementBar() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed());
  const [activeIdx, setActiveIdx] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [visibility, setVisibility] = useState<'internal' | 'public'>('internal');
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('system_announcements')
      .select('*')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(10);
    setItems((data ?? []) as Announcement[]);
  }, []);

  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'teacher' && role !== 'assistant')) return;
    fetchItems();
    const channel = supabase
      .channel('system-announcements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_announcements' },
        () => fetchItems()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role, fetchItems]);

  // Auto-rotate when multiple active
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

  if (!user || (role !== 'admin' && role !== 'teacher' && role !== 'assistant')) return null;

  const visible = items.filter((i) => !dismissed.has(i.id));

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  const handleCreate = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('제목과 내용을 입력해주세요');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('system_announcements').insert({
        title: title.trim(),
        message: message.trim(),
        severity,
        visibility,
        is_active: true,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success('공지가 게시되었습니다');
      setTitle('');
      setMessage('');
      setSeverity('warning');
      setVisibility('internal');
      setComposeOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error('공지 등록 실패: ' + (e.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('이 공지를 종료할까요?')) return;
    const { error } = await supabase
      .from('system_announcements')
      .update({ is_active: false })
      .eq('id', id);
    if (error) {
      toast.error('처리 실패');
    } else {
      toast.success('공지를 종료했습니다');
    }
  };

  // If nothing visible, still render compose button for admins
  if (visible.length === 0) {
    if (role !== 'admin') return null;
    return (
      <>
        <div className="sticky top-0 lg:top-0 z-30 bg-muted/30 border-b border-border/50 px-3 py-1 flex items-center justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={() => setComposeOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> 시스템 공지 추가
          </Button>
        </div>
        <ComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          title={title}
          setTitle={setTitle}
          message={message}
          setMessage={setMessage}
          severity={severity}
          setSeverity={setSeverity}
          visibility={visibility}
          setVisibility={setVisibility}
          submitting={submitting}
          onSubmit={handleCreate}
        />
      </>
    );
  }

  const current = visible[activeIdx % visible.length];
  const isCritical = current.severity === 'critical';
  const isWarning = current.severity === 'warning';

  return (
    <>
      <div
        className={cn(
          'sticky top-0 z-40 border-b shadow-md',
          isCritical && 'bg-destructive text-destructive-foreground border-destructive animate-pulse-strong',
          isWarning && 'bg-destructive/90 text-destructive-foreground border-destructive/80 animate-pulse-strong',
          !isCritical && !isWarning && 'bg-primary text-primary-foreground border-primary/80'
        )}
      >
        <div className="max-w-7xl mx-auto px-3 lg:px-4 py-2 flex items-center gap-3">
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
          {role === 'admin' && (
            <>
              <button
                onClick={() => setComposeOpen(true)}
                className="p-1 rounded hover:bg-background/20 transition-colors flex-shrink-0"
                title="공지 추가"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeactivate(current.id)}
                className="p-1 rounded hover:bg-background/20 transition-colors flex-shrink-0"
                title="공지 종료"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
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

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        title={title}
        setTitle={setTitle}
        message={message}
        setMessage={setMessage}
        severity={severity}
        setSeverity={setSeverity}
        visibility={visibility}
        setVisibility={setVisibility}
        submitting={submitting}
        onSubmit={handleCreate}
      />
    </>
  );
}

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  setTitle: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  severity: 'info' | 'warning' | 'critical';
  setSeverity: (v: 'info' | 'warning' | 'critical') => void;
  visibility: 'internal' | 'public';
  setVisibility: (v: 'internal' | 'public') => void;
  submitting: boolean;
  onSubmit: () => void;
}

function ComposeDialog({
  open, onOpenChange,
  title, setTitle, message, setMessage,
  severity, setSeverity, visibility, setVisibility, submitting, onSubmit,
}: ComposeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>시스템 공지 작성</DialogTitle>
          <DialogDescription>
            모든 선생님·조교에게 상단 알림 바로 표시됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">제목</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 출석알림 팝업 개선"
            />
          </div>
          <div>
            <Label className="text-xs">내용</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="업데이트된 내용을 한 줄로 설명해주세요"
              rows={3}
            />
          </div>
          <div>
            <Label className="text-xs">중요도</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">정보 (파랑)</SelectItem>
                <SelectItem value="warning">중요 (빨강 반짝)</SelectItem>
                <SelectItem value="critical">긴급 (강한 빨강 반짝)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? '게시 중...' : '게시'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
