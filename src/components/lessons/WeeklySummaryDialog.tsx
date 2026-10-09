// WEEKLY-COMMENT-V2: 선생님이 주 1회 학생별로 남기는 주간 코멘트 입력창.
// 막막하지 않도록 질문 셋(해낸 것 / 막힌 지점 / 다음 주)과 규칙·예시를 같이 보여주고,
// 이번 주 내가 적은 수업 기록(진도·숙제·메모)을 옆에 띄워 기억을 돕는다.
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { safeUpsertLessonRecord } from '@/lib/lessonRecordUpsert';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageSquareText, HelpCircle } from 'lucide-react';
import { getMondayOfWeek } from '@/lib/weekUtils';
import {
  WEEKLY_COMMENT_QUESTIONS, WEEKLY_COMMENT_RULES, WEEKLY_COMMENT_MIN_CHARS, WEEKLY_COMMENT_IDEAL_MAX_CHARS,
} from '@/lib/weeklyCommentGuide';
import { WEEKLY_COMMENT_PRESENCE_CHANNEL, type WeeklyCommentEditing } from '@/lib/weeklyCommentPresence';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  subject?: string;
  weekStart?: string; // YYYY-MM-DD (Mon)
  onSaved?: () => void;
}

interface WeekLesson {
  id: string; lesson_date: string; subject: string; lesson_range: string | null; homework_status: string | null;
  understanding_score: number | null; notes: string | null; learning_issues_note: string | null; attendance_status: string[] | null;
}

