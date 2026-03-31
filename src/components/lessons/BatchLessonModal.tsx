import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { getTodayKST } from '@/lib/utils';
import { Users, Search, Loader2, Save, Send, Plus, Trash2, CheckSquare, ArrowRight } from 'lucide-react';

type SubjectType = '수학' | '과학' | '영어' | '국어';

const SUBJECT_SPECIFIC_ISSUES: Record<SubjectType, string[]> = {
  '수학': ['개념 이해 부족', '계산 실수 잦음', '문제 해석 미흡', '풀이 과정 정리 필요', '응용·서술형 약함', '시간 관리 어려움', '풀이 루틴을 지키지 않음'],
  '과학': ['개념 연결 미흡', '암기 부족', '자료 해석 어려움', '실험·탐구 서술 약함', '단원 간 개념 혼동', '풀이 루틴을 지키지 않음'],
  '영어': ['단어 이해 부족', '문법 개념 혼동', '독해 속도 느림', '근거 문장 찾기 어려움', '듣기 이해 부족', '풀이 루틴을 지키지 않음'],
  '국어': ['지문 독해 어려움', '핵심 개념어 정리 미흡', '서술형 논리 부족', '문학 표현 분석 미흡', '시간 배분 문제', '풀이 루틴을 지키지 않음'],
};

const LESSON_TYPE_OPTIONS = [
  { value: '정규수업', label: '정규수업' },
  { value: '보충수업', label: '보충수업' },
  { value: '시험특강', label: '시험특강' },
  { value: '방학특강', label: '방학특강' },
  { value: '공지사항', label: '공지사항' },
  { value: '휴강', label: '휴강' },
];

interface DraftRecord {
  id: string;
  student_id: string;
  student_name: string;
  student_grade: string | null;
  subject: string;
  lesson_range: string;
  understanding_score: number | null;
  homework_status: string;
  notes: string | null;
  next_lesson_goal: string | null;
  class_id: string | null;
  submitted: boolean;
  test_content: string | null;
  test_name: string | null;
  test_result: string | null;
  test_result_text: string | null;
  lesson_types: string[] | null;
}

interface HomeworkItem {
  tempId: string;
  content: string;
  homework_type: string;
}

interface BatchLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const HOMEWORK_STATUS_OPTIONS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '일부완료' },
  { value: 'not_done', label: '미이행' },
  { value: 'none_assigned', label: '없음' },
];

type EditableField = 'lesson_types_field' | 'lesson_range' | 'understanding_score' | 'homework_status' | 'notes' | 'next_lesson_goal' | 'homework_items' | 'learning_issues' | 'test_fields';

const FIELD_LABELS: Record<EditableField, string> = {
  lesson_types_field: '수업 종류',
  lesson_range: '수업 내용',
  understanding_score: '이해도',
  homework_status: '숙제 상태',
  learning_issues: '학습상세상황',
  test_fields: '테스트',
  notes: '비고 / 메모',
  next_lesson_goal: '다음 수업 목표',
  homework_items: '숙제 배정',
};

