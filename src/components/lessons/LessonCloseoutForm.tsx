// LESSON-CLOSEOUT-V1 / CLOSEOUT-FLOW-V1
// 개인·그룹 공용 '오늘 수업 마감' 화면.
// 저장 경로는 기존 안전 경로만 사용한다:
//   - lesson_records → safeUpsertLessonRecord
//   - homework_assignments → reconcileLessonHomework (RPC, 삭제 후 재삽입 금지)
// 새 테이블/새 스키마/새 저장 방식은 만들지 않는다.
// CLOSEOUT-FLOW-V1: 화면 구획을 ① 출결 확인 → ② 수업·숙제 기록 → ③ 마감으로 재배치했다.
//   저장 payload/컬럼 구조는 변경하지 않는다(원장 조회 화면 호환 유지).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { safeUpsertLessonRecord } from '@/lib/lessonRecordUpsert';
import { reconcileLessonHomework, HOMEWORK_LOAD_COLUMNS } from '@/lib/homeworkReconcile';
import { toStorageAttendanceStatuses, normalizeAttendanceStatuses } from '@/lib/attendance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Loader2, ChevronDown, ChevronRight, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CLOSEOUT_STEPS, computeCloseoutProgress } from './closeoutProgress';

const ATT_OPTIONS = ['정상등원', '지각', '조퇴', '인정결석', '무단결석', '보충불가'] as const;
const RISK_ATT = ['인정결석', '무단결석', '보충불가'];
const ABSENCE_STATUSES = ['인정결석', '무단결석', '보충불가'];
const DISABLE_SCORE_LESSON_TYPES = ['테스트방문', '휴강'];
const LESSON_TYPE_OPTIONS = ['정규수업', '보충수업', '테스트방문', '휴강'];

const HW_STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'completed', label: '완료' },
  { key: 'partial', label: '부분' },
  { key: 'not_done', label: '미완' },
  { key: 'none_assigned', label: '숙제 없음' },
];

function scoreDisabled(lessonTypes: string[], attendance: string[]) {
  if (lessonTypes.some((t) => DISABLE_SCORE_LESSON_TYPES.includes(t))) return true;
  if (attendance.some((s) => ABSENCE_STATUSES.includes(s))) return true;
  return false;
}

interface HwRow { id?: string | null; content: string }

interface StudentState {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  recordId: string | null;
  submitted: boolean;
  attendance: string[];
  understanding: string;          // '' = 미선택 (임의 기본값 저장 금지)
  homeworkStatus: string;
  lessonRange: string;
  nextHomework: string;      // 줄 단위 텍스트
  existingHw: HwRow[];       // 기존 배정 (id 보존용)
  prevHomework: { content: string; check_status: string | null }[];
  notes: string;
  internalNotes: string;
  learningIssuesNote: string;
  expanded: boolean;
}

export const UNSAVED_CONFIRM_MESSAGE = '저장하지 않은 변경사항이 있습니다. 나가시겠습니까?';