const HW_LABEL: Record<string, string> = { completed: '숙제 완료', partial: '숙제 일부', not_done: '숙제 안 함', incomplete: '숙제 안 함' };

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function WeeklySummaryDialog({ open, onOpenChange, studentId, studentName, subject = '수학', weekStart, onSaved }: Props) {
  const { user, fullName } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [weekLessons, setWeekLessons] = useState<WeekLesson[]>([]);
  const week = weekStart || getMondayOfWeek(new Date());
  const weekEnd = useMemo(() => addDays(week, 6), [week]);

  // 열려 있는 동안 "작성 중" presence 공유 → 원장 현황판에 파란색으로 보임
  useEffect(() => {
    if (!open || !user) return;
    const ch = supabase.channel(WEEKLY_COMMENT_PRESENCE_CHANNEL, { config: { presence: { key: `${user.id}:${studentId}` } } });
    const payload: WeeklyCommentEditing = {
      student_id: studentId, teacher_id: user.id, teacher_name: fullName || '선생님', week_start: week, since: new Date().toISOString(),
    };
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track(payload).catch(() => {});
    });
    return () => {
      ch.untrack().catch(() => {});
      supabase.removeChannel(ch);
    };
  }, [open, user, studentId, week, fullName]);

  useEffect(() => {
    if (!open || !user) return;
    setText('');
    setWeekLessons([]);
    (async () => {
      setLoading(true);
      try {
        // 이번 주 내 코멘트(과목별 관리 — 다른 선생님 것은 불러오지 않음) + 이번 주 내가 적은 수업 기록
        const [{ data: existing }, { data: mine }] = await Promise.all([
          supabase
            .from('lesson_records')
            .select('id, weekly_summary')
            .eq('student_id', studentId)
            .eq('teacher_id', user.id)
            .or(`weekly_summary_week.eq.${week},and(lesson_date.gte.${week},lesson_date.lte.${weekEnd})`)
            .not('weekly_summary', 'is', null)
            .order('lesson_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('lesson_records')
            .select('id, lesson_date, subject, lesson_range, homework_status, understanding_score, notes, learning_issues_note, attendance_status')
            .eq('student_id', studentId)
            .eq('teacher_id', user.id)
            .gte('lesson_date', week)
            .lte('lesson_date', weekEnd)
            .order('lesson_date', { ascending: true }),
        ]);
        if (existing?.weekly_summary) setText(existing.weekly_summary);
        setWeekLessons((mine || []) as WeekLesson[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, user, studentId, week, weekEnd]);

  function insertStem(stem: string) {
    setText(prev => {
      const base = prev.trimEnd();
      return base ? `${base}\n${stem}` : stem;
    });
  }

  async function save() {
    if (!user) return;
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: '코멘트를 입력해주세요', variant: 'destructive' });
      return;
    }
    if (trimmed.length < WEEKLY_COMMENT_MIN_CHARS) {
      toast({ title: `조금만 더 적어주세요 (${WEEKLY_COMMENT_MIN_CHARS}자 이상)`, description: '단원이나 문제 이름 하나만 붙여도 충분합니다.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: latest } = await supabase
        .from('lesson_records')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('student_id', studentId)
        .gte('lesson_date', week)
        .lte('lesson_date', weekEnd)
        .order('lesson_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.id) {
        const { error } = await supabase
          .from('lesson_records')
          .update({ weekly_summary: trimmed, weekly_summary_week: week })
          .eq('id', latest.id);
        if (error) throw error;
      } else {
        // 이번 주 내 수업 기록이 아직 없으면 코멘트를 담을 임시 초안을 만든다.
        const { error } = await safeUpsertLessonRecord({
          teacher_id: user.id,
          student_id: studentId,
          lesson_date: week,
          subject: subject as any,
          lesson_range: '',
          homework_status: 'none_assigned',
          submitted: false,
          weekly_summary: trimmed,
          weekly_summary_week: week,
        });
        if (error) throw error;
      }
      toast({ title: '주간 코멘트 저장 완료', description: `${studentName} · 일요일 밤 주간 편지에 반영됩니다.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const len = text.trim().length;
  const lenTone = len === 0 ? 'text-muted-foreground' : len < WEEKLY_COMMENT_MIN_CHARS ? 'text-amber-600' : len > WEEKLY_COMMENT_IDEAL_MAX_CHARS * 2 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="w-4 h-4 text-primary" />
            이번 주 주간 코멘트
            <Badge variant="outline" className="text-xs font-normal">{studentName}</Badge>
            <Badge variant="secondary" className="text-xs font-normal">{week.slice(5).replace('-', '/')} ~ {weekEnd.slice(5).replace('-', '/')}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[1fr_220px] py-1">
          {/* 왼쪽: 질문 칩 + 입력 */}
          <div className="space-y-2">
            <div className="rounded-lg border bg-muted/30 p-2 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">세 질문 중 <b>하나만</b> 골라 답해도 됩니다. 누르면 시작 문구가 들어갑니다.</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKLY_COMMENT_QUESTIONS.map(q => (
                  <Button key={q.key} type="button" variant="outline" size="sm" className="h-7 text-xs" title={q.question}
                    onClick={() => insertStem(q.stem)} disabled={loading}>
                    {q.label}
                  </Button>
                ))}
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setShowGuide(v => !v)}>
                  <HelpCircle className="w-3 h-3 mr-1" />{showGuide ? '규칙·예시 접기' : '규칙·예시'}
                </Button>
              </div>
              {showGuide && (
                <div className="text-[11px] leading-snug space-y-1.5 pt-1 border-t">
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    {WEEKLY_COMMENT_RULES.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                  <div className="space-y-0.5">
                    {WEEKLY_COMMENT_QUESTIONS.map(q => (
                      <p key={q.key}><span className="font-medium">{q.label}:</span> <span className="text-muted-foreground">{q.example}</span></p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
              placeholder={`예) ${WEEKLY_COMMENT_QUESTIONS[0].example}\n    ${WEEKLY_COMMENT_QUESTIONS[1].example}`}
              disabled={loading}
              className="text-sm"
            />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">AI가 학부모 말로 다듬어 주간 편지의 중심 문장이 됩니다. 원문 그대로 나가지 않습니다.</span>
              <span className={lenTone}>{len}자{len > 0 && len < WEEKLY_COMMENT_MIN_CHARS ? ` (${WEEKLY_COMMENT_MIN_CHARS}자 이상)` : ''}</span>
            </div>
          </div>

          {/* 오른쪽: 이번 주 내 기록 (기억 보조) */}
          <div className="rounded-lg border p-2 text-[11px] space-y-1.5 bg-background">
            <p className="font-medium text-xs">이번 주 내 수업 기록</p>
            {loading ? (
              <p className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 불러오는 중</p>
            ) : weekLessons.length === 0 ? (
              <p className="text-muted-foreground">이번 주 이 학생의 내 수업 기록이 아직 없습니다. 코멘트는 {subject} 임시 초안에 저장됩니다.</p>
            ) : weekLessons.map(l => {
              const absent = (l.attendance_status || []).some(a => /결석|미등원/.test(a));
              return (
                <div key={l.id} className="border-l-2 border-primary/30 pl-2 space-y-0.5">
                  <p className="text-muted-foreground">
                    {l.lesson_date.slice(5).replace('-', '/')} · {l.subject}
                    {absent && <span className="ml-1 text-destructive">결석</span>}
                    {l.homework_status && HW_LABEL[l.homework_status] && <span className="ml-1">· {HW_LABEL[l.homework_status]}</span>}
                    {typeof l.understanding_score === 'number' && <span className="ml-1">· 이해도 {l.understanding_score}</span>}
                  </p>
                  {l.lesson_range && !absent && <p className="truncate" title={l.lesson_range}>{l.lesson_range}</p>}
                  {l.notes && <p className="text-primary/90">✉ {l.notes}</p>}
                  {l.learning_issues_note && <p className="text-amber-700">! {l.learning_issues_note}</p>}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">취소</Button>
          <Button onClick={save} disabled={saving || loading} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
