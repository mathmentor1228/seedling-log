import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Link2, Loader2, Plus, Trash2, MessageSquare, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Schedule } from './types';

export interface ScheduleNote {
  id: string;
  author_id: string;
  author_name?: string;
  subject?: string | null;
  scope?: string | null;
  note: string;
  urls: string[];
  created_at: string;
}

interface Props {
  schedule: Schedule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ScheduleNotesDialog({ schedule, open, onOpenChange, onSaved }: Props) {
  const { user, profile } = useAuth() as any;
  const myId = user?.id;

  const [notes, setNotes] = useState<ScheduleNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  // form
  const [subject, setSubject] = useState('');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !schedule) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('school_schedules')
        .select('notes')
        .eq('id', schedule.id)
        .maybeSingle();
      if (!cancelled) {
        if (error) toast.error(error.message);
        const arr = Array.isArray(data?.notes) ? (data!.notes as ScheduleNote[]) : [];
        setNotes(arr);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, schedule?.id]);

  const reset = () => {
    setSubject(''); setScope(''); setNote(''); setUrlInput(''); setUrls([]); setAdding(false);
  };

  const persist = async (next: ScheduleNote[]) => {
    if (!schedule) return false;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('school_schedules')
      .update({ notes: next })
      .eq('id', schedule.id);
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    setNotes(next);
    onSaved?.();
    return true;
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrls([...urls, u]);
    setUrlInput('');
  };

  const submit = async () => {
    if (!myId) { toast.error('로그인이 필요합니다'); return; }
    if (!note.trim() && !scope.trim() && urls.length === 0) {
      toast.error('내용을 입력해 주세요');
      return;
    }
    const newNote: ScheduleNote = {
      id: crypto.randomUUID(),
      author_id: myId,
      author_name: profile?.full_name || profile?.name || profile?.email || '선생님',
      subject: subject.trim() || schedule?.subject || null,
      scope: scope.trim() || null,
      note: note.trim(),
      urls,
      created_at: new Date().toISOString(),
    };
    const ok = await persist([...notes, newNote]);
    if (ok) { reset(); toast.success('저장되었습니다'); }
  };

  const removeNote = async (id: string) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    await persist(notes.filter(n => n.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            시험범위 · 자료
          </DialogTitle>
        </DialogHeader>

        {schedule && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            <div className="font-semibold">{schedule.title}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1 py-0">{schedule.school_name}</Badge>
              {schedule.subject && <Badge variant="outline" className="text-[10px] px-1 py-0">{schedule.subject}</Badge>}
              {schedule.start_date && (
                <span>
                  {format(parseISO(schedule.start_date), 'yyyy년 M월 d일 (E)', { locale: ko })}
                  {schedule.end_date && schedule.end_date !== schedule.start_date &&
                    ` ~ ${format(parseISO(schedule.end_date), 'M월 d일', { locale: ko })}`}
                </span>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 불러오는 중...
          </div>
        ) : (
          <ScrollArea className="max-h-[40vh] pr-2">
            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">
                  아직 등록된 시험범위/자료가 없습니다
                </p>
              ) : (
                notes
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map(n => {
                    const mine = n.author_id === myId;
                    return (
                      <div key={n.id} className="p-2 rounded border bg-card text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={mine ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0">
                              {n.author_name || '선생님'}
                            </Badge>
                            {n.subject && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.subject}</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {format(parseISO(n.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                            </span>
                          </div>
                          {mine && (
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeNote(n.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                        {n.scope && (
                          <div className="mb-1 p-1.5 rounded bg-muted/50 text-[11px]">
                            <span className="text-[10px] font-semibold text-muted-foreground mr-1">범위:</span>
                            <span className="whitespace-pre-wrap">{n.scope}</span>
                          </div>
                        )}
                        {n.note && <p className="text-[11px] whitespace-pre-wrap">{n.note}</p>}
                        {n.urls?.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {n.urls.map((u, i) => (
                              <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                                 className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate">
                                <Link2 className="w-3 h-3 shrink-0" /> {u}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </ScrollArea>
        )}

        {adding ? (
          <div className="p-2 rounded border-2 border-dashed space-y-2 bg-muted/20">
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="과목 (선택)"
                className="h-7 text-xs"
              />
            </div>
            <Textarea
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="시험 범위 (예: 1단원 ~ 3단원, 교과서 p.12~p.58)"
              rows={2}
              className="text-xs"
            />
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="기타 코멘트, 강조사항, 학습 포인트 등"
              rows={2}
              className="text-xs"
            />
            <div className="flex gap-1">
              <Input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="자료 URL 추가 (구글드라이브, 노션 등)"
                className="h-7 text-xs"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
              />
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={addUrl}>
                <Plus className="w-3 h-3" /> URL
              </Button>
            </div>
            {urls.length > 0 && (
              <div className="space-y-0.5">
                {urls.map((u, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px]">
                    <Link2 className="w-3 h-3 text-muted-foreground" />
                    <span className="truncate flex-1">{u}</span>
                    <button onClick={() => setUrls(urls.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>취소</Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="w-3 h-3 animate-spin" />} 저장
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => setAdding(true)}>
            <MessageSquare className="w-3.5 h-3.5" /> 시험범위/자료 추가하기
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
