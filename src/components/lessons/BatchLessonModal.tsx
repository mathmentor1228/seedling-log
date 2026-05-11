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
  learning_issues: string[] | null;
  learning_issues_note: string | null;
  attendance_status: string[] | null;
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
  /** When true, renders as a standalone full page instead of a dialog */
  standalone?: boolean;
}

// HOMEWORK-RESULT-OPTIONS-EXTENDED-V1: align with LessonRecordForm/RosterActionModal
// Stores extended UI value on homework_assignments.result while
// mapping to one of the 4 lesson_records.homework_status enum values
const HOMEWORK_STATUS_OPTIONS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '부분완료' },
  { value: 'not_done', label: '미완' },
  { value: 'lost', label: '분실' },
  { value: 'low_effort', label: '성의부족' },
  { value: 'low_effort_completed', label: '성의부족+완료' },
  { value: 'unable_to_verify', label: '확인불가' },
  { value: 'none_assigned', label: '없음' },
];

// Map extended UI result -> lesson_records.homework_status enum
function mapResultToStatus(v: string): string {
  switch (v) {
    case 'completed':
    case 'low_effort_completed':
      return 'completed';
    case 'partial':
      return 'partial';
    case 'not_done':
    case 'lost':
    case 'low_effort':
      return 'not_done';
    case 'unable_to_verify':
    case 'none_assigned':
    default:
      return 'none_assigned';
  }
}

const ABSENCE_STATUSES = ['인정결석', '무단결석', '보충불가'];
const isAbsentStatus = (att: string[] | null | undefined): boolean =>
  Array.isArray(att) && att.some(s => ABSENCE_STATUSES.includes(s));

const ATTENDANCE_STATUS_OPTIONS = [
  { value: '출석', label: '출석' },
  { value: '지각', label: '지각' },
  { value: '조퇴', label: '조퇴' },
  { value: '인정결석', label: '인정결석' },
  { value: '무단결석', label: '무단결석' },
  { value: '보충불가', label: '보충불가' },
];

type EditableField = 'lesson_types_field' | 'lesson_range' | 'understanding_score' | 'homework_status' | 'notes' | 'next_lesson_goal' | 'homework_items' | 'learning_issues' | 'test_fields' | 'parent_direct_message' | 'attendance_status';

const FIELD_LABELS: Record<EditableField, string> = {
  lesson_types_field: '수업 종류',
  attendance_status: '📋 출결 상태',
  lesson_range: '수업 내용',
  understanding_score: '이해도',
  homework_status: '숙제 상태',
  learning_issues: '학습상세상황',
  test_fields: '테스트',
  notes: '비고 / 메모',
  next_lesson_goal: '다음 수업 목표',
  homework_items: '숙제 배정',
  parent_direct_message: '📩 학부모 직접전달 메시지',
};