export function BatchLessonModal({ open, onOpenChange, onSaved }: BatchLessonModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState<'search' | 'edit'>('search');

  // Search state
  const [searchDate, setSearchDate] = useState(getTodayKST());
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit state - which fields to apply
  const [activeFields, setActiveFields] = useState<Set<EditableField>>(new Set());
  const [lessonRange, setLessonRange] = useState('');
  const [usePerStudentLessonRange, setUsePerStudentLessonRange] = useState(false);
  const [perStudentLessonRange, setPerStudentLessonRange] = useState<Record<string, string>>({});
  const [understandingScore, setUnderstandingScore] = useState<number>(3);
  const [homeworkStatus, setHomeworkStatus] = useState('none_assigned');
  const [notes, setNotes] = useState('');
  const [nextLessonGoal, setNextLessonGoal] = useState('');
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
  const [usePerStudentHomeworkItems, setUsePerStudentHomeworkItems] = useState(false);
  const [perStudentHomeworkItems, setPerStudentHomeworkItems] = useState<Record<string, HomeworkItem[]>>({});
  const [learningIssues, setLearningIssues] = useState<string[]>([]);
  const [learningIssuesNote, setLearningIssuesNote] = useState('');
  const [perStudentIssuesNote, setPerStudentIssuesNote] = useState<Record<string, string>>({});
  const [usePerStudentNotes, setUsePerStudentNotes] = useState(false);
  const [usePerStudentScore, setUsePerStudentScore] = useState(false);
  const [perStudentScore, setPerStudentScore] = useState<Record<string, number>>({});
  const [usePerStudentHomework, setUsePerStudentHomework] = useState(false);
  const [perStudentHomework, setPerStudentHomework] = useState<Record<string, string>>({});
  const [testContent, setTestContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitAfter, setSubmitAfter] = useState(false);
  const [batchLessonTypes, setBatchLessonTypes] = useState<string[]>(['정규수업']);
  const [usePerStudentLessonTypes, setUsePerStudentLessonTypes] = useState(false);
  const [perStudentLessonTypes, setPerStudentLessonTypes] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setStep('search');
      setSearchDate(getTodayKST());
      setDrafts([]);
      setSelectedIds(new Set());
      resetEditState();
    }
  }, [open]);

  function resetEditState() {
    setActiveFields(new Set());
    setLessonRange('');
    setUsePerStudentLessonRange(false);
    setPerStudentLessonRange({});
    setUnderstandingScore(3);
    setHomeworkStatus('none_assigned');
    setNotes('');
    setNextLessonGoal('');
    setHomeworkItems([]);
    setUsePerStudentHomeworkItems(false);
    setPerStudentHomeworkItems({});
    setLearningIssues([]);
    setLearningIssuesNote('');
    setPerStudentIssuesNote({});
    setUsePerStudentNotes(false);
    setUsePerStudentScore(false);
    setPerStudentScore({});
    setUsePerStudentHomework(false);
    setPerStudentHomework({});
    setTestContent('');
    setSubmitAfter(false);
    setBatchLessonTypes(['정규수업']);
    setUsePerStudentLessonTypes(false);
    setPerStudentLessonTypes({});
  }

  async function searchDrafts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lesson_records')
        .select('id, student_id, subject, lesson_range, understanding_score, homework_status, notes, next_lesson_goal, class_id, submitted, test_content, test_name, test_result, test_result_text, lesson_types, students!inner(name, grade)')
        .eq('lesson_date', searchDate)
        .eq('teacher_id', user!.id)
        .order('submitted', { ascending: true });

      if (error) throw error;

      const records: DraftRecord[] = (data || []).map((r: any) => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.students.name,
        student_grade: r.students.grade,
        subject: r.subject,
        lesson_range: r.lesson_range,
        understanding_score: r.understanding_score,
        homework_status: r.homework_status,
        notes: r.notes,
        next_lesson_goal: r.next_lesson_goal,
        class_id: r.class_id,
        submitted: r.submitted,
        test_content: r.test_content,
        test_name: r.test_name,
        test_result: r.test_result,
        test_result_text: r.test_result_text,
        lesson_types: r.lesson_types,
      }));
      setDrafts(records);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      toast({ title: '검색 실패', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function toggleDraft(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleField(field: EditableField) {
    setActiveFields(prev => {
      const next = new Set(prev);
      next.has(field) ? next.delete(field) : next.add(field);
      return next;
    });
  }

  function addHomework(studentId?: string) {
    const newItem = { tempId: crypto.randomUUID(), content: '', homework_type: 'daily' };
    if (studentId) {
      setPerStudentHomeworkItems(prev => ({
        ...prev,
        [studentId]: [...(prev[studentId] || []), newItem],
      }));
      return;
    }
    setHomeworkItems(prev => [...prev, newItem]);
  }
  function removeHomework(tempId: string, studentId?: string) {
    if (studentId) {
      setPerStudentHomeworkItems(prev => ({
        ...prev,
        [studentId]: (prev[studentId] || []).filter(h => h.tempId !== tempId),
      }));
      return;
    }
    setHomeworkItems(prev => prev.filter(h => h.tempId !== tempId));
  }
  function updateHomework(tempId: string, field: keyof HomeworkItem, value: string, studentId?: string) {
    if (studentId) {
      setPerStudentHomeworkItems(prev => ({
        ...prev,
        [studentId]: (prev[studentId] || []).map(h => h.tempId === tempId ? { ...h, [field]: value } : h),
      }));
      return;
    }
    setHomeworkItems(prev => prev.map(h => h.tempId === tempId ? { ...h, [field]: value } : h));
  }

  const draftOnly = useMemo(() => drafts.filter(d => !d.submitted), [drafts]);
  const submittedOnly = useMemo(() => drafts.filter(d => d.submitted), [drafts]);

  function goToEdit() {
    if (selectedIds.size === 0) {
      toast({ title: '수정할 일지를 선택해주세요', variant: 'destructive' });
      return;
    }
    resetEditState();
    // Pre-fill from the first selected record for convenience
    const first = drafts.find(d => selectedIds.has(d.id));
    if (first) {
      setLessonRange(first.lesson_range || '');
      setUnderstandingScore(first.understanding_score ?? 3);
      setHomeworkStatus(first.homework_status || 'none_assigned');
      setNotes(first.notes || '');
      setNextLessonGoal(first.next_lesson_goal || '');
      // Pre-fill test content from existing data
      setTestContent(first.test_content || first.test_name || '');
    }
    setStep('edit');
  }

  async function handleApply() {
    if (activeFields.size === 0) {
      toast({ title: '변경할 항목을 1개 이상 선택해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const now = new Date().toISOString();

      // Check if we need per-student updates
      const needsPerStudent = 
        (activeFields.has('lesson_range') && usePerStudentLessonRange) ||
        (activeFields.has('learning_issues') && usePerStudentNotes) ||
        (activeFields.has('understanding_score') && usePerStudentScore) ||
        (activeFields.has('homework_status') && usePerStudentHomework) ||
        (activeFields.has('lesson_types_field') && usePerStudentLessonTypes);

      // Build common update payload with only active fields
      const buildPayload = (recordId?: string): Record<string, any> => {
        const updatePayload: Record<string, any> = { updated_at: now };
        if (activeFields.has('lesson_types_field')) {
          updatePayload.lesson_types = (usePerStudentLessonTypes && recordId)
            ? (perStudentLessonTypes[recordId] ?? batchLessonTypes)
            : batchLessonTypes;
        }
        if (activeFields.has('lesson_range')) {
          updatePayload.lesson_range = (usePerStudentLessonRange && recordId)
            ? (perStudentLessonRange[recordId] ?? lessonRange).trim()
            : lessonRange.trim();
        }
        if (activeFields.has('understanding_score')) {
          updatePayload.understanding_score = (usePerStudentScore && recordId)
            ? (perStudentScore[recordId] ?? understandingScore)
            : understandingScore;
        }
        if (activeFields.has('homework_status')) {
          updatePayload.homework_status = (usePerStudentHomework && recordId)
            ? (perStudentHomework[recordId] || homeworkStatus)
            : homeworkStatus;
        }
        if (activeFields.has('notes')) updatePayload.notes = notes.trim() || null;
        if (activeFields.has('next_lesson_goal')) updatePayload.next_lesson_goal = nextLessonGoal.trim() || null;
        if (activeFields.has('learning_issues')) {
          updatePayload.learning_issues = learningIssues;
          if (usePerStudentNotes && recordId) {
            updatePayload.learning_issues_note = (perStudentIssuesNote[recordId] || '').trim() || null;
          } else {
            updatePayload.learning_issues_note = learningIssuesNote.trim() || null;
          }
        }
        if (activeFields.has('test_fields')) {
          const unified = testContent.trim() || null;
          updatePayload.test_content = unified;
          updatePayload.test_name = unified;
          updatePayload.test_title = unified;
        }
        if (submitAfter) {
          updatePayload.submitted = true;
          updatePayload.submitted_at = now;
        }
        return updatePayload;
      };

      if (needsPerStudent) {
        // Update each record individually for per-student values
        for (const id of ids) {
          const payload = buildPayload(id);
          const { error } = await supabase.from('lesson_records').update(payload).eq('id', id);
          if (error) throw error;
        }
      } else {
        const updatePayload = buildPayload();
        const { error: updateError } = await supabase
          .from('lesson_records')
          .update(updatePayload)
          .in('id', ids);
        if (updateError) throw updateError;
      }

      // BATCH-HW-SYNC-V1: When homework_status is set to completed/partial/not_done,
      // also update the linked homework_assignments.check_status
      if (activeFields.has('homework_status')) {
        const statusToResult: Record<string, string> = {
          completed: 'completed',
          partial: 'partial',
          not_done: 'not_done',
        };

        for (const id of ids) {
          const record = drafts.find(d => d.id === id);
          if (!record) continue;

          const effectiveStatus = (usePerStudentHomework)
            ? (perStudentHomework[id] || homeworkStatus)
            : homeworkStatus;

          if (effectiveStatus === 'none_assigned') continue;

          const resultValue = statusToResult[effectiveStatus] || 'completed';

          // Update all unchecked homework_assignments linked to this lesson record
          const { error: hwSyncErr } = await supabase
            .from('homework_assignments')
            .update({
              check_status: 'checked',
              result: resultValue,
              checked_at: now,
              checked_by: user!.id,
            })
            .eq('lesson_record_id', id)
            .eq('check_status', 'unchecked');

          if (hwSyncErr) console.error('hw sync error:', hwSyncErr);

          // Also update unchecked homework assigned before this lesson date for same student+subject
          const { error: hwPrevErr } = await supabase
            .from('homework_assignments')
            .update({
              check_status: 'checked',
              result: resultValue,
              checked_at: now,
              checked_by: user!.id,
            })
            .eq('student_id', record.student_id)
            .eq('subject', record.subject as any)
            .eq('check_status', 'unchecked')
            .lt('assigned_date', searchDate);

          if (hwPrevErr) console.error('hw prev sync error:', hwPrevErr);
        }
      }

      // Handle homework assignment if toggled
      if (activeFields.has('homework_items')) {
        const selectedRecords = drafts.filter(d => selectedIds.has(d.id));
        const hwAssignments = selectedRecords.flatMap(record => {
          const sourceItems = usePerStudentHomeworkItems
            ? (perStudentHomeworkItems[record.id] || [])
            : homeworkItems;

          return sourceItems
            .filter(hw => hw.content.trim())
            .map(hw => ({
              student_id: record.student_id,
              subject: record.subject as SubjectType,
              lesson_record_id: record.id,
              assigned_date: searchDate,
              content: hw.content.trim(),
              homework_type: hw.homework_type,
              check_status: 'unchecked' as const,
              created_by: user!.id,
            }));
        });

        if (hwAssignments.length > 0) {
          const { error: hwError } = await supabase.from('homework_assignments').insert(hwAssignments);
          if (hwError) throw hwError;
        }
      }

      const fieldNames = Array.from(activeFields).map(f => FIELD_LABELS[f]).join(', ');
      toast({
        title: submitAfter ? '일괄 수정 & 제출 완료' : '일괄 수정 완료',
        description: `${ids.length}명 → [${fieldNames}] 통일 적용`,
      });

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0 bg-primary/5">
          <DialogTitle className="text-base font-bold tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {step === 'search' ? '일괄 수정 — 일지 검색' : '일괄 수정 — 항목 선택'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {step === 'search'
              ? '날짜를 선택하고 수정할 학생 일지를 골라주세요.'
              : '통일할 항목만 체크하고 값을 입력하세요. 체크하지 않은 항목은 기존 값이 유지됩니다.'}
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4 space-y-4">
          {step === 'search' ? (
            <>
              {/* Date search */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">수업일 검색</Label>
                  <Input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} className="h-9" />
                </div>
                <Button size="sm" onClick={searchDrafts} disabled={loading} className="h-9 gap-1.5">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  검색
                </Button>
              </div>

              {/* Results */}
              {drafts.length > 0 && (
                <div className="space-y-3">
                  {/* Draft records */}
                  {draftOnly.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">📝 임시저장 ({draftOnly.length})</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-6 text-xs px-2"
                            onClick={() => setSelectedIds(new Set(draftOnly.map(d => d.id)))}
                          >
                            <CheckSquare className="w-3 h-3 mr-1" />전체선택
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setSelectedIds(new Set())}>
                            해제
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded-lg overflow-hidden divide-y divide-border">
                        {draftOnly.map(d => (
                          <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors">
                            <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleDraft(d.id)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{d.student_name}</span>
                                {d.student_grade && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{d.student_grade}</Badge>}
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.subject}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{d.lesson_range || '(내용 없음)'}</p>
                            </div>
                            {d.understanding_score && <ScoreBadge score={d.understanding_score} />}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submitted records */}
                  {submittedOnly.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">✅ 제출완료 ({submittedOnly.length})</span>
                      <div className="border rounded-lg overflow-hidden divide-y divide-border opacity-60">
                        {submittedOnly.map(d => (
                          <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                            <Checkbox disabled checked={false} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{d.student_name}</span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.subject}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{d.lesson_range || '(내용 없음)'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">제출 완료된 일지는 일괄 수정 대상에서 제외됩니다.</p>
                    </div>
                  )}

                  {draftOnly.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">해당 날짜에 임시저장된 일지가 없습니다.</p>
                  )}
                </div>
              )}

              {!loading && drafts.length === 0 && searchDate && (
                <p className="text-sm text-muted-foreground text-center py-8">검색 버튼을 눌러 해당 날짜의 일지를 불러오세요.</p>
              )}
            </>
          ) : (
            /* Step 2: Edit */
            <>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-2">
                <p className="text-sm font-medium">
                  📋 선택된 학생 <strong>{selectedIds.size}명</strong>의 일지를 수정합니다.
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {drafts.filter(d => selectedIds.has(d.id)).map(d => (
                    <Badge key={d.id} variant="secondary" className="text-xs">{d.student_name} ({d.subject})</Badge>
                  ))}
                </div>
              </div>

              <p className="text-xs font-semibold text-muted-foreground">통일할 항목을 선택하세요 (체크한 항목만 변경됩니다)</p>

              <div className="space-y-3">
                {/* Lesson Range */}
                <FieldToggleBlock
                  field="lesson_range"
                  active={activeFields.has('lesson_range')}
                  onToggle={() => toggleField('lesson_range')}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={usePerStudentLessonRange}
                        onCheckedChange={v => setUsePerStudentLessonRange(v === true)}
                      />
                      <span className="text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => setUsePerStudentLessonRange(prev => !prev)}>학생별 개별 입력</span>
                    </div>

                    {usePerStudentLessonRange ? (
                      <div className="space-y-2 border rounded-lg p-2 bg-muted/20">
                        {drafts.filter(d => selectedIds.has(d.id)).map(d => (
                          <div key={d.id} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold">{d.student_name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{d.subject}</Badge>
                            </div>
                            <Textarea
                              value={perStudentLessonRange[d.id] ?? ''}
                              onChange={e => setPerStudentLessonRange(prev => ({ ...prev, [d.id]: e.target.value }))}
                              placeholder={`${d.student_name} 수업 내용...`}
                              className="min-h-[50px] resize-none text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        value={lessonRange}
                        onChange={e => setLessonRange(e.target.value)}
                        placeholder="예: 미적분 - 도함수의 활용 (증가·감소, 극값)"
                        className="min-h-[60px] resize-none"
                      />
                    )}
                  </div>
                </FieldToggleBlock>

                {/* Understanding Score */}
                <FieldToggleBlock
                  field="understanding_score"
                  active={activeFields.has('understanding_score')}
                  onToggle={() => toggleField('understanding_score')}
                >
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={usePerStudentScore}
                        onCheckedChange={v => setUsePerStudentScore(v === true)}
                      />
                      <span className="text-xs font-medium text-muted-foreground">학생별 개별 입력</span>
                    </label>

                    {usePerStudentScore ? (
                      <div className="space-y-2 border rounded-lg p-2 bg-muted/20">
                        {drafts.filter(d => selectedIds.has(d.id)).map(d => (
                          <div key={d.id} className="flex items-center gap-2">
                            <span className="text-xs font-semibold min-w-[60px]">{d.student_name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.subject}</Badge>
                            <div className="flex items-center gap-0.5 ml-auto">
                              {[1, 2, 3, 4, 5].map(score => (
                                <button
                                  key={score}
                                  onClick={() => setPerStudentScore(prev => ({ ...prev, [d.id]: score }))}
                                  className={`transition-transform hover:scale-110 ${(perStudentScore[d.id] ?? 3) === score ? 'ring-2 ring-primary ring-offset-1 rounded-full' : 'opacity-40'}`}
                                >
                                  <ScoreBadge score={score} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(score => (
                          <button
                            key={score}
                            onClick={() => setUnderstandingScore(score)}
                            className={`transition-transform hover:scale-110 ${understandingScore === score ? 'ring-2 ring-primary ring-offset-1 rounded-full' : 'opacity-40'}`}
                          >
                            <ScoreBadge score={score} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FieldToggleBlock>

                {/* Homework Status */}
                <FieldToggleBlock
                  field="homework_status"
                  active={activeFields.has('homework_status')}
                  onToggle={() => toggleField('homework_status')}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={usePerStudentHomework}
                        onCheckedChange={v => setUsePerStudentHomework(v === true)}
                      />
                      <span className="text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => setUsePerStudentHomework(prev => !prev)}>학생별 개별 입력</span>
                    </div>

                    {usePerStudentHomework ? (
                      <div className="space-y-2 border rounded-lg p-2 bg-muted/20">
                        {drafts.filter(d => selectedIds.has(d.id)).map(d => (
                          <div key={d.id} className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <span className="text-xs font-semibold min-w-[60px]">{d.student_name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.subject}</Badge>
                            <Select
                              value={perStudentHomework[d.id] || homeworkStatus}
                              onValueChange={v => setPerStudentHomework(prev => ({ ...prev, [d.id]: v }))}
                            >
                              <SelectTrigger className="h-8 w-28 text-xs ml-auto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {HOMEWORK_STATUS_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Select value={homeworkStatus} onValueChange={setHomeworkStatus}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOMEWORK_STATUS_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </FieldToggleBlock>

                {/* Learning Issues */}
                <FieldToggleBlock
                  field="learning_issues"
                  active={activeFields.has('learning_issues')}
                  onToggle={() => toggleField('learning_issues')}
                >
                   <div className="space-y-2">
                    {(() => {
                      const selectedRecords = drafts.filter(d => selectedIds.has(d.id));
                      const subjects = [...new Set(selectedRecords.map(d => d.subject))];
                      const allIssues = new Set<string>();
                      subjects.forEach(s => {
                        const issues = SUBJECT_SPECIFIC_ISSUES[s as SubjectType];
                        if (issues) issues.forEach(i => allIssues.add(i));
                      });
                      return (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {[...allIssues].map(issue => (
                              <Badge
                                key={issue}
                                variant={learningIssues.includes(issue) ? 'default' : 'outline'}
                                className="cursor-pointer text-xs"
                                onClick={() => setLearningIssues(prev => 
                                  prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue]
                                )}
                              >
                                {issue}
                              </Badge>
                            ))}
                          </div>

                          {/* Toggle: shared vs per-student notes */}
                          <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <Checkbox
                              checked={usePerStudentNotes}
                              onCheckedChange={v => setUsePerStudentNotes(v === true)}
                            />
                            <span className="text-xs font-medium text-muted-foreground">학생별 개별 상세 입력</span>
                          </label>

                          {usePerStudentNotes ? (
                            <div className="space-y-2 border rounded-lg p-2 bg-muted/20">
                              {selectedRecords.map(d => (
                                <div key={d.id} className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold">{d.student_name}</span>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{d.subject}</Badge>
                                  </div>
                                  <Textarea
                                    value={perStudentIssuesNote[d.id] || ''}
                                    onChange={e => setPerStudentIssuesNote(prev => ({ ...prev, [d.id]: e.target.value }))}
                                    placeholder={`${d.student_name} 학습 상황 상세...`}
                                    className="min-h-[40px] resize-none text-sm"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Textarea
                              value={learningIssuesNote}
                              onChange={e => setLearningIssuesNote(e.target.value)}
                              placeholder="학습 상황 상세 (리포트 근거)..."
                              className="min-h-[50px] resize-none"
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </FieldToggleBlock>

                {/* Test Fields */}
                <FieldToggleBlock
                  field="test_fields"
                  active={activeFields.has('test_fields')}
                  onToggle={() => toggleField('test_fields')}
                >
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">테스트내용 및 범위 <span className="text-destructive">*</span></Label>
                    <Input
                      value={testContent}
                      onChange={e => setTestContent(e.target.value)}
                      placeholder="예: 중2 1단원 단원평가, 영단어 Day1~5 쪽지시험..."
                      className="h-8 text-sm"
                    />
                  </div>
                </FieldToggleBlock>

                {/* Notes */}
                <FieldToggleBlock
                  field="notes"
                  active={activeFields.has('notes')}
                  onToggle={() => toggleField('notes')}
                >
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="수업 중 특이사항..."
                    className="min-h-[50px] resize-none"
                  />
                </FieldToggleBlock>

                {/* Next Lesson Goal */}
                <FieldToggleBlock
                  field="next_lesson_goal"
                  active={activeFields.has('next_lesson_goal')}
                  onToggle={() => toggleField('next_lesson_goal')}
                >
                  <Input
                    value={nextLessonGoal}
                    onChange={e => setNextLessonGoal(e.target.value)}
                    placeholder="다음 시간 진도 계획..."
                    className="h-9"
                  />
                </FieldToggleBlock>

                {/* Homework Items */}
                <FieldToggleBlock
                  field="homework_items"
                  active={activeFields.has('homework_items')}
                  onToggle={() => toggleField('homework_items')}
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={usePerStudentHomeworkItems}
                        onCheckedChange={v => setUsePerStudentHomeworkItems(v === true)}
                      />
                      <span
                        className="text-xs font-medium text-muted-foreground cursor-pointer"
                        onClick={() => setUsePerStudentHomeworkItems(prev => !prev)}
                      >
                        학생별 개별 입력
                      </span>
                    </div>

                    {usePerStudentHomeworkItems ? (
                      <div className="space-y-3 border rounded-lg p-2 bg-muted/20">
                        {drafts.filter(d => selectedIds.has(d.id)).map(d => {
                          const studentHomeworkItems = perStudentHomeworkItems[d.id] || [];
                          return (
                            <div key={d.id} className="space-y-2 rounded-lg border bg-background p-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold min-w-[60px]">{d.student_name}</span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.subject}</Badge>
                              </div>

                              {studentHomeworkItems.length === 0 ? (
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addHomework(d.id)}>
                                  <Plus className="w-3 h-3" /> 숙제 추가
                                </Button>
                              ) : (
                                <>
                                  {studentHomeworkItems.map((hw, idx) => (
                                    <div key={hw.tempId} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/30">
                                      <div className="flex-1 space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="secondary" className="text-[10px]">숙제 {idx + 1}</Badge>
                                          <Select value={hw.homework_type} onValueChange={v => updateHomework(hw.tempId, 'homework_type', v, d.id)}>
                                            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="daily">일일</SelectItem>
                                              <SelectItem value="regular">정기</SelectItem>
                                              <SelectItem value="weekly">주간</SelectItem>
                                              <SelectItem value="long_term">장기</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <Input
                                          value={hw.content}
                                          onChange={e => updateHomework(hw.tempId, 'content', e.target.value, d.id)}
                                          placeholder="숙제 내용을 입력하세요"
                                          className="h-8 text-sm"
                                        />
                                      </div>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeHomework(hw.tempId, d.id)}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addHomework(d.id)}>
                                    <Plus className="w-3 h-3" /> 숙제 추가
                                  </Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {homeworkItems.length === 0 ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addHomework()}>
                            <Plus className="w-3 h-3" /> 숙제 추가
                          </Button>
                        ) : (
                          <>
                            {homeworkItems.map((hw, idx) => (
                              <div key={hw.tempId} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/30">
                                <div className="flex-1 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-[10px]">숙제 {idx + 1}</Badge>
                                    <Select value={hw.homework_type} onValueChange={v => updateHomework(hw.tempId, 'homework_type', v)}>
                                      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="daily">일일</SelectItem>
                                        <SelectItem value="regular">정기</SelectItem>
                                        <SelectItem value="weekly">주간</SelectItem>
                                        <SelectItem value="long_term">장기</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Input
                                    value={hw.content}
                                    onChange={e => updateHomework(hw.tempId, 'content', e.target.value)}
                                    placeholder="숙제 내용을 입력하세요"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeHomework(hw.tempId)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addHomework()}>
                              <Plus className="w-3 h-3" /> 숙제 추가
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </FieldToggleBlock>
              </div>

              {/* Submit toggle */}
              <label className="flex items-center gap-2 mt-2 p-3 rounded-lg border border-dashed cursor-pointer hover:bg-accent/30 transition-colors">
                <Checkbox checked={submitAfter} onCheckedChange={v => setSubmitAfter(v === true)} />
                <span className="text-sm font-medium">수정 후 바로 제출하기</span>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 shrink-0">
          {step === 'search' ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
              <Button size="sm" onClick={goToEdit} disabled={selectedIds.size === 0} className="gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                다음: 항목 선택 ({selectedIds.size}명)
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setStep('search')}>← 돌아가기</Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={saving || activeFields.size === 0}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                일괄 적용 ({selectedIds.size}명, {activeFields.size}개 항목)
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Sub-component: toggle-able field block ── */
function FieldToggleBlock({
  field,
  active,
  onToggle,
  children,
}: {
  field: EditableField;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${active ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20 opacity-60'}`}>
      <div className="flex items-center gap-2 cursor-pointer mb-2" onClick={onToggle}>
        <Checkbox checked={active} onCheckedChange={onToggle} />
        <span className="text-sm font-semibold">{FIELD_LABELS[field]}</span>
        {active && <Badge className="text-[10px] ml-auto bg-primary/10 text-primary border-0">적용됨</Badge>}
      </div>
      {active && <div className="mt-1" onClick={e => e.stopPropagation()}>{children}</div>}
    </div>
  );
}
