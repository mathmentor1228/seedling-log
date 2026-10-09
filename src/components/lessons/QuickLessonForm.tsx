// QUICK-LESSON-V1 (2026-10-10): 출석 체크 학생 줄 아래에서 바로 쓰는 수업 일지.
// 원장 요청 — 출결 체킹하면서 진도·이해도·지난 숙제·다음 숙제·다음 목표·학부모께 한 줄·마감까지 팝업 없이 같은 자리에서.
// 저장 경로는 마감 폼과 동일: lesson_records → safeUpsertLessonRecord(병합, 출결은 건드리지 않음), 숙제 → reconcileLessonHomework.
// 출결(attendance_status)은 이 폼이 쓰지 않는다 — 출석 체크 버튼이 이미 lesson_records 에 기록하므로 덮어쓰기 사고를 막는다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeUpsertLessonRecord } from '@/lib/lessonRecordUpsert';
import { reconcileLessonHomework, HOMEWORK_LOAD_COLUMNS, PROTECTED_HOMEWORK_MESSAGE } from '@/lib/homeworkReconcile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const HW_STATUS: { key: string; label: string }[] = [
  { key: 'completed', label: '완료' },
  { key: 'partial', label: '부분' },
  { key: 'not_done', label: '미완' },
  { key: 'none_assigned', label: '숙제 없음' },
];
const CHECK_LABEL: Record<string, string> = { checked: '확인됨', unchecked: '미확인', submitted: '제출됨' };

interface Props {
  studentId: string;
  studentName: string;
  classId: string;
  subject: string;
  date: string;       // YYYY-MM-DD
  teacherId: string;
  /** 출석 체크에서 등원/지각/결석 중 하나가 선택됐는가 (마감 조건) */
  attendanceMarked: boolean;
  onSaved?: () => void;
}

interface Loaded {
  recordId: string | null;
  submitted: boolean;
  understanding: string;
  homeworkStatus: string;
  lessonRange: string;
  nextGoal: string;
  nextHomework: string;
  existingHw: { id: string; content: string }[];
  prevHomework: { content: string; check_status: string | null; assigned_date: string }[];
  notes: string;
  learningIssuesNote: string;
  internalNotes: string;
}

const EMPTY: Loaded = {
  recordId: null, submitted: false, understanding: '', homeworkStatus: 'none_assigned', lessonRange: '', nextGoal: '',
  nextHomework: '', existingHw: [], prevHomework: [], notes: '', learningIssuesNote: '', internalNotes: '',
};