interface Props {
  classId: string;
  date: string;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function LessonCloseoutForm({ classId, date, onClose, onDirtyChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classInfo, setClassInfo] = useState<{ name: string; subject: string } | null>(null);
  const [students, setStudents] = useState<StudentState[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<'draft' | 'finalized' | null>(null);
  const savingRef = useRef(false);

  // 공통값
  const [lessonTypes, setLessonTypes] = useState<string[]>(['정규수업']);
  const [commonRange, setCommonRange] = useState('');
  const [commonGoal, setCommonGoal] = useState('');
  const [commonHomework, setCommonHomework] = useState('');
  const [optionalOpen, setOptionalOpen] = useState(false);

  const subject = classInfo?.subject || '';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('name, subject')
        .eq('id', classId)
        .maybeSingle();
      if (clsErr) throw clsErr;
      if (!cls) throw new Error('반 정보를 찾을 수 없습니다.');
      setClassInfo({ name: cls.name, subject: cls.subject as string });

      const { data: cs } = await supabase
        .from('class_students')
        .select('student_id')
        .eq('class_id', classId);
      const ids = [...new Set((cs || []).map((r: any) => r.student_id))];
      if (ids.length === 0) { setStudents([]); setLoading(false); return; }

      const [stRes, recRes, prevHwRes] = await Promise.all([
        supabase.from('students').select('id, name, school, grade').in('id', ids).neq('enrollment_status', '퇴원'),
        supabase
          .from('lesson_records')
          .select('id, student_id, submitted, attendance_status, understanding_score, homework_status, lesson_range, notes, internal_notes, learning_issues_note, next_lesson_goal, lesson_types')
          .in('student_id', ids)
          .eq('lesson_date', date)
          .eq('subject', cls.subject as any),
        supabase
          .from('homework_assignments')
          .select('id, student_id, content, check_status, assigned_date')
          .in('student_id', ids)
          .eq('subject', cls.subject as any)
          .lt('assigned_date', date)
          .order('assigned_date', { ascending: false })
          .limit(300),
      ]);

      const recs = (recRes.data || []) as any[];
      const recMap = new Map(recs.map((r) => [r.student_id, r]));

      // 오늘 배정된 숙제 (기존 행 id 보존)
      const recordIds = recs.map((r) => r.id);
      let todayHw: any[] = [];
      if (recordIds.length > 0) {
        const { data } = await supabase
          .from('homework_assignments')
          .select(`${HOMEWORK_LOAD_COLUMNS}, lesson_record_id, student_id`)
          .in('lesson_record_id', recordIds);
        todayHw = data || [];
      }

      const prevMap = new Map<string, { content: string; check_status: string | null }[]>();
      (prevHwRes.data || []).forEach((h: any) => {
        const arr = prevMap.get(h.student_id) || [];
        if (arr.length < 4) arr.push({ content: h.content, check_status: h.check_status ?? null });
        prevMap.set(h.student_id, arr);
      });

      const built: StudentState[] = (stRes.data || []).map((s: any) => {
        const rec = recMap.get(s.id);
        const hw = todayHw.filter((h) => h.lesson_record_id === rec?.id);
        return {
          id: s.id,
          name: s.name,
          school: s.school,
          grade: s.grade,
          recordId: rec?.id ?? null,
          submitted: !!rec?.submitted,
          attendance: rec?.attendance_status ? normalizeAttendanceStatuses(rec.attendance_status).filter((v) => v !== 'legacy_absent') : [],
          understanding: rec?.understanding_score != null ? String(rec.understanding_score) : '',
          homeworkStatus: rec?.homework_status || 'none_assigned',
          lessonRange: rec?.lesson_range || '',
          nextHomework: hw.map((h) => h.content).join('\n'),
          existingHw: hw.map((h) => ({ id: h.id, content: h.content })),
          prevHomework: prevMap.get(s.id) || [],
          notes: rec?.notes || '',
          internalNotes: rec?.internal_notes || '',
          learningIssuesNote: rec?.learning_issues_note || '',
          expanded: false,
        };
      }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

      setStudents(built);
      const firstRec = recs[0];
      if (firstRec?.lesson_types?.length) setLessonTypes(firstRec.lesson_types);
      if (firstRec?.lesson_range) setCommonRange(firstRec.lesson_range);
      if (firstRec?.next_lesson_goal) setCommonGoal(firstRec.next_lesson_goal);
      setDirty(false);
    } catch (e: any) {
      setLoadError(e?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => { load(); }, [load]);

  // 상위 페이지(뒤로 버튼)와 dirty 상태 공유
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  const handleClose = () => {
    if (!onClose) return;
    if (dirty && !window.confirm(UNSAVED_CONFIRM_MESSAGE)) return;
    onClose();
  };

  // 페이지 이탈 경고
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const patch = (id: string, next: Partial<StudentState>) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
    setDirty(true);
    setLastResult(null);
  };

  const applyCommonRange = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, lessonRange: commonRange })));
    setDirty(true);
  };
  const applyCommonHomework = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, nextHomework: commonHomework })));
    setDirty(true);
  };
  const applyAllPresent = () => {
    setStudents((prev) => prev.map((s) => (s.attendance.length > 0 ? s : { ...s, attendance: ['정상등원'] })));
    setDirty(true);
  };
  const applyAllUnmarkedAbsent = () => {
    setStudents((prev) => prev.map((s) => (s.attendance.length > 0 ? s : { ...s, attendance: ['인정결석'] })));
    setDirty(true);
  };

  const counts = useMemo(() => ({
    total: students.length,
    marked: students.filter((s) => s.attendance.length > 0).length,
    submitted: students.filter((s) => s.submitted).length,
  }), [students]);

  // CLOSEOUT-FLOW-V1: 단계/완료 조건은 순수 함수로 계산
  const progress = useMemo(
    () =>
      computeCloseoutProgress(
        students.map((s) => ({
          hasAttendance: s.attendance.length > 0,
          recordExempt: scoreDisabled(lessonTypes, s.attendance),
          hasProgress: !!(s.lessonRange.trim() || commonRange.trim()),
          submitted: s.submitted,
        }))
      ),
    [students, lessonTypes, commonRange]
  );

  // CLOSEOUT-ATT-GATE-V1: 수업출결 미선택은 정상등원으로 암묵 처리하지 않는다.
  const unmarkedStudents = useMemo(
    () => students.filter((s) => s.attendance.length === 0),
    [students]
  );
  const finalizeBlocked = unmarkedStudents.length > 0 || students.length === 0;

  const persist = async (finalize: boolean) => {
    if (savingRef.current) return;
    if (!user?.id) return;
    if (finalize && finalizeBlocked) {
      setSaveError(
        `수업출결 미선택 ${unmarkedStudents.length}명이 있어 마감할 수 없습니다. 각 학생의 수업출결을 선택하거나 '미기록 전원 정상등원'을 사용하세요.`
      );
      toast({
        title: '수업출결 미선택',
        description: `${unmarkedStudents.length}명의 수업출결을 먼저 선택해 주세요.`,
        variant: 'destructive',
      });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setLastResult(null);

    let ok = 0;
    try {
      for (const s of students) {
        // CLOSEOUT-ATT-GATE-V1: 미선택은 임시저장에서도 '정상등원'으로 암묵 변환하지 않는다.
        const attendance = s.attendance.length > 0 ? toStorageAttendanceStatuses(s.attendance) : [];
        const disabled = scoreDisabled(lessonTypes, attendance);
        const payload = {
          teacher_id: user.id,
          student_id: s.id,
          class_id: classId,
          subject,
          lesson_date: date,
          lesson_range: (s.lessonRange || commonRange || '').trim(),
          // 이해도 미선택은 임의 기본값(3)으로 저장하지 않는다.
          understanding_score: disabled || !s.understanding ? null : parseInt(s.understanding, 10),
          homework_status: s.homeworkStatus,
          learning_issues_note: s.learningIssuesNote.trim() || null,
          next_lesson_goal: commonGoal.trim() || null,
          notes: s.notes.trim() || null,
          internal_notes: s.internalNotes.trim() || null,
          lesson_types: lessonTypes.length > 0 ? lessonTypes : ['정규수업'],
          attendance_status: attendance,
        } as Record<string, any> & { student_id: string; subject: string; lesson_date: string };
        if (finalize) {
          payload.submitted = true;
          payload.submitted_at = new Date().toISOString();
        } else {
          payload.submitted = false;
        }

        const res = await safeUpsertLessonRecord(payload, { preserveSubmitted: !finalize });
        if (res.error || !res.id) throw new Error(res.error?.message || `${s.name} 저장 실패`);

        const lines = s.nextHomework.split('\n').map((l) => l.trim()).filter(Boolean);
        const items = lines.map((content, idx) => ({
          id: s.existingHw[idx]?.id ?? null,
          content,
          homework_type: 'regular',
        }));
        await reconcileLessonHomework({
          lessonRecordId: res.id,
          studentId: s.id,
          subject,
          assignedDate: date,
          items,
        });
        ok += 1;
      }

      toast({
        title: finalize ? '수업 마감 완료' : '임시저장 완료',
        description: `${ok}명 저장했습니다.`,
      });
      setDirty(false);
      setLastResult(finalize ? 'finalized' : 'draft');
      await load();
    } catch (e: any) {
      // 부분 실패를 성공처럼 보이지 않게 한다.
      setSaveError(
        `${e?.message || '저장 중 오류가 발생했습니다.'} — ${ok}/${students.length}명만 저장되었고 나머지는 저장되지 않았습니다. 입력값은 화면에 유지됩니다.`
      );
      toast({
        title: '저장 실패 (부분 저장)',
        description: `${ok}/${students.length}명 저장 후 중단되었습니다. 다시 시도해 주세요.`,
        variant: 'destructive',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (loadError) {
    return <p className="text-sm text-destructive p-6">{loadError}</p>;
  }

  return (
    <div className="space-y-3 pb-32">
      {/* 상단 고정 단계 요약 */}
      <div
        data-testid="closeout-step-summary"
        className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-background/95 backdrop-blur border-b border-border"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {CLOSEOUT_STEPS.map((st) => {
            const active = progress.currentStep === st.id;
            const done =
              (st.id === 'attendance' && progress.attendanceRemaining === 0 && progress.total > 0) ||
              (st.id === 'record' && progress.attendanceRemaining === 0 && progress.progressRemaining === 0) ||
              (st.id === 'finalize' && progress.allFinalized);
            return (
              <span
                key={st.id}
                className={cn(
                  'shrink-0 text-[11px] px-2 py-1 rounded-full border font-medium',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : done
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                      : 'text-muted-foreground border-border'
                )}
              >
                {st.label}
                {done && ' ✓'}
              </span>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          {progress.requiredRemaining > 0
            ? `남은 필수 항목 ${progress.requiredRemaining}건 (수업출결 미선택)`
            : progress.progressRemaining > 0
              ? `필수 항목 완료 · 진도 미기록 ${progress.progressRemaining}명 (권장)`
              : progress.allFinalized
                ? '모든 학생 마감 완료'
                : '필수 항목 완료 — 마감할 수 있습니다'}
          {' · '}수업출결 {counts.marked}/{counts.total} · 마감 {counts.submitted}/{counts.total}
        </p>
      </div>

      {/* 헤더 — 시간표/반 정보는 읽기 전용 요약 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold break-all">{classInfo?.name}</h1>
            {subject && <Badge variant="outline" className="text-[10px]">{subject}</Badge>}
            <Badge variant="secondary" className="text-[10px] tabular-nums">{date}</Badge>
            <Badge variant="outline" className="text-[10px] tabular-nums">학생 {counts.total}명</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            반·과목·명단·날짜는 시간표에서 자동으로 가져온 값입니다 (여기서 수정하지 않습니다).
          </p>

          <div className="flex flex-wrap gap-1.5">
            {LESSON_TYPE_OPTIONS.map((t) => {
              const active = lessonTypes.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => {
                    setLessonTypes((prev) => (prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]));
                    setDirty(true);
                  }}
                  className={cn(
                    'text-[11px] px-2.5 py-1.5 rounded-full border font-medium transition-colors',
                    active ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border'
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ① 출결 확인 */}
      <div className="flex items-center gap-2 pt-1">
        <h2 className="text-xs font-bold text-foreground">① 출결 확인</h2>
        <span className="text-[10px] text-muted-foreground">완료 조건: 전원 수업출결 선택</span>
        <Button size="sm" variant="outline" className="h-7 text-[11px] ml-auto" onClick={applyAllPresent}>
          미기록 전원 정상등원
        </Button>
      </div>

      {/* CLOSEOUT-ATT-GATE-V1: 수업출결 미선택 안내 */}
      {unmarkedStudents.length > 0 && (
        <div
          data-testid="closeout-unmarked-banner"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2"
        >
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            수업출결 미선택 {unmarkedStudents.length}명 — 마감할 수 없습니다
          </p>
          <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 break-words">
            {unmarkedStudents.map((s) => s.name).join(', ')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={applyAllPresent}>
              미기록 전원 정상등원
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={applyAllUnmarkedAbsent}>
              미기록 전원 인정결석
            </Button>
          </div>
        </div>
      )}

      {/* ② 수업·숙제 기록 */}
      <div className="flex items-center gap-2 pt-1">
        <h2 className="text-xs font-bold text-foreground">② 수업·숙제 기록</h2>
        <span className="text-[10px] text-muted-foreground">진도·숙제는 공통값을 재사용할 수 있습니다</span>
      </div>

      {/* 공통 진도 / 숙제 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground">공통 입력 → 전체 적용</p>
          <div className="space-y-1.5">
            <Label className="text-[11px]">진도 / 수업 내용</Label>
            <div className="flex gap-2">
              <Input value={commonRange} onChange={(e) => { setCommonRange(e.target.value); setDirty(true); }} placeholder="예: 수학1 p.42~55" className="h-9 text-sm min-w-0" />
              <Button size="sm" variant="outline" onClick={applyCommonRange} className="shrink-0">전체 적용</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">비워두면 학생별 진도가 없을 때 이 값이 저장됩니다.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">다음 숙제 (줄바꿈으로 여러 건 · 배정일 {date})</Label>
            <div className="flex gap-2">
              <Textarea value={commonHomework} onChange={(e) => { setCommonHomework(e.target.value); setDirty(true); }} rows={2} placeholder="예: 워크북 p.20~24" className="text-sm min-w-0" />
              <Button size="sm" variant="outline" onClick={applyCommonHomework} className="shrink-0">전체 적용</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              대상: 이 반 재원 학생 {counts.total}명 · 비워두면 숙제를 배정하지 않습니다(‘숙제 없음’과 다름).
            </p>
          </div>

          <button
            onClick={() => setOptionalOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground py-1"
          >
            {optionalOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            추가 기록 (다음 수업 목표)
          </button>
          {optionalOpen && (
            <div className="space-y-1.5">
              <Label className="text-[11px]">다음 수업 목표</Label>
              <Input value={commonGoal} onChange={(e) => { setCommonGoal(e.target.value); setDirty(true); }} className="h-9 text-sm" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 학생별 */}
      <div className="space-y-2">
        {students.map((s) => {
          const disabled = scoreDisabled(lessonTypes, s.attendance);
          return (
            <Card key={s.id} className={cn(s.submitted && 'border-emerald-500/30')}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold break-all">{s.name}</span>
                  {(s.school || s.grade) && (
                    <span className="text-[10px] text-muted-foreground break-all">{s.school || ''} {s.grade || ''}</span>
                  )}
                  {s.submitted
                    ? <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">마감됨</Badge>
                    : <Badge variant="outline" className="text-[10px] text-muted-foreground">미마감</Badge>}
                </div>

                {/* 수업출결 (교사 판단) — 저장 컬럼은 attendance_status 그대로 */}
                <p className="text-[10px] font-semibold text-muted-foreground">수업출결 <span className="font-normal">(교사 판단 · 출입 태그와 별개 · 필수)</span></p>
                <div className="flex flex-wrap gap-1">
                  {ATT_OPTIONS.map((opt) => {
                    const active = s.attendance.includes(opt);
                    const risk = RISK_ATT.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => patch(s.id, { attendance: active ? [] : [opt] })}
                        className={cn(
                          'text-[11px] px-2.5 py-1.5 rounded-lg border font-medium transition-colors',
                          active
                            ? risk
                              ? 'bg-destructive text-destructive-foreground border-destructive'
                              : 'bg-primary text-primary-foreground border-primary'
                            : risk
                              ? 'bg-transparent text-destructive/80 border-destructive/40'
                              : 'bg-transparent text-muted-foreground border-border'
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {/* 이해도 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground w-12">이해도</span>
                  <div className={cn('flex gap-1', disabled && 'opacity-40 pointer-events-none')}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        disabled={disabled}
                        onClick={() => patch(s.id, { understanding: s.understanding === String(n) ? '' : String(n) })}
                        className={cn(
                          'w-8 h-8 rounded-lg border text-[11px] font-bold',
                          s.understanding === String(n) && !disabled
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'text-muted-foreground border-border'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {disabled
                    ? <span className="text-[10px] text-muted-foreground">결석·휴강은 이해도 미기록</span>
                    : !s.understanding && <span className="text-[10px] text-muted-foreground">미선택 (선택 안 하면 저장하지 않음)</span>}
                </div>

                {/* 지난 숙제 */}
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-muted-foreground w-12 pt-1.5 shrink-0">지난 숙제</span>
                  <div className="flex-1 min-w-0 space-y-1">
                    {s.prevHomework.length > 0 ? (
                      <p className="text-[11px] text-muted-foreground break-words line-clamp-2">
                        {s.prevHomework.map((h) => h.content).join(' / ')}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">배정 기록 없음</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {HW_STATUS_OPTIONS.map((o) => (
                        <button
                          key={o.key}
                          onClick={() => patch(s.id, { homeworkStatus: o.key })}
                          className={cn(
                            'text-[11px] px-2.5 py-1.5 rounded-lg border font-medium',
                            s.homeworkStatus === o.key
                              ? o.key === 'not_done'
                                ? 'bg-destructive text-destructive-foreground border-destructive'
                                : 'bg-primary text-primary-foreground border-primary'
                              : 'text-muted-foreground border-border'
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 진도 예외 + 다음 숙제 */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={s.lessonRange}
                    onChange={(e) => patch(s.id, { lessonRange: e.target.value })}
                    placeholder={commonRange ? `개별 진도 (비우면 "${commonRange}")` : '개별 진도 (비우면 공통값)'}
                    className="h-9 text-xs min-w-0"
                  />
                  <div className="space-y-1 min-w-0">
                    <Textarea
                      value={s.nextHomework}
                      onChange={(e) => patch(s.id, { nextHomework: e.target.value })}
                      rows={2}
                      placeholder="개별 다음 숙제 (비우면 배정 없음)"
                      className="text-xs"
                    />
                    {commonHomework.trim() && s.nextHomework !== commonHomework && (
                      <button
                        onClick={() => patch(s.id, { nextHomework: commonHomework })}
                        className="text-[10px] text-primary underline underline-offset-2"
                      >
                        공통 숙제 내용 가져오기
                      </button>
                    )}
                  </div>
                </div>

                {/* 학부모 전달 메모는 접지 않는다 */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">수업 메모 (학부모 공유)</Label>
                  <Textarea value={s.notes} onChange={(e) => patch(s.id, { notes: e.target.value })} rows={2} placeholder="학부모에게 전달할 내용" className="text-xs" />
                </div>

                <button
                  onClick={() => patch(s.id, { expanded: !s.expanded })}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground py-1"
                >
                  {s.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  추가 기록 (학습 이슈 · 내부 메모)
                </button>
                {s.expanded && (
                  <div className="space-y-2">
                    <Textarea value={s.learningIssuesNote} onChange={(e) => patch(s.id, { learningIssuesNote: e.target.value })} rows={2} placeholder="학습 이슈 메모" className="text-xs" />
                    <Textarea value={s.internalNotes} onChange={(e) => patch(s.id, { internalNotes: e.target.value })} rows={2} placeholder="내부 메모 (학부모 비공개)" className="text-xs" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {students.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">이 반에 등록된 재원 학생이 없습니다.</p>
        )}
      </div>

      {/* ③ 마감 후 다음 행동 */}
      {lastResult === 'finalized' && (
        <Card data-testid="closeout-next-actions" className="border-emerald-500/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> 수업 마감 완료 — 다음 행동
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="text-[11px]"><Link to="/teacher">다음 수업으로</Link></Button>
              <Button asChild size="sm" variant="outline" className="text-[11px]"><Link to="/lessons">수업 기록 조회</Link></Button>
              <Button asChild size="sm" variant="outline" className="text-[11px]"><Link to="/teacher">주간 리포트 확인</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
      {lastResult === 'draft' && (
        <p className="text-[11px] text-muted-foreground text-center">
          임시저장됨 — 아직 마감되지 않았습니다. 원장 보고서에는 미마감으로 집계됩니다.
        </p>
      )}

      {/* 하단 저장 바 */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur p-3 z-40">
        <div className="max-w-3xl mx-auto space-y-2">
          {saveError && (
            <p className="text-[11px] text-destructive flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span className="break-words">{saveError}</span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            임시저장: 기록만 남고 <span className="font-semibold">미마감</span> 유지 · 수업 마감: 제출 처리되어 원장 보고서·주간 리포트에 반영
            {dirty && <span className="text-amber-600 font-semibold"> · 저장되지 않은 변경 있음</span>}
          </p>
          <div className="flex gap-2">
            {onClose && (
              <Button variant="ghost" onClick={handleClose} disabled={saving} className="shrink-0">닫기</Button>
            )}
            <Button variant="outline" onClick={() => persist(false)} disabled={saving || students.length === 0} className="flex-1 min-w-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              임시저장
            </Button>
            <Button
              onClick={() => persist(true)}
              disabled={saving || students.length === 0 || finalizeBlocked}
              title={finalizeBlocked ? progress.blockReason || undefined : undefined}
              className="flex-1 min-w-0"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {unmarkedStudents.length > 0 ? `수업 마감 (미선택 ${unmarkedStudents.length}명)` : '수업 마감'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
