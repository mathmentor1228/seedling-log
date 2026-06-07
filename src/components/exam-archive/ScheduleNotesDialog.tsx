import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Link2, Loader2, Plus, Trash2, MessageSquare, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { classifyCompositeSubject, SUBJECT_CATEGORY_LABELS, SUBJECT_CATEGORY_COLORS, type SubjectCategory } from '@/lib/subjectCategory';
import type { Schedule } from './types';

export interface ExamNoteRow {
  id: string;
  schedule_id: string | null;
  school_name: string;
  year: number;
  exam_period: string | null;
  grade: number | null;
  subject: string | null;
  subject_category: SubjectCategory | null;
  scope: string | null;
  note: string | null;
  urls: string[];
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

interface Props {
  schedule: Schedule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const EXAM_PERIODS = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말', '수행평가', '기타'];

function detectPeriod(title?: string | null): string {
  if (!title) return '';
  if (title.includes('1학기') && title.includes('중간')) return '1학기 중간';
  if (title.includes('1학기') && title.includes('기말')) return '1학기 기말';
  if (title.includes('2학기') && title.includes('중간')) return '2학기 중간';
  if (title.includes('2학기') && title.includes('기말')) return '2학기 기말';
  if (title.includes('수행')) return '수행평가';
  return '';
}

export function ScheduleNotesDialog({ schedule, open, onOpenChange, onSaved }: Props) {
  const { user, profile } = useAuth() as any;
  const myId = user?.id;

  const [notes, setNotes] = useState<ExamNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  // form
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState<string>('');
  const [period, setPeriod] = useState<string>('');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);

  const defaultYear = schedule?.start_date ? parseISO(schedule.start_date).getFullYear() : new Date().getFullYear();

  useEffect(() => {
    if (!open || !schedule) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('school_exam_notes')
        .select('*')
        .eq('schedule_id', schedule.id)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (error) toast.error(error.message);
        setNotes((data || []) as ExamNoteRow[]);
        setLoading(false);
        // Pre-fill defaults
        setSubject(schedule.subject || '');
        setGrade(schedule.grade ? String(schedule.grade) : '');
        setPeriod(detectPeriod(schedule.title));
      }
    })();
    return () => { cancelled = true; };
  }, [open, schedule?.id]);

  const reset = () => {
    setScope(''); setNote(''); setUrlInput(''); setUrls([]); setAdding(false);
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrls([...urls, u]);
    setUrlInput('');
  };

  const submit = async () => {
    if (!myId) { toast.error('로그인이 필요합니다'); return; }
    if (!schedule) return;
    if (!note.trim() && !scope.trim() && urls.length === 0) {
      toast.error('내용을 입력해 주세요');
      return;
    }
    setSaving(true);
    const subjectFinal = subject.trim() || schedule.subject || null;
    const payload = {
      schedule_id: schedule.id,
      school_name: schedule.school_name,
      year: defaultYear,
      exam_period: period || null,
      grade: grade ? Number(grade) : (schedule.grade ?? null),
      subject: subjectFinal,
      subject_category: subjectFinal ? classifyCompositeSubject(subjectFinal) : 'other',
      scope: scope.trim() || null,
      note: note.trim() || null,
      urls,
      author_id: myId,
      author_name: profile?.full_name || profile?.name || profile?.email || '선생님',
    };
    const { data, error } = await (supabase as any)
      .from('school_exam_notes')
      .insert(payload)
      .select('*')
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setNotes([data as ExamNoteRow, ...notes]);
    reset();
    toast.success('저장되었습니다');
    onSaved?.();
  };

  const removeNote = async (id: string) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    const { error } = await (supabase as any).from('school_exam_notes').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setNotes(notes.filter(n => n.id !== id));
    onSaved?.();
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
              <Badge variant="outline" className="text-[10px] px-1 py-0">{defaultYear}년</Badge>
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
          <ScrollArea className="max-h-[36vh] pr-2">
            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">
                  아직 등록된 시험범위/자료가 없습니다
                </p>
              ) : (
                notes.map(n => {
                  const mine = n.author_id === myId;
                  const cat = (n.subject_category || 'other') as SubjectCategory;
                  return (
                    <div key={n.id} className="p-2 rounded border bg-card text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={mine ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0">
                            {n.author_name || '선생님'}
                          </Badge>
                          {n.exam_period && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.exam_period}</Badge>}
                          {n.grade != null && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.grade}학년</Badge>}
                          {n.subject && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SUBJECT_CATEGORY_COLORS[cat]}`}>
                              {n.subject}
                            </Badge>
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
            <div className="grid grid-cols-3 gap-1.5">
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="과목 (예: 수학)"
                className="h-7 text-xs col-span-1"
              />
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="학년" /></SelectTrigger>
                <SelectContent>
                  {[1,2,3].map(g => <SelectItem key={g} value={String(g)} className="text-xs">{g}학년</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="시기" /></SelectTrigger>
                <SelectContent>
                  {EXAM_PERIODS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <p className="text-[10px] text-muted-foreground">
              저장 시 학교/연도/학년/과목으로 자동 인덱싱되어 나중에 검색·필터로 조회할 수 있습니다.
            </p>
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