export function QuickLessonForm({ studentId, studentName, classId, subject, date, teacherId, attendanceMarked, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState<Loaded>(EMPTY);
  const [f, setF] = useState<Loaded>(EMPTY);
  const [moreOpen, setMoreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, prevRes] = await Promise.all([
        supabase.from('lesson_records')
          .select('id, submitted, understanding_score, homework_status, lesson_range, notes, internal_notes, learning_issues_note, next_lesson_goal')
          .eq('student_id', studentId).eq('lesson_date', date).eq('subject', subject as any).maybeSingle(),
        supabase.from('homework_assignments')
          .select('content, check_status, assigned_date')
          .eq('student_id', studentId).eq('subject', subject as any).lt('assigned_date', date)
          .order('assigned_date', { ascending: false }).limit(4),
      ]);
      const rec = recRes.data as any;
      let hw: any[] = [];
      if (rec?.id) {
        const { data } = await supabase.from('homework_assignments').select(HOMEWORK_LOAD_COLUMNS).eq('lesson_record_id', rec.id);
        hw = data || [];
      }
      const loaded: Loaded = {
        recordId: rec?.id ?? null,
        submitted: !!rec?.submitted,
        understanding: rec?.understanding_score != null ? String(rec.understanding_score) : '',
        homeworkStatus: rec?.homework_status || 'none_assigned',
        lessonRange: rec?.lesson_range || '',
        nextGoal: rec?.next_lesson_goal || '',
        nextHomework: hw.map(h => h.content).join('\n'),
        existingHw: hw.map(h => ({ id: h.id, content: h.content })),
        prevHomework: (prevRes.data || []) as any[],
        notes: rec?.notes || '',
        learningIssuesNote: rec?.learning_issues_note || '',
        internalNotes: rec?.internal_notes || '',
      };
      setBase(loaded); setF(loaded);
      if (loaded.learningIssuesNote || loaded.internalNotes) setMoreOpen(true);
    } finally {
      setLoading(false);
    }
  }, [studentId, date, subject]);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify({ ...f, existingHw: 0, prevHomework: 0 }) !== JSON.stringify({ ...base, existingHw: 0, prevHomework: 0 }), [f, base]);
  const patch = (p: Partial<Loaded>) => setF(prev => ({ ...prev, ...p }));

  async function persist(finalize: boolean) {
    if (saving) return;
    if (finalize && !attendanceMarked) {
      toast({ title: '출결을 먼저 선택해 주세요', description: '등원·지각·결석 중 하나를 누른 뒤 마감할 수 있습니다.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> & { student_id: string; subject: string; lesson_date: string } = {
        teacher_id: teacherId,
        student_id: studentId,
        class_id: classId,
        subject,
        lesson_date: date,
        lesson_range: f.lessonRange.trim(),
        understanding_score: f.understanding ? parseInt(f.understanding, 10) : null,
        homework_status: f.homeworkStatus,
        next_lesson_goal: f.nextGoal.trim() || null,
        notes: f.notes.trim() || null,
        learning_issues_note: f.learningIssuesNote.trim() || null,
        internal_notes: f.internalNotes.trim() || null,
      };
      if (!f.recordId) payload.lesson_types = ['정규수업'];
      if (finalize) { payload.submitted = true; payload.submitted_at = new Date().toISOString(); }
      const res = await safeUpsertLessonRecord(payload, { preserveSubmitted: !finalize });
      if (res.error || !res.id) throw new Error(res.error?.message || '저장 실패');
      const lines = f.nextHomework.split('\n').map(l => l.trim()).filter(Boolean);
      await reconcileLessonHomework({
        lessonRecordId: res.id, studentId, subject, assignedDate: date,
        items: lines.map((content, i) => ({ id: f.existingHw[i]?.id ?? null, content, homework_type: 'regular' })),
      });
      toast({ title: finalize ? `${studentName} 마감 완료` : `${studentName} 저장됨` });
      await load();
      onSaved?.();
    } catch (e: any) {
      const msg = e?.message || '저장 중 오류';
      toast({ title: '저장 실패', description: msg.includes('protected') ? PROTECTED_HOMEWORK_MESSAGE : msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="w-3 h-3 animate-spin" /> 일지 불러오는 중</div>;
  }

  return (
    <div className="space-y-2 text-xs">
      {/* 1줄: 진도 · 이해도 */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={f.lessonRange} onChange={e => patch({ lessonRange: e.target.value })} placeholder="진도 (예: 수학1 p.42~55)" className="h-8 text-xs flex-1 min-w-[200px]" disabled={saving} />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1">이해도</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" disabled={saving}
              onClick={() => patch({ understanding: f.understanding === String(n) ? '' : String(n) })}
              className={cn('w-7 h-7 rounded-md border text-xs font-semibold', f.understanding === String(n) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted')}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 2줄: 지난 숙제 */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1">지난 숙제</span>
          {HW_STATUS.map(o => (
            <button key={o.key} type="button" disabled={saving} onClick={() => patch({ homeworkStatus: o.key })}
              className={cn('h-7 px-2 rounded-md border text-xs', f.homeworkStatus === o.key
                ? (o.key === 'completed' ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/40' : o.key === 'not_done' ? 'bg-red-500/10 text-red-800 border-red-500/40' : o.key === 'partial' ? 'bg-amber-500/10 text-amber-800 border-amber-500/40' : 'bg-muted text-foreground border-border')
                : 'bg-background text-muted-foreground hover:bg-muted')}>
              {o.label}
            </button>
          ))}
        </div>
        {f.prevHomework.length > 0 && (
          <div className="flex-1 min-w-[200px] text-[11px] text-muted-foreground leading-snug">
            {f.prevHomework.map((h, i) => (
              <div key={i} className="truncate" title={h.content}>
                {h.assigned_date.slice(5).replace('-', '/')} · {h.content}
                <span className={cn('ml-1', h.check_status === 'checked' ? 'text-emerald-700' : 'text-amber-700')}>({CHECK_LABEL[h.check_status || 'unchecked'] || h.check_status})</span>
              </div>
            ))}
            <div className="text-[10px]">완료/부분/미완을 누르면 가장 최근 숙제가 숙제표에 자동 반영됩니다.</div>
          </div>
        )}
      </div>

      {/* 3줄: 다음 숙제 · 다음 목표 */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea value={f.nextHomework} onChange={e => patch({ nextHomework: e.target.value })} rows={2} placeholder="다음 숙제 (한 줄에 하나)" className="text-xs min-h-[56px]" disabled={saving} />
        <div className="space-y-2">
          <Input value={f.nextGoal} onChange={e => patch({ nextGoal: e.target.value })} placeholder="다음 수업 목표" className="h-8 text-xs" disabled={saving} />
          <Textarea value={f.notes} onChange={e => patch({ notes: e.target.value })} rows={1} placeholder="✉ 학부모께 한 줄 (선택 · 포털 노출)" className="text-xs min-h-[32px]" disabled={saving} />
        </div>
      </div>

      {/* 접힘: 학습 이슈 · 내부 메모 */}
      <button type="button" onClick={() => setMoreOpen(v => !v)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronRight className={cn('w-3 h-3 transition-transform', moreOpen && 'rotate-90')} /> 학습 이슈 · 내부 메모
      </button>
      {moreOpen && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Textarea value={f.learningIssuesNote} onChange={e => patch({ learningIssuesNote: e.target.value })} rows={2} placeholder="학습 이슈 메모 (편지 재료)" className="text-xs" disabled={saving} />
          <Textarea value={f.internalNotes} onChange={e => patch({ internalNotes: e.target.value })} rows={2} placeholder="내부 메모 (학부모 비공개)" className="text-xs" disabled={saving} />
        </div>
      )}

      {/* 푸터 */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          {f.submitted ? <><Lock className="w-3 h-3" /> 마감됨 — 저장하면 내용만 갱신</> : f.recordId ? '초안' : '아직 일지 없음'}
          {dirty && <span className="ml-1 text-amber-700">· 저장 안 됨</span>}
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving || !dirty} onClick={() => persist(false)}>
            {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}저장
          </Button>
          {!f.submitted && (
            <Button size="sm" className="h-7 text-xs" disabled={saving} title={attendanceMarked ? '마감 처리' : '출결을 먼저 선택하세요'} onClick={() => persist(true)}>
              마감
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