export function BatchLessonModal({ open, onOpenChange, onSaved, standalone = false }: BatchLessonModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<'search' | 'edit'>('search');
  const [searchDate, setSearchDate] = useState(getTodayKST());
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit state
  const [activeFields, setActiveFields] = useState<Set<EditableField>>(new Set());
  const [saving, setSaving] = useState(false);
  const [submitAfter, setSubmitAfter] = useState(false);

  // Batch values (shared)
  const [batchLessonTypes, setBatchLessonTypes] = useState<string[]>(['정규수업']);
  const [lessonRange, setLessonRange] = useState('');
  const [understandingScore, setUnderstandingScore] = useState<number>(3);
  const [homeworkStatus, setHomeworkStatus] = useState('none_assigned');
  const [learningIssues, setLearningIssues] = useState<string[]>([]);
  const [learningIssuesNote, setLearningIssuesNote] = useState('');
  const [testContent, setTestContent] = useState('');
  const [notes, setNotes] = useState('');
  const [nextLessonGoal, setNextLessonGoal] = useState('');
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
  const [parentDirectMessage, setParentDirectMessage] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<string[]>(['출석']);

  // Per-student toggles
  const [usePerStudentLessonTypes, setUsePerStudentLessonTypes] = useState(false);
  const [usePerStudentLessonRange, setUsePerStudentLessonRange] = useState(false);
  const [usePerStudentScore, setUsePerStudentScore] = useState(false);
  const [usePerStudentHomework, setUsePerStudentHomework] = useState(false);
  const [usePerStudentIssuesNote, setUsePerStudentIssuesNote] = useState(false);
  const [usePerStudentIssuesTags, setUsePerStudentIssuesTags] = useState(false);
  const [usePerStudentTest, setUsePerStudentTest] = useState(false);
  const [usePerStudentMemo, setUsePerStudentMemo] = useState(false);
  const [usePerStudentNextGoal, setUsePerStudentNextGoal] = useState(false);
  const [usePerStudentHomeworkItems, setUsePerStudentHomeworkItems] = useState(false);
  const [usePerStudentParentMsg, setUsePerStudentParentMsg] = useState(false);
  const [usePerStudentAttendance, setUsePerStudentAttendance] = useState(false);

  // Per-student values
  const [perStudentLessonTypes, setPerStudentLessonTypes] = useState<Record<string, string[]>>({});
  const [perStudentLessonRange, setPerStudentLessonRange] = useState<Record<string, string>>({});
  const [perStudentScore, setPerStudentScore] = useState<Record<string, number>>({});
  const [perStudentHomework, setPerStudentHomework] = useState<Record<string, string>>({});
  const [perStudentIssuesNote, setPerStudentIssuesNote] = useState<Record<string, string>>({});
  const [perStudentIssuesTags, setPerStudentIssuesTags] = useState<Record<string, string[]>>({});
  const [perStudentTest, setPerStudentTest] = useState<Record<string, string>>({});
  const [perStudentMemo, setPerStudentMemo] = useState<Record<string, string>>({});
  const [perStudentNextGoal, setPerStudentNextGoal] = useState<Record<string, string>>({});
  const [perStudentHomeworkItems, setPerStudentHomeworkItems] = useState<Record<string, HomeworkItem[]>>({});
  const [perStudentParentMsg, setPerStudentParentMsg] = useState<Record<string, string>>({});
  const [perStudentAttendance, setPerStudentAttendance] = useState<Record<string, string[]>>({});

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
    setBatchLessonTypes(['정규수업']);
    setLessonRange('');
    setUnderstandingScore(3);
    setHomeworkStatus('none_assigned');
    setLearningIssues([]);
    setLearningIssuesNote('');
    setTestContent('');
    setNotes('');
    setNextLessonGoal('');
    setHomeworkItems([]);
    setParentDirectMessage('');
    setAttendanceStatus(['출석']);
    setSubmitAfter(false);
    // Reset all per-student toggles
    setUsePerStudentLessonTypes(false);
    setUsePerStudentLessonRange(false);
    setUsePerStudentScore(false);
    setUsePerStudentHomework(false);
    setUsePerStudentIssuesNote(false);
    setUsePerStudentIssuesTags(false);
    setUsePerStudentTest(false);
    setUsePerStudentMemo(false);
    setUsePerStudentNextGoal(false);
    setUsePerStudentHomeworkItems(false);
    setUsePerStudentParentMsg(false);
    setUsePerStudentAttendance(false);
    // Reset all per-student values
    setPerStudentLessonTypes({});
    setPerStudentLessonRange({});
    setPerStudentScore({});
    setPerStudentHomework({});
    setPerStudentIssuesNote({});
    setPerStudentIssuesTags({});
    setPerStudentTest({});
    setPerStudentMemo({});
    setPerStudentNextGoal({});
    setPerStudentHomeworkItems({});
    setPerStudentParentMsg({});
    setPerStudentAttendance({});
  }

  async function searchDrafts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lesson_records')
        .select('id, student_id, subject, lesson_range, understanding_score, homework_status, notes, next_lesson_goal, class_id, submitted, test_content, test_name, test_result, test_result_text, lesson_types, learning_issues, learning_issues_note, attendance_status, students!inner(name, grade)')
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
        learning_issues: r.learning_issues,
        learning_issues_note: r.learning_issues_note,
        attendance_status: r.attendance_status,
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

  async function goToEdit() {
    if (selectedIds.size === 0) {
      toast({ title: '수정할 일지를 선택해주세요', variant: 'destructive' });
      return;
    }
    resetEditState();

    const selectedDrafts = drafts.filter(d => selectedIds.has(d.id));
    const first = selectedDrafts[0];

    // Pre-fill batch values from first record
    if (first) {
      setLessonRange(first.lesson_range || '');
      setUnderstandingScore(first.understanding_score ?? 3);
      setHomeworkStatus(first.homework_status || 'none_assigned');
      setNotes(first.notes || '');
      setNextLessonGoal(first.next_lesson_goal || '');
      setTestContent(first.test_content || first.test_name || '');
      setBatchLessonTypes(first.lesson_types?.length ? first.lesson_types : ['정규수업']);
      if (first.learning_issues?.length) setLearningIssues(first.learning_issues);
      if (first.learning_issues_note) setLearningIssuesNote(first.learning_issues_note);
    }

    // Pre-fill ALL per-student data from each draft
    const perRange: Record<string, string> = {};
    const perScore: Record<string, number> = {};
    const perHw: Record<string, string> = {};
    const perTypes: Record<string, string[]> = {};
    const perIssueNote: Record<string, string> = {};
    const perIssueTags: Record<string, string[]> = {};
    const perTest: Record<string, string> = {};
    const perMemo: Record<string, string> = {};
    const perGoal: Record<string, string> = {};
    const perAtt: Record<string, string[]> = {};

    for (const d of selectedDrafts) {
      if (d.lesson_range) perRange[d.id] = d.lesson_range;
      if (d.understanding_score != null) perScore[d.id] = d.understanding_score;
      if (d.homework_status) perHw[d.id] = d.homework_status;
      if (d.lesson_types?.length) perTypes[d.id] = d.lesson_types;
      if (d.learning_issues_note) perIssueNote[d.id] = d.learning_issues_note;
      if (d.learning_issues?.length) perIssueTags[d.id] = d.learning_issues;
      if (d.test_content || d.test_name) perTest[d.id] = d.test_content || d.test_name || '';
      if (d.notes) perMemo[d.id] = d.notes;
      if (d.next_lesson_goal) perGoal[d.id] = d.next_lesson_goal;
      if (d.attendance_status?.length) perAtt[d.id] = d.attendance_status;
    }
    setPerStudentLessonRange(perRange);
    setPerStudentScore(perScore);
    setPerStudentHomework(perHw);
    setPerStudentLessonTypes(perTypes);
    setPerStudentIssuesNote(perIssueNote);
    setPerStudentIssuesTags(perIssueTags);
    setPerStudentTest(perTest);
    setPerStudentMemo(perMemo);
    setPerStudentNextGoal(perGoal);
    setPerStudentAttendance(perAtt);

    // Load existing homework_assignments for selected records (content + result)
    try {
      const recordIds = selectedDrafts.map(d => d.id);
      const { data: hwData } = await supabase
        .from('homework_assignments')
        .select('id, lesson_record_id, content, homework_type, result, check_status')
        .in('lesson_record_id', recordIds);

      if (hwData && hwData.length > 0) {
        const perHwItems: Record<string, HomeworkItem[]> = {};
        const perResult: Record<string, string> = {};
        for (const hw of hwData) {
          if (!hw.lesson_record_id) continue;
          if (!perHwItems[hw.lesson_record_id]) perHwItems[hw.lesson_record_id] = [];
          perHwItems[hw.lesson_record_id].push({
            tempId: hw.id,
            content: hw.content || '',
            homework_type: hw.homework_type || 'daily',
          });
          // capture latest extended result if checked
          if (hw.check_status === 'checked' && hw.result) {
            perResult[hw.lesson_record_id] = hw.result;
          }
        }
        setPerStudentHomeworkItems(perHwItems);
        // Prefill extended homework status with assignment.result when available;
        // fall back to the lesson_records enum
        setPerStudentHomework(prev => {
          const next = { ...prev };
          for (const id of Object.keys(perResult)) next[id] = perResult[id];
          return next;
        });
      }
    } catch (e) {
      console.error('Failed to load homework assignments:', e);
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

      const needsPerStudent =
        (activeFields.has('lesson_range') && usePerStudentLessonRange) ||
        (activeFields.has('learning_issues') && (usePerStudentIssuesNote || usePerStudentIssuesTags)) ||
        (activeFields.has('understanding_score') && usePerStudentScore) ||
        (activeFields.has('homework_status') && usePerStudentHomework) ||
        (activeFields.has('lesson_types_field') && usePerStudentLessonTypes) ||
        (activeFields.has('test_fields') && usePerStudentTest) ||
        (activeFields.has('notes') && usePerStudentMemo) ||
        (activeFields.has('next_lesson_goal') && usePerStudentNextGoal) ||
        (activeFields.has('parent_direct_message') && usePerStudentParentMsg) ||
        (activeFields.has('attendance_status') && usePerStudentAttendance);

      const buildPayload = (recordId?: string): Record<string, any> => {
        const p: Record<string, any> = { updated_at: now };
        if (activeFields.has('lesson_types_field')) {
          p.lesson_types = (usePerStudentLessonTypes && recordId)
            ? (perStudentLessonTypes[recordId] ?? batchLessonTypes)
            : batchLessonTypes;
        }
        if (activeFields.has('lesson_range')) {
          p.lesson_range = (usePerStudentLessonRange && recordId)
            ? (perStudentLessonRange[recordId] ?? lessonRange).trim()
            : lessonRange.trim();
        }
        if (activeFields.has('understanding_score')) {
          // Skip understanding score for absent students
          const effAtt = activeFields.has('attendance_status')
            ? ((usePerStudentAttendance && recordId) ? (perStudentAttendance[recordId] ?? attendanceStatus) : attendanceStatus)
            : (recordId ? drafts.find(d => d.id === recordId)?.attendance_status : null);
          if (isAbsentStatus(effAtt as string[] | null)) {
            p.understanding_score = null;
          } else {
            p.understanding_score = (usePerStudentScore && recordId)
              ? (perStudentScore[recordId] ?? understandingScore)
              : understandingScore;
          }
        }
        if (activeFields.has('homework_status')) {
          const ext = (usePerStudentHomework && recordId)
            ? (perStudentHomework[recordId] || homeworkStatus)
            : homeworkStatus;
          // lesson_records.homework_status is a constrained enum, so map extended value
          p.homework_status = mapResultToStatus(ext);
        }
        if (activeFields.has('notes')) {
          const val = (usePerStudentMemo && recordId)
            ? (perStudentMemo[recordId] ?? notes)
            : notes;
          p.notes = val.trim() || null;
        }
        if (activeFields.has('next_lesson_goal')) {
          const val = (usePerStudentNextGoal && recordId)
            ? (perStudentNextGoal[recordId] ?? nextLessonGoal)
            : nextLessonGoal;
          p.next_lesson_goal = val.trim() || null;
        }
        if (activeFields.has('learning_issues')) {
          p.learning_issues = (usePerStudentIssuesTags && recordId)
            ? (perStudentIssuesTags[recordId] ?? learningIssues)
            : learningIssues;
          if (usePerStudentIssuesNote && recordId) {
            p.learning_issues_note = (perStudentIssuesNote[recordId] || '').trim() || null;
          } else {
            p.learning_issues_note = learningIssuesNote.trim() || null;
          }
        }
        if (activeFields.has('test_fields')) {
          const unified = (usePerStudentTest && recordId)
            ? (perStudentTest[recordId] ?? testContent).trim() || null
            : testContent.trim() || null;
          p.test_content = unified;
          p.test_name = unified;
          p.test_title = unified;
        }
        if (activeFields.has('parent_direct_message')) {
          const val = (usePerStudentParentMsg && recordId)
            ? (perStudentParentMsg[recordId] ?? parentDirectMessage)
            : parentDirectMessage;
          p.parent_direct_message = val.trim() || null;
        }
        if (activeFields.has('attendance_status')) {
          p.attendance_status = (usePerStudentAttendance && recordId)
            ? (perStudentAttendance[recordId] ?? attendanceStatus)
            : attendanceStatus;
        }
        if (submitAfter) {
          p.submitted = true;
          p.submitted_at = now;
        }
        return p;
      };

      if (needsPerStudent) {
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

      // Homework status sync (extended result values stored on homework_assignments.result)
      if (activeFields.has('homework_status')) {
        for (const id of ids) {
          const record = drafts.find(d => d.id === id);
          if (!record) continue;

          const effectiveStatus = usePerStudentHomework
            ? (perStudentHomework[id] || homeworkStatus)
            : homeworkStatus;

          if (effectiveStatus === 'none_assigned' || effectiveStatus === 'unable_to_verify') continue;
          const resultValue = effectiveStatus; // store the granular result as-is

          await supabase
            .from('homework_assignments')
            .update({
              check_status: 'checked',
              result: resultValue,
              checked_at: now,
              checked_by: user!.id,
            })
            .eq('lesson_record_id', id)
            .eq('check_status', 'unchecked');

          await supabase
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
        }
      }

      // Homework assignment creation
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

  const selectedDraftsList = useMemo(() => drafts.filter(d => selectedIds.has(d.id)), [drafts, selectedIds]);

  async function handleBulkDraftSave() {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const now = new Date().toISOString();

      for (const id of ids) {
        const payload: Record<string, any> = { updated_at: now, submitted: false };

        // Save per-student or shared values for ALL fields
        const range = usePerStudentLessonRange ? (perStudentLessonRange[id] ?? lessonRange) : lessonRange;
        if (range.trim()) payload.lesson_range = range.trim();

        const score = usePerStudentScore ? (perStudentScore[id] ?? understandingScore) : understandingScore;
        payload.understanding_score = score;

        const hw = usePerStudentHomework ? (perStudentHomework[id] || homeworkStatus) : homeworkStatus;
        payload.homework_status = mapResultToStatus(hw);

        const types = usePerStudentLessonTypes ? (perStudentLessonTypes[id] ?? batchLessonTypes) : batchLessonTypes;
        payload.lesson_types = types;

        const memo = usePerStudentMemo ? (perStudentMemo[id] ?? notes) : notes;
        if (memo.trim()) payload.notes = memo.trim();

        const goal = usePerStudentNextGoal ? (perStudentNextGoal[id] ?? nextLessonGoal) : nextLessonGoal;
        if (goal.trim()) payload.next_lesson_goal = goal.trim();

        const issues = usePerStudentIssuesTags ? (perStudentIssuesTags[id] ?? learningIssues) : learningIssues;
        if (issues.length > 0) payload.learning_issues = issues;

        const issueNote = usePerStudentIssuesNote ? (perStudentIssuesNote[id] ?? learningIssuesNote) : learningIssuesNote;
        if (issueNote.trim()) payload.learning_issues_note = issueNote.trim();

        const test = usePerStudentTest ? (perStudentTest[id] ?? testContent) : testContent;
        if (test.trim()) {
          payload.test_content = test.trim();
          payload.test_name = test.trim();
        }

        const pMsg = usePerStudentParentMsg ? (perStudentParentMsg[id] ?? parentDirectMessage) : parentDirectMessage;
        if (pMsg.trim()) payload.parent_direct_message = pMsg.trim();

        const att = usePerStudentAttendance ? (perStudentAttendance[id] ?? attendanceStatus) : attendanceStatus;
        if (att.length > 0) payload.attendance_status = att;

        const { error } = await supabase.from('lesson_records').update(payload).eq('id', id);
        if (error) throw error;
      }

      // Draft save must publish homework assignments immediately so students can submit
      // even before the lesson journal itself is formally submitted.
      if (activeFields.has('homework_items')) {
        const selectedRecords = drafts.filter(d => selectedIds.has(d.id));

        for (const record of selectedRecords) {
          const sourceItems = usePerStudentHomeworkItems
            ? (perStudentHomeworkItems[record.id] || [])
            : homeworkItems;
          const validItems = sourceItems.filter(hw => hw.content.trim());

          const { error: deleteError } = await supabase
            .from('homework_assignments')
            .delete()
            .eq('lesson_record_id', record.id);
          if (deleteError) throw deleteError;

          if (validItems.length === 0) continue;

          const assignments = validItems.map(hw => ({
            student_id: record.student_id,
            subject: record.subject as SubjectType,
            lesson_record_id: record.id,
            assigned_date: searchDate,
            content: hw.content.trim(),
            homework_type: hw.homework_type,
            check_status: 'unchecked' as const,
            created_by: user!.id,
          }));

          const { error: insertError } = await supabase
            .from('homework_assignments')
            .insert(assignments);
          if (insertError) throw insertError;
        }
      }

      toast({
        title: '전체 임시저장 완료',
        description: activeFields.has('homework_items')
          ? `${ids.length}명의 일지와 숙제 배정이 임시저장되었습니다.`
          : `${ids.length}명의 일지가 임시저장되었습니다.`,
      });

      // Refresh the list
      await searchDrafts();
      setStep('search');
    } catch (err: any) {
      console.error(err);
      toast({ title: '임시저장 실패', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const headerContent = (
    <div className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0 bg-primary/5">
      <div className="text-base font-bold tracking-tight flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        {step === 'search' ? '일괄 수정 — 일지 검색' : '일괄 수정 — 항목 선택'}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {step === 'search'
          ? '날짜를 선택하고 수정할 학생 일지를 골라주세요.'
          : '통일할 항목만 체크하고 값을 입력하세요. 체크하지 않은 항목은 기존 값이 유지됩니다.'}
      </p>
    </div>
  );

  const bodyContent = (
    <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4 space-y-4">
      {step === 'search' ? (
        <>
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

          {drafts.length > 0 && (
            <div className="space-y-3">
              {draftOnly.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">📝 임시저장 ({draftOnly.length})</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setSelectedIds(new Set(draftOnly.map(d => d.id)))}>
                        <CheckSquare className="w-3 h-3 mr-1" />전체선택
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setSelectedIds(new Set())}>해제</Button>
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
        <>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-2">
            <p className="text-sm font-medium">
              📋 선택된 학생 <strong>{selectedIds.size}명</strong>의 일지를 수정합니다.
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedDraftsList.map(d => (
                <Badge key={d.id} variant="secondary" className="text-xs">{d.student_name} ({d.subject})</Badge>
              ))}
            </div>
          </div>

          <p className="text-xs font-semibold text-muted-foreground">통일할 항목을 선택하세요 (체크한 항목만 변경됩니다)</p>

          <div className="space-y-3">
            {/* Lesson Types */}
            <FieldToggleBlock field="lesson_types_field" active={activeFields.has('lesson_types_field')} onToggle={() => toggleField('lesson_types_field')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentLessonTypes} onChange={setUsePerStudentLessonTypes} />
                {usePerStudentLessonTypes ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => {
                      const studentTypes = perStudentLessonTypes[d.id] ?? batchLessonTypes;
                      return (
                        <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                          <div className="flex flex-wrap gap-1">
                            {LESSON_TYPE_OPTIONS.map(opt => (
                              <Badge
                                key={opt.value}
                                variant={studentTypes.includes(opt.value) ? 'default' : 'outline'}
                                className="cursor-pointer text-xs"
                                onClick={() => {
                                  const cur = perStudentLessonTypes[d.id] ?? [...batchLessonTypes];
                                  const next = cur.includes(opt.value) ? cur.filter(v => v !== opt.value) : [...cur, opt.value];
                                  setPerStudentLessonTypes(prev => ({ ...prev, [d.id]: next.length > 0 ? next : [opt.value] }));
                                }}
                              >
                                {opt.label}
                              </Badge>
                            ))}
                          </div>
                        </StudentBlock>
                      );
                    })}
                  </PerStudentContainer>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {LESSON_TYPE_OPTIONS.map(opt => (
                      <Badge
                        key={opt.value}
                        variant={batchLessonTypes.includes(opt.value) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          setBatchLessonTypes(prev =>
                            prev.includes(opt.value)
                              ? prev.filter(v => v !== opt.value).length > 0 ? prev.filter(v => v !== opt.value) : [opt.value]
                              : [...prev, opt.value]
                          );
                        }}
                      >
                        {opt.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </FieldToggleBlock>

            {/* Attendance Status */}
            <FieldToggleBlock field="attendance_status" active={activeFields.has('attendance_status')} onToggle={() => toggleField('attendance_status')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentAttendance} onChange={setUsePerStudentAttendance} />
                {usePerStudentAttendance ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => {
                      const studentAtt = perStudentAttendance[d.id] ?? attendanceStatus;
                      return (
                        <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                          <div className="flex flex-wrap gap-1">
                            {ATTENDANCE_STATUS_OPTIONS.map(opt => (
                              <Badge
                                key={opt.value}
                                variant={studentAtt.includes(opt.value) ? 'default' : 'outline'}
                                className={`cursor-pointer text-xs ${studentAtt.includes(opt.value) && opt.value !== '출석' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80' : ''}`}
                                onClick={() => {
                                  const cur = perStudentAttendance[d.id] ?? [...attendanceStatus];
                                  if (opt.value === '출석') {
                                    setPerStudentAttendance(prev => ({ ...prev, [d.id]: ['출석'] }));
                                  } else {
                                    const without출석 = cur.filter(v => v !== '출석');
                                    const next = without출석.includes(opt.value) ? without출석.filter(v => v !== opt.value) : [...without출석, opt.value];
                                    setPerStudentAttendance(prev => ({ ...prev, [d.id]: next.length > 0 ? next : ['출석'] }));
                                  }
                                }}
                              >
                                {opt.label}
                              </Badge>
                            ))}
                          </div>
                        </StudentBlock>
                      );
                    })}
                  </PerStudentContainer>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {ATTENDANCE_STATUS_OPTIONS.map(opt => (
                      <Badge
                        key={opt.value}
                        variant={attendanceStatus.includes(opt.value) ? 'default' : 'outline'}
                        className={`cursor-pointer text-xs ${attendanceStatus.includes(opt.value) && opt.value !== '출석' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80' : ''}`}
                        onClick={() => {
                          if (opt.value === '출석') {
                            setAttendanceStatus(['출석']);
                          } else {
                            setAttendanceStatus(prev => {
                              const without출석 = prev.filter(v => v !== '출석');
                              const next = without출석.includes(opt.value) ? without출석.filter(v => v !== opt.value) : [...without출석, opt.value];
                              return next.length > 0 ? next : ['출석'];
                            });
                          }
                        }}
                      >
                        {opt.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </FieldToggleBlock>

            {/* Lesson Range */}
            <FieldToggleBlock field="lesson_range" active={activeFields.has('lesson_range')} onToggle={() => toggleField('lesson_range')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentLessonRange} onChange={setUsePerStudentLessonRange} />
                {usePerStudentLessonRange ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => (
                      <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                        <Textarea
                          value={perStudentLessonRange[d.id] ?? lessonRange}
                          onChange={e => setPerStudentLessonRange(prev => ({ ...prev, [d.id]: e.target.value }))}
                          className="text-sm min-h-[60px]"
                          placeholder="수업 내용"
                        />
                      </StudentBlock>
                    ))}
                  </PerStudentContainer>
                ) : (
                  <Textarea value={lessonRange} onChange={e => setLessonRange(e.target.value)} className="text-sm min-h-[60px]" placeholder="수업 내용 (공통)" />
                )}
              </div>
            </FieldToggleBlock>

            {/* Understanding Score */}
            <FieldToggleBlock field="understanding_score" active={activeFields.has('understanding_score')} onToggle={() => toggleField('understanding_score')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentScore} onChange={setUsePerStudentScore} />
                {usePerStudentScore ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => (
                      <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Button
                              key={s}
                              variant={(perStudentScore[d.id] ?? understandingScore) === s ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 w-7 p-0 text-xs"
                              onClick={() => setPerStudentScore(prev => ({ ...prev, [d.id]: s }))}
                            >
                              {s}
                            </Button>
                          ))}
                        </div>
                      </StudentBlock>
                    ))}
                  </PerStudentContainer>
                ) : (
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Button key={s} variant={understandingScore === s ? 'default' : 'outline'} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setUnderstandingScore(s)}>
                        {s}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </FieldToggleBlock>

            {/* Homework Status */}
            <FieldToggleBlock field="homework_status" active={activeFields.has('homework_status')} onToggle={() => toggleField('homework_status')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentHomework} onChange={setUsePerStudentHomework} />
                {usePerStudentHomework ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => {
                      const items = perStudentHomeworkItems[d.id] || [];
                      return (
                        <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                          {items.length > 0 && (
                            <div className="mb-1.5 space-y-0.5">
                              {items.map(it => (
                                <p key={it.tempId} className="text-[11px] text-muted-foreground leading-tight">
                                  • {it.content || '(내용 없음)'}
                                </p>
                              ))}
                            </div>
                          )}
                          <Select value={perStudentHomework[d.id] || homeworkStatus} onValueChange={v => setPerStudentHomework(prev => ({ ...prev, [d.id]: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {HOMEWORK_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </StudentBlock>
                      );
                    })}
                  </PerStudentContainer>
                ) : (
                  <Select value={homeworkStatus} onValueChange={setHomeworkStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOMEWORK_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </FieldToggleBlock>

            {/* Learning Issues */}
            <FieldToggleBlock field="learning_issues" active={activeFields.has('learning_issues')} onToggle={() => toggleField('learning_issues')}>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">학습 이슈 태그</Label>
                  <PerStudentToggle checked={usePerStudentIssuesTags} onChange={setUsePerStudentIssuesTags} label="학생별 개별 태그" />
                  {usePerStudentIssuesTags ? (
                    <PerStudentContainer>
                      {selectedDraftsList.map(d => {
                        const subjectIssues = SUBJECT_SPECIFIC_ISSUES[d.subject as SubjectType] || SUBJECT_SPECIFIC_ISSUES['수학'];
                        const studentTags = perStudentIssuesTags[d.id] ?? learningIssues;
                        return (
                          <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                            <div className="flex flex-wrap gap-1">
                              {subjectIssues.map(issue => (
                                <Badge
                                  key={issue}
                                  variant={studentTags.includes(issue) ? 'default' : 'outline'}
                                  className="cursor-pointer text-xs"
                                  onClick={() => {
                                    const cur = perStudentIssuesTags[d.id] ?? [...learningIssues];
                                    const next = cur.includes(issue) ? cur.filter(i => i !== issue) : [...cur, issue];
                                    setPerStudentIssuesTags(prev => ({ ...prev, [d.id]: next }));
                                  }}
                                >
                                  {issue}
                                </Badge>
                              ))}
                            </div>
                          </StudentBlock>
                        );
                      })}
                    </PerStudentContainer>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(SUBJECT_SPECIFIC_ISSUES[(selectedDraftsList[0]?.subject as SubjectType)] || SUBJECT_SPECIFIC_ISSUES['수학']).map(issue => (
                        <Badge
                          key={issue}
                          variant={learningIssues.includes(issue) ? 'default' : 'outline'}
                          className="cursor-pointer text-xs"
                          onClick={() => setLearningIssues(prev => prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue])}
                        >
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">이슈 상세 메모</Label>
                  <PerStudentToggle checked={usePerStudentIssuesNote} onChange={setUsePerStudentIssuesNote} label="학생별 개별 메모" />
                  {usePerStudentIssuesNote ? (
                    <PerStudentContainer>
                      {selectedDraftsList.map(d => (
                        <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                          <Textarea
                            value={perStudentIssuesNote[d.id] ?? learningIssuesNote}
                            onChange={e => setPerStudentIssuesNote(prev => ({ ...prev, [d.id]: e.target.value }))}
                            className="text-sm min-h-[50px]"
                            placeholder="학습 이슈 상세"
                          />
                        </StudentBlock>
                      ))}
                    </PerStudentContainer>
                  ) : (
                    <Textarea value={learningIssuesNote} onChange={e => setLearningIssuesNote(e.target.value)} className="text-sm min-h-[50px]" placeholder="학습 이슈 상세 (공통)" />
                  )}
                </div>
              </div>
            </FieldToggleBlock>

            {/* Test Fields */}
            <FieldToggleBlock field="test_fields" active={activeFields.has('test_fields')} onToggle={() => toggleField('test_fields')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentTest} onChange={setUsePerStudentTest} />
                {usePerStudentTest ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => (
                      <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                        <Input
                          value={perStudentTest[d.id] ?? testContent}
                          onChange={e => setPerStudentTest(prev => ({ ...prev, [d.id]: e.target.value }))}
                          className="h-8 text-sm"
                          placeholder="테스트 내용"
                        />
                      </StudentBlock>
                    ))}
                  </PerStudentContainer>
                ) : (
                  <Input value={testContent} onChange={e => setTestContent(e.target.value)} className="h-8 text-sm" placeholder="테스트 내용 (공통)" />
                )}
              </div>
            </FieldToggleBlock>

            {/* Notes / Memo */}
            <FieldToggleBlock field="notes" active={activeFields.has('notes')} onToggle={() => toggleField('notes')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentMemo} onChange={setUsePerStudentMemo} />
                {usePerStudentMemo ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => (
                      <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                        <Textarea
                          value={perStudentMemo[d.id] ?? notes}
                          onChange={e => setPerStudentMemo(prev => ({ ...prev, [d.id]: e.target.value }))}
                          className="text-sm min-h-[50px]"
                          placeholder="메모"
                        />
                      </StudentBlock>
                    ))}
                  </PerStudentContainer>
                ) : (
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-sm min-h-[50px]" placeholder="비고 / 메모 (공통)" />
                )}
              </div>
            </FieldToggleBlock>

            {/* Next Lesson Goal */}
            <FieldToggleBlock field="next_lesson_goal" active={activeFields.has('next_lesson_goal')} onToggle={() => toggleField('next_lesson_goal')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentNextGoal} onChange={setUsePerStudentNextGoal} />
                {usePerStudentNextGoal ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => (
                      <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                        <Textarea
                          value={perStudentNextGoal[d.id] ?? nextLessonGoal}
                          onChange={e => setPerStudentNextGoal(prev => ({ ...prev, [d.id]: e.target.value }))}
                          className="text-sm min-h-[50px]"
                          placeholder="다음 수업 목표"
                        />
                      </StudentBlock>
                    ))}
                  </PerStudentContainer>
                ) : (
                  <Textarea value={nextLessonGoal} onChange={e => setNextLessonGoal(e.target.value)} className="text-sm min-h-[50px]" placeholder="다음 수업 목표 (공통)" />
                )}
              </div>
            </FieldToggleBlock>

            {/* Homework Items */}
            <FieldToggleBlock field="homework_items" active={activeFields.has('homework_items')} onToggle={() => toggleField('homework_items')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentHomeworkItems} onChange={setUsePerStudentHomeworkItems} />
                {usePerStudentHomeworkItems ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => {
                      const items = perStudentHomeworkItems[d.id] || [];
                      return (
                        <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                          <div className="space-y-1.5">
                            {items.map(hw => (
                              <div key={hw.tempId} className="flex items-center gap-2">
                                <Input
                                  value={hw.content}
                                  onChange={e => updateHomework(hw.tempId, 'content', e.target.value, d.id)}
                                  className="h-7 text-xs flex-1"
                                  placeholder="숙제 내용"
                                />
                                <Select value={hw.homework_type} onValueChange={v => updateHomework(hw.tempId, 'homework_type', v, d.id)}>
                                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="daily">매일</SelectItem>
                                    <SelectItem value="weekly">주간</SelectItem>
                                    <SelectItem value="long_term">장기</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeHomework(hw.tempId, d.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => addHomework(d.id)}>
                              <Plus className="w-3 h-3" />추가
                            </Button>
                          </div>
                        </StudentBlock>
                      );
                    })}
                  </PerStudentContainer>
                ) : (
                  <div className="space-y-1.5">
                    {homeworkItems.map(hw => (
                      <div key={hw.tempId} className="flex items-center gap-2">
                        <Input
                          value={hw.content}
                          onChange={e => updateHomework(hw.tempId, 'content', e.target.value)}
                          className="h-7 text-xs flex-1"
                          placeholder="숙제 내용"
                        />
                        <Select value={hw.homework_type} onValueChange={v => updateHomework(hw.tempId, 'homework_type', v)}>
                          <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">매일</SelectItem>
                            <SelectItem value="weekly">주간</SelectItem>
                            <SelectItem value="long_term">장기</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeHomework(hw.tempId)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => addHomework()}>
                      <Plus className="w-3 h-3" />추가
                    </Button>
                  </div>
                )}
              </div>
            </FieldToggleBlock>

            {/* Parent Direct Message */}
            <FieldToggleBlock field="parent_direct_message" active={activeFields.has('parent_direct_message')} onToggle={() => toggleField('parent_direct_message')}>
              <div className="space-y-2">
                <PerStudentToggle checked={usePerStudentParentMsg} onChange={setUsePerStudentParentMsg} />
                {usePerStudentParentMsg ? (
                  <PerStudentContainer>
                    {selectedDraftsList.map(d => (
                      <StudentBlock key={d.id} name={d.student_name} subject={d.subject}>
                        <Textarea
                          value={perStudentParentMsg[d.id] ?? parentDirectMessage}
                          onChange={e => setPerStudentParentMsg(prev => ({ ...prev, [d.id]: e.target.value }))}
                          className="text-sm min-h-[60px]"
                          placeholder="학부모에게 전달할 메시지를 입력하세요"
                        />
                      </StudentBlock>
                    ))}
                  </PerStudentContainer>
                ) : (
                  <Textarea value={parentDirectMessage} onChange={e => setParentDirectMessage(e.target.value)} className="text-sm min-h-[60px]" placeholder="학부모 직접전달 메시지 (전체 공통)" />
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
  );

  const footerContent = (
    <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 shrink-0">
      {step === 'search' ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {standalone ? '닫기' : '취소'}
          </Button>
          <Button size="sm" onClick={goToEdit} disabled={selectedIds.size === 0} className="gap-1.5">
            <ArrowRight className="w-3.5 h-3.5" />
            다음: 항목 선택 ({selectedIds.size}명)
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" size="sm" onClick={() => setStep('search')}>← 돌아가기</Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDraftSave}
              disabled={saving || selectedIds.size === 0}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              전체 임시저장
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={saving || activeFields.size === 0}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              일괄 적용 ({selectedIds.size}명, {activeFields.size}개 항목)
            </Button>
          </div>
        </>
      )}
    </div>
  );

  // Standalone full-page mode (no Dialog wrapper)
  if (standalone) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 border-x border-border/40">
          {headerContent}
          {bodyContent}
          {footerContent}
        </div>
      </div>
    );
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
        {bodyContent}
        {footerContent}
      </DialogContent>
    </Dialog>
  );
}

/* ── Sub-components ── */

function FieldToggleBlock({ field, active, onToggle, children }: { field: EditableField; active: boolean; onToggle: () => void; children: React.ReactNode }) {
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

function PerStudentToggle({ checked, onChange, label = '학생별 개별 입력' }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer" onClick={e => e.stopPropagation()}>
      <Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </label>
  );
}

function PerStudentContainer({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 border rounded-lg p-2 bg-muted/20">{children}</div>;
}

function StudentBlock({ name, subject, children }: { name: string; subject: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold">{name}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{subject}</Badge>
      </div>
      {children}
    </div>
  );
}

