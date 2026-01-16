import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth, isAssistant as checkIsAssistant, isTeacher as checkIsTeacher, isAdmin as checkIsAdmin, canManageLessons } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScoreBadge } from '@/components/ui/score-badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, Send, FileEdit, CheckCircle2, Clock, AlertCircle, HelpCircle, XCircle, ClipboardCheck, ClipboardList, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { MathCurriculumTag } from './MathCurriculumTag';

type SubjectType = '수학' | '과학' | '영어' | '국어';

export interface LessonFormContext {
  student_id: string;
  class_id: string;
  subject: string;
  lesson_date: string;
}

export interface LessonRecordFormProps {
  initialContext?: LessonFormContext;
  existingRecordId?: string | null;
  onSaved?: () => void;
  onSubmitted?: () => void;
  onCancel?: () => void;
  students: { id: string; name: string }[];
  classes: { id: string; name: string; subject: string }[];
  mode?: 'view' | 'edit';
  onRequestEdit?: () => void;
  originalTeacherId?: string | null;
}

interface HomeworkAssignment {
  id: string;
  student_id: string;
  subject: SubjectType;
  lesson_record_id: string | null;
  assigned_date: string;
  content: string;
  check_status: 'unchecked' | 'checked';
  result: 'completed' | 'partial' | 'not_done' | 'unable_to_verify' | null;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  checker_name?: string;
}

interface LessonRecord {
  id: string;
  student_id: string;
  class_id: string | null;
  subject: SubjectType;
  lesson_date: string;
  lesson_range: string;
  understanding_score: number;
  homework_status: string;
  learning_issues: string[];
  learning_issues_note: string | null;
  next_lesson_goal: string | null;
  notes: string | null;
  student_name?: string;
  submitted: boolean;
  submitted_at: string | null;
  draft_created_at: string;
  test_name?: string | null;
  test_result_text?: string | null;
  test_result?: 'pass' | 'fail' | 'none';
  test_notes?: string | null;
  test_date?: string | null;
  test_time?: string | null;
  test_assistant?: string | null;
  lesson_types?: string[];
  attendance_status?: string[];
  prev_homework_override_text?: string | null;
  prev_homework_override_by?: string | null;
  prev_homework_override_at?: string | null;
  // MATH-CURRICULUM-TAG-V1: Curriculum fields
  curriculum_version?: string | null;
  course?: string | null;
  curriculum_unit_key?: string | null;
}

const SUBJECTS = [
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '영어', label: '영어' },
  { value: '국어', label: '국어' },
] as const;

const SUBJECT_VALUES: SubjectType[] = ['수학', '과학', '영어', '국어'];

const SUBJECT_SPECIFIC_ISSUES: Record<SubjectType, string[]> = {
  '수학': ['개념 이해 부족', '계산 실수 잦음', '문제 해석 미흡', '풀이 과정 정리 필요', '응용·서술형 약함', '시간 관리 어려움'],
  '과학': ['개념 연결 미흡', '암기 부족', '자료 해석 어려움', '실험·탐구 서술 약함', '단원 간 개념 혼동'],
  '영어': ['단어 이해 부족', '문법 개념 혼동', '독해 속도 느림', '근거 문장 찾기 어려움', '듣기 이해 부족'],
  '국어': ['지문 독해 어려움', '핵심 개념어 정리 미흡', '서술형 논리 부족', '문학 표현 분석 미흡', '시간 배분 문제'],
};

const HOMEWORK_STATUS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '부분 완료' },
  { value: 'not_done', label: '미완료' },
  { value: 'none_assigned', label: '미배정' },
];

const LESSON_TYPE_OPTIONS = [
  { value: '정규수업', label: '정규수업' },
  { value: '보충수업', label: '보충수업' },
  { value: '시험특강', label: '시험특강' },
  { value: '방학특강', label: '방학특강' },
  { value: '공지사항', label: '공지사항' },
  { value: '휴강', label: '휴강' },
];

const ATTENDANCE_STATUS_OPTIONS = [
  { value: '정상등원', label: '정상등원' },
  { value: '지각', label: '지각' },
  { value: '조퇴', label: '조퇴' },
  { value: '인정결석', label: '인정결석' },
  { value: '무단결석', label: '무단결석' },
  { value: '보충불가', label: '보충불가' },
];

const HOMEWORK_RESULT_OPTIONS = [
  { value: 'completed', label: '완료', icon: CheckCircle2, color: 'text-green-600' },
  { value: 'partial', label: '부분', icon: Clock, color: 'text-amber-600' },
  { value: 'not_done', label: '미완', icon: XCircle, color: 'text-red-600' },
  { value: 'unable_to_verify', label: '확인불가', icon: HelpCircle, color: 'text-muted-foreground' },
];

function getLearningIssuesForSubject(subject: SubjectType | ''): string[] {
  if (!subject || !SUBJECT_VALUES.includes(subject as SubjectType)) return [];
  return SUBJECT_SPECIFIC_ISSUES[subject as SubjectType];
}

function subjectStorageKey(userId?: string | null) {
  return userId ? `lesson_records:lastSelectedSubject:${userId}` : 'lesson_records:lastSelectedSubject';
}

function getLastSelectedSubject(userId?: string | null): SubjectType {
  const raw = localStorage.getItem(subjectStorageKey(userId));
  if (raw && SUBJECT_VALUES.includes(raw as SubjectType)) return raw as SubjectType;
  return '수학';
}

function setLastSelectedSubject(userId: string | null | undefined, subject: SubjectType) {
  localStorage.setItem(subjectStorageKey(userId), subject);
}

const TEST_TIME_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const hour = 16 + Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

/**
 * LessonRecordForm - Shared component for lesson record creation and editing
 * Used by both Dashboard and Lessons pages via LessonModal wrapper.
 * LESSON-SHARED-FORM-V2
 */
export function LessonRecordForm({
  initialContext,
  existingRecordId,
  onSaved,
  onSubmitted,
  onCancel,
  students,
  classes,
  mode = 'edit',
  onRequestEdit,
  originalTeacherId,
}: LessonRecordFormProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  // View mode: all inputs disabled, no auto-save, no mutations
  const isViewMode = mode === 'view';
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAssistant = checkIsAssistant(role);
  const isTeacher = checkIsTeacher(role);
  const isAdmin = checkIsAdmin(role);
  const canManage = canManageLessons(role);

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonRecord | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(existingRecordId || null);

  const [formData, setFormData] = useState({
    student_id: initialContext?.student_id || '',
    class_id: initialContext?.class_id || '',
    subject: initialContext?.subject || getLastSelectedSubject(user?.id),
    lesson_date: initialContext?.lesson_date || getTodayKST(),
    lesson_range: '',
    understanding_score: '3',
    homework_status: 'none_assigned',
    learning_issues: [] as string[],
    learning_issues_note: '',
    next_lesson_goal: '',
    notes: '',
    lesson_types: ['정규수업'] as string[],
    attendance_status: ['정상등원'] as string[],
    // MATH-CURRICULUM-TAG-V2: Curriculum fields
    curriculum_version: '',
    course: '',
    curriculum_unit_key: '',
  });

  // MATH-CURRICULUM-TAG-V2: Validation state for custom course
  const [hasCustomCourseError, setHasCustomCourseError] = useState(false);

  // Previous lesson state
  const [previousLesson, setPreviousLesson] = useState<LessonRecord | null>(null);
  const [previousLessonHomework, setPreviousLessonHomework] = useState<HomeworkAssignment | null>(null);
  const [loadingPreviousLesson, setLoadingPreviousLesson] = useState(false);

  // Homework states
  const [previousHomework, setPreviousHomework] = useState<HomeworkAssignment | null>(null);
  const [homeworkCheckResult, setHomeworkCheckResult] = useState<string>('');
  const [homeworkCheckNotes, setHomeworkCheckNotes] = useState<string>('');
  const [isSavingHomeworkCheck, setIsSavingHomeworkCheck] = useState(false);
  const [newHomeworkContent, setNewHomeworkContent] = useState('');

  // Test fields state
  const [testFormData, setTestFormData] = useState({
    test_name: '',
    test_result_text: '',
    test_result: 'none' as 'pass' | 'fail' | 'none',
    test_notes: '',
    test_date: '',
    test_time: '',
    test_assistant: '',
  });
  const [isSavingTestFields, setIsSavingTestFields] = useState(false);

  // Override state
  const [prevHomeworkOverrideEditing, setPrevHomeworkOverrideEditing] = useState(false);
  const [prevHomeworkOverrideText, setPrevHomeworkOverrideText] = useState('');
  const [isSavingPrevHomeworkOverride, setIsSavingPrevHomeworkOverride] = useState(false);

  // Initialize form
  useEffect(() => {
    initializeForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingRecordId, initialContext, isViewMode]);

  async function initializeForm() {
    if (!user) return;
    setLoading(true);

    try {
      let recordId = existingRecordId;

      // If no existing record ID, check if one exists for this context
      if (!recordId && initialContext?.student_id && initialContext?.class_id) {
        const { data: existing } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', initialContext.student_id)
          .eq('class_id', initialContext.class_id)
          .eq('lesson_date', initialContext.lesson_date || getTodayKST())
          .eq('subject', (initialContext.subject || getLastSelectedSubject(user.id)) as SubjectType)
          .maybeSingle();

        if (existing) {
          recordId = existing.id;
        }
      }

      if (recordId) {
        // Load existing record
        const { data: record } = await supabase
          .from('lesson_records')
          .select('*')
          .eq('id', recordId)
          .single();

        if (record) {
          setEditingLesson(record as LessonRecord);
          setCurrentDraftId(record.id);
          setFormData({
            student_id: record.student_id,
            class_id: record.class_id || '',
            subject: record.subject,
            lesson_date: record.lesson_date,
            lesson_range: record.lesson_range,
            understanding_score: record.understanding_score.toString(),
            homework_status: record.homework_status,
            learning_issues: record.learning_issues || [],
            learning_issues_note: record.learning_issues_note || '',
            next_lesson_goal: record.next_lesson_goal || '',
            notes: record.notes || '',
            lesson_types: record.lesson_types || ['정규수업'],
            attendance_status: record.attendance_status || ['정상등원'],
            // MATH-CURRICULUM-TAG-V1: Load curriculum fields
            curriculum_version: (record as any).curriculum_version || '',
            course: (record as any).course || '',
            curriculum_unit_key: (record as any).curriculum_unit_key || '',
          });
          setTestFormData({
            test_name: record.test_name || '',
            test_result_text: record.test_result_text || '',
            test_result: (record.test_result as 'pass' | 'fail' | 'none') || 'none',
            test_notes: record.test_notes || '',
            test_date: record.test_date || record.lesson_date,
            test_time: record.test_time || '',
            test_assistant: record.test_assistant || '',
          });

          // Load homework content
          const { data: existingHw } = await supabase
            .from('homework_assignments')
            .select('content')
            .eq('lesson_record_id', record.id)
            .maybeSingle();
          if (existingHw?.content) {
            setNewHomeworkContent(existingHw.content);
          }
        }
      } else if (initialContext && canManage) {
        // VIEW_MODE_WRITE_GUARD: Block draft creation in view mode
        if (isViewMode) {
          console.log('[VIEW_MODE_WRITE_GUARD]', 'blocked draft creation in view mode');
          // Just populate form data from context without creating a draft
          setFormData(prev => ({
            ...prev,
            student_id: initialContext.student_id,
            class_id: initialContext.class_id || '',
            subject: initialContext.subject || getLastSelectedSubject(user.id),
            lesson_date: initialContext.lesson_date || getTodayKST(),
          }));
        } else {
          // Create new draft only in edit mode
          const { data: newRecord, error } = await supabase
            .from('lesson_records')
            .insert({
              teacher_id: user.id,
              student_id: initialContext.student_id,
              class_id: initialContext.class_id || null,
              subject: (initialContext.subject || getLastSelectedSubject(user.id)) as SubjectType,
              lesson_date: initialContext.lesson_date || getTodayKST(),
              lesson_range: '',
              understanding_score: 3,
              homework_status: 'none_assigned',
              learning_issues: [],
              submitted: false,
            } as any)
            .select()
            .single();

          if (!error && newRecord) {
            setCurrentDraftId(newRecord.id);
            setFormData(prev => ({
              ...prev,
              student_id: initialContext.student_id,
              class_id: initialContext.class_id || '',
              subject: initialContext.subject || getLastSelectedSubject(user.id),
              lesson_date: initialContext.lesson_date || getTodayKST(),
            }));
          }
        }
      }
    } catch (error) {
      console.error('Error initializing form:', error);
    } finally {
      setLoading(false);
    }
  }

  // PREV_HW_RLS_FIX_V1: Fetch previous lesson by student_id + subject only (not class_id/teacher_id)
  const [prevHwDebugInfo, setPrevHwDebugInfo] = useState<{ rows: number; found: boolean; srcDate: string; srcTeacher: string }>({ rows: 0, found: false, srcDate: '-', srcTeacher: '-' });
  
  const fetchPreviousLesson = useCallback(async (studentId: string, subject: string, currentDate: string) => {
    if (!studentId || !subject) {
      setPreviousLesson(null);
      setPreviousLessonHomework(null);
      setPrevHwDebugInfo({ rows: 0, found: false, srcDate: '-', srcTeacher: '-' });
      return;
    }

    setLoadingPreviousLesson(true);
    try {
      // PREV_HW_RLS_FIX_V1: Chain by student_id + subject only, ignore class_id/teacher_id
      // Exclude 휴강/공지사항 lesson types
      const { data: lessonData } = await supabase
        .from('lesson_records')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject', subject as SubjectType)
        .lt('lesson_date', currentDate)
        .eq('submitted', true)
        .order('lesson_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(10); // Get more to filter out 휴강/공지사항

      // Filter out 휴강/공지사항 lesson types and find the first valid one with homework
      let validLesson: LessonRecord | null = null;
      let homeworkData: HomeworkAssignment | null = null;
      
      for (const lesson of (lessonData || [])) {
        const lessonTypes = (lesson as any).lesson_types || [];
        if (lessonTypes.includes('휴강') || lessonTypes.includes('공지사항')) {
          continue; // Skip 휴강/공지사항 records
        }
        
        // Check if this lesson has homework
        const { data: hw } = await supabase
          .from('homework_assignments')
          .select('*')
          .eq('lesson_record_id', lesson.id)
          .maybeSingle();
        
        if (hw && hw.content && hw.content.trim() !== '') {
          validLesson = lesson as LessonRecord;
          homeworkData = hw as HomeworkAssignment;
          break;
        }
      }

      const totalRows = lessonData?.length || 0;
      if (validLesson) {
        setPreviousLesson(validLesson);
        setPrevHwDebugInfo({
          rows: totalRows,
          found: true,
          srcDate: validLesson.lesson_date,
          srcTeacher: (validLesson as any).teacher_id?.substring(0, 8) || '-',
        });

        if (homeworkData) {
          let checkerName = '';
          if (homeworkData.checked_by) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', homeworkData.checked_by)
              .maybeSingle();
            checkerName = profile?.full_name || profile?.email || '';
          }
          setPreviousLessonHomework({ ...homeworkData, checker_name: checkerName } as HomeworkAssignment);
          setPreviousHomework({ ...homeworkData, checker_name: checkerName } as HomeworkAssignment);

          if (homeworkData.check_status !== 'checked') {
            setHomeworkCheckResult('');
            setHomeworkCheckNotes('');
          } else {
            setHomeworkCheckResult(homeworkData.result || '');
            setHomeworkCheckNotes(homeworkData.notes || '');
          }
        } else {
          setPreviousLessonHomework(null);
        }
      } else {
        setPreviousLesson(null);
        setPreviousLessonHomework(null);
        setPrevHwDebugInfo({ rows: totalRows, found: false, srcDate: '-', srcTeacher: '-' });
      }
    } catch (error) {
      console.error('Error fetching previous lesson:', error);
      setPrevHwDebugInfo({ rows: 0, found: false, srcDate: '-', srcTeacher: '-' });
    } finally {
      setLoadingPreviousLesson(false);
    }
  }, []);

  // PREV_HW_CHAIN_V2: Effect to fetch previous lesson when student/subject/date changes
  useEffect(() => {
    if (!loading && formData.student_id && formData.subject && formData.lesson_date) {
      fetchPreviousLesson(formData.student_id, formData.subject, formData.lesson_date);
    }
  }, [loading, formData.student_id, formData.subject, formData.lesson_date, fetchPreviousLesson]);

  function buildPayload(includeTestFields: boolean = false) {
    const subject = formData.subject as SubjectType;
    const lesson_types = formData.lesson_types.length > 0 ? formData.lesson_types : ['정규수업'];
    const attendance_status = formData.attendance_status.length > 0 ? formData.attendance_status : ['정상등원'];

    // LESSON-EDIT-MODE-V1: Preserve original teacher_id in edit mode unless explicitly new record
    const teacherId = originalTeacherId || user!.id;

    // MATH-CURRICULUM-TAG-V1: Include curriculum fields for Math subject
    const curriculumFields = subject === '수학' ? {
      curriculum_version: formData.curriculum_version || null,
      course: formData.course || null,
      curriculum_unit_key: formData.curriculum_unit_key || null,
    } : {
      curriculum_version: null,
      course: null,
      curriculum_unit_key: null,
    };

    const basePayload = {
      teacher_id: teacherId,
      student_id: formData.student_id,
      class_id: formData.class_id || null,
      subject,
      lesson_date: formData.lesson_date,
      lesson_range: formData.lesson_range.trim(),
      // TESTVISIT-SCORE-V1: Set understanding_score to NULL for test-only visits (like absences)
      understanding_score: lesson_types.includes('테스트방문') ? null : parseInt(formData.understanding_score),
      homework_status: formData.homework_status,
      learning_issues: formData.learning_issues,
      learning_issues_note: formData.learning_issues_note.trim() || null,
      next_lesson_goal: formData.next_lesson_goal.trim() || null,
      notes: formData.notes.trim() || null,
      lesson_types,
      attendance_status,
      ...curriculumFields,
    };

    if (includeTestFields) {
      return {
        ...basePayload,
        test_name: testFormData.test_name || null,
        test_result_text: testFormData.test_result_text || null,
        test_result: formData.subject === '영어' ? testFormData.test_result : 'none',
        test_notes: testFormData.test_notes || null,
        test_date: testFormData.test_date || null,
        test_time: testFormData.test_time || null,
        test_assistant: testFormData.test_assistant || null,
      };
    }

    return basePayload;
  }

  const handleSaveDraft = async () => {
    // VIEW_MODE_WRITE_GUARD: Block all writes in view mode
    if (isViewMode) {
      console.log('[VIEW_MODE_WRITE_GUARD]', 'blocked handleSaveDraft in view mode');
      return;
    }

    if (!user || !formData.student_id) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }

    // MATH-CURRICULUM-TAG-V2: Block save if custom course is empty
    if (formData.subject === '수학' && hasCustomCourseError) {
      toast({ title: '수학 과정명을 입력해주세요', variant: 'destructive' });
      return;
    }

    setIsSavingDraft(true);
    try {
      const payload = buildPayload(true);
      const draftId = currentDraftId || editingLesson?.id;
      let finalDraftId = draftId;

      if (draftId) {
        const { error } = await supabase
          .from('lesson_records')
          .update({ ...payload, submitted: false })
          .eq('id', draftId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('lesson_records')
          .insert({ ...payload, submitted: false })
          .select()
          .single();
        if (error) throw error;
        setCurrentDraftId(data.id);
        finalDraftId = data.id;
      }

      // Save homework
      if (newHomeworkContent.trim() && finalDraftId) {
        const { data: existingHw } = await supabase
          .from('homework_assignments')
          .select('id')
          .eq('lesson_record_id', finalDraftId)
          .maybeSingle();

        if (existingHw) {
          await supabase.from('homework_assignments').update({ content: newHomeworkContent.trim() }).eq('id', existingHw.id);
        } else {
          await supabase.from('homework_assignments').insert({
            student_id: formData.student_id,
            subject: formData.subject as SubjectType,
            lesson_record_id: finalDraftId,
            assigned_date: formData.lesson_date,
            content: newHomeworkContent.trim(),
          });
        }
      }

      toast({ title: '임시저장 완료' });
      onSaved?.();
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // VIEW_MODE_WRITE_GUARD: Block all writes in view mode
    if (isViewMode) {
      console.log('[VIEW_MODE_WRITE_GUARD]', 'blocked handleSubmit in view mode');
      return;
    }

    if (!user || !formData.student_id || !formData.subject || !formData.lesson_range) {
      toast({ title: '필수 항목을 모두 입력해주세요', variant: 'destructive' });
      return;
    }

    // MATH-CURRICULUM-TAG-V2: Block submit if custom course is empty
    if (formData.subject === '수학' && hasCustomCourseError) {
      toast({ title: '수학 과정명을 입력해주세요', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = { ...buildPayload(true), submitted: true, submitted_at: new Date().toISOString() };
      const recordId = currentDraftId || editingLesson?.id;
      let finalRecordId = recordId;

      if (recordId) {
        const { error } = await supabase.from('lesson_records').update(payload).eq('id', recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('lesson_records').insert(payload).select().single();
        if (error) throw error;
        finalRecordId = data.id;
      }

      // Save homework
      if (newHomeworkContent.trim() && finalRecordId) {
        const { data: existingHw } = await supabase
          .from('homework_assignments')
          .select('id')
          .eq('lesson_record_id', finalRecordId)
          .maybeSingle();

        if (existingHw) {
          await supabase.from('homework_assignments').update({ content: newHomeworkContent.trim() }).eq('id', existingHw.id);
        } else {
          await supabase.from('homework_assignments').insert({
            student_id: formData.student_id,
            subject: formData.subject as SubjectType,
            lesson_record_id: finalRecordId,
            assigned_date: formData.lesson_date,
            content: newHomeworkContent.trim(),
          });
        }
      }

      toast({ title: '제출 완료' });
      onSubmitted?.();
    } catch (error: any) {
      console.error('Error submitting:', error);
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveHomeworkCheck = async () => {
    // VIEW_MODE_WRITE_GUARD: Block all writes in view mode
    if (isViewMode) {
      console.log('[VIEW_MODE_WRITE_GUARD]', 'blocked handleSaveHomeworkCheck in view mode');
      return;
    }

    if (!previousHomework || !homeworkCheckResult || !user) return;

    setIsSavingHomeworkCheck(true);
    try {
      const { error } = await supabase
        .from('homework_assignments')
        .update({
          check_status: 'checked',
          result: homeworkCheckResult,
          notes: homeworkCheckNotes.trim() || null,
          checked_by: user.id,
          checked_at: new Date().toISOString(),
        })
        .eq('id', previousHomework.id);

      if (error) throw error;
      toast({ title: '숙제 확인 완료' });
      if (formData.student_id && formData.class_id) {
        await fetchPreviousLesson(formData.student_id, formData.class_id, formData.lesson_date);
      }
    } catch (error: any) {
      console.error('Error saving homework check:', error);
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingHomeworkCheck(false);
    }
  };

  const toggleIssue = (issue: string) => {
    setFormData((prev) => ({
      ...prev,
      learning_issues: prev.learning_issues.includes(issue)
        ? prev.learning_issues.filter((i) => i !== issue)
        : [...prev.learning_issues, issue],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const studentName = students.find(s => s.id === formData.student_id)?.name || '선택되지 않음';
  const className = classes.find(c => c.id === formData.class_id)?.name || '선택되지 않음';
  
  // FORM-SELECTABLE-V1: Determine if this is a new record where student/class should be selectable
  const isNewRecord = !existingRecordId && !editingLesson;
  const canSelectStudentClass = isNewRecord && !isViewMode && (isAdmin || isTeacher || isAssistant);

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${isViewMode ? 'pointer-events-none' : ''}`}>
      {/* LESSON-SHARED-FORM-V1: Unified form component used by both Dashboard and Lessons page */}
      <div className="text-xs text-center py-1 rounded bg-green-500/20 text-green-700">
        LESSON-SHARED-FORM-V1
      </div>
      
      {/* LESSON-VIEW-MODE-V1 / LESSON-EDIT-MODE-V1 marker */}
      <div className={`text-xs text-center py-1 rounded ${isViewMode ? 'bg-blue-500/20 text-blue-700' : 'bg-muted/30 text-muted-foreground'}`}>
        {isViewMode ? 'LESSON-VIEW-MODE-V1' : 'LESSON-EDIT-MODE-V1'}
      </div>
      
      {/* FORM_DEBUG marker for troubleshooting */}
      <div className="text-xs text-center py-1 rounded bg-yellow-500/20 text-yellow-700 font-mono">
        FORM_DEBUG: students={students.length}, classes={classes.length}, role={role}, isNewRecord={isNewRecord ? 1 : 0}, canSelect={canSelectStudentClass ? 1 : 0}
      </div>

      {/* Error banner if no students/classes loaded */}
      {students.length === 0 && classes.length === 0 && (
        <div className="p-3 bg-destructive/20 text-destructive rounded-lg text-sm font-medium">
          FORM_LOAD_ERROR: 학생 및 클래스 목록을 불러오지 못했습니다.
        </div>
      )}

      {/* View mode: re-enable pointer events for edit button */}
      {isViewMode && isAdmin && onRequestEdit && (
        <div className="pointer-events-auto flex justify-end">
          <Button
            type="button"
            variant="default"
            onClick={onRequestEdit}
          >
            <FileEdit className="w-4 h-4 mr-1" />
            편집하기
          </Button>
        </div>
      )}

      {/* Context info header - FORM-SELECTABLE-V1: Use Select for new records */}
      <div className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg flex-wrap">
        {/* Student field */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">학생:</span>
          {canSelectStudentClass ? (
            <Select
              value={formData.student_id || '_placeholder_'}
              onValueChange={(value) => {
                if (value !== '_placeholder_') {
                  setFormData({ ...formData, student_id: value });
                }
              }}
            >
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="학생 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_placeholder_" disabled>학생 선택</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">{studentName}</span>
          )}
        </div>
        
        {/* Class field */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">클래스:</span>
          {canSelectStudentClass ? (
            <Select
              value={formData.class_id || '_placeholder_'}
              onValueChange={(value) => {
                if (value !== '_placeholder_') {
                  setFormData({ ...formData, class_id: value });
                }
              }}
            >
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="클래스 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_placeholder_" disabled>클래스 선택</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.subject})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">{className}</span>
          )}
        </div>
        
        {/* Subject field */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">과목:</span>
          {canSelectStudentClass ? (
            <Select
              value={formData.subject}
              onValueChange={(value) => {
                setFormData({ ...formData, subject: value });
                if (user?.id) setLastSelectedSubject(user.id, value as SubjectType);
              }}
            >
              <SelectTrigger className="w-[100px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{formData.subject}</Badge>
          )}
        </div>
        
        {/* Date field */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">날짜:</span>
          {canSelectStudentClass ? (
            <Input
              type="date"
              value={formData.lesson_date}
              onChange={(e) => setFormData({ ...formData, lesson_date: e.target.value })}
              className="w-[140px] h-8"
            />
          ) : (
            <span className="font-medium">{formData.lesson_date}</span>
          )}
        </div>
        
        {editingLesson && (
          <Badge variant={editingLesson.submitted ? 'default' : 'outline'} className="ml-auto">
            {editingLesson.submitted ? '제출됨' : '임시저장'}
          </Badge>
        )}
        {isViewMode && (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
            보기 모드
          </Badge>
        )}
      </div>

      {/* Previous lesson section - PREV_HW_CHAIN_V2: Now chains by student+subject only */}
      {formData.student_id && formData.subject && (
        <div className="p-4 rounded-lg border-2 border-blue-500/30 bg-blue-500/5 space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            <Label className="text-base font-semibold text-blue-700">지난 수업</Label>
            {loadingPreviousLesson && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>

          {loadingPreviousLesson ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : previousLesson ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(previousLesson.lesson_date), 'yyyy-MM-dd')}</span>
                <span className="mx-1">|</span>
                <span className="font-medium text-foreground">{previousLesson.lesson_range}</span>
              </div>

              {previousLessonHomework && (
                <div className="p-3 bg-background rounded-lg border space-y-2">
                  {/* PREV_HW_LINK_V1 debug marker */}
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded font-mono">
                    PREV_HW_LINK_V1: subject={formData.subject} found={prevHwDebugInfo.found ? 1 : 0}
                  </span>
                  <Label className="text-sm font-medium">지난숙제(자동)</Label>
                  <p className="text-sm whitespace-pre-wrap bg-secondary/30 p-2 rounded">{previousLessonHomework.content}</p>

                  {previousLessonHomework.check_status === 'checked' ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span>확인됨 {previousLessonHomework.checker_name && `(${previousLessonHomework.checker_name})`}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-sm">숙제상태 확인</Label>
                      <div className="flex flex-wrap gap-2">
                        {HOMEWORK_RESULT_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          return (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={homeworkCheckResult === opt.value ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setHomeworkCheckResult(opt.value)}
                              className="gap-1"
                            >
                              <Icon className="w-4 h-4" />
                              {opt.label === '완료' ? '완료' : opt.label === '부분' ? '일부완료' : opt.label === '미완' ? '미이행' : opt.label}
                            </Button>
                          );
                        })}
                      </div>
                      <Textarea
                        placeholder="확인 메모 (선택)"
                        value={homeworkCheckNotes}
                        onChange={(e) => setHomeworkCheckNotes(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveHomeworkCheck}
                        disabled={!homeworkCheckResult || isSavingHomeworkCheck}
                      >
                        {isSavingHomeworkCheck && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        확인 저장
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">이전 수업 기록 없음</div>
          )}
        </div>
      )}

      {/* 휴강 indicator */}
      {formData.lesson_types.includes('휴강') && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-muted">
          <Badge variant="secondary">휴강 기록</Badge>
          <span className="text-sm text-muted-foreground">수업 범위, 이해도 등 필드가 비활성화됩니다.</span>
        </div>
      )}

      {/* TESTVISIT-SCORE-V1: 테스트방문 indicator */}
      {formData.lesson_types.includes('테스트방문') && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Badge variant="outline" className="border-amber-500 text-amber-700">테스트방문</Badge>
          <span className="text-sm text-amber-700">테스트방문 기록은 이해도를 입력하지 않습니다.</span>
        </div>
      )}

      {/* 종류 and 출결사항 */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isAssistant ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="space-y-2">
          <Label className="text-sm font-medium">종류</Label>
          <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
            {LESSON_TYPE_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`form_lesson_type_${opt.value}`}
                  checked={formData.lesson_types.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    if (opt.value === '휴강') {
                      if (checked) {
                        setFormData({ ...formData, lesson_types: ['휴강'], homework_status: 'none_assigned' });
                      } else {
                        setFormData({ ...formData, lesson_types: ['정규수업'] });
                      }
                    } else {
                      if (checked) {
                        const newTypes = formData.lesson_types.filter(t => t !== '휴강');
                        setFormData({ ...formData, lesson_types: [...newTypes, opt.value] });
                      } else {
                        const newTypes = formData.lesson_types.filter(t => t !== opt.value);
                        setFormData({ ...formData, lesson_types: newTypes.length === 0 ? ['정규수업'] : newTypes });
                      }
                    }
                  }}
                />
                <label htmlFor={`form_lesson_type_${opt.value}`} className="text-sm cursor-pointer">{opt.label}</label>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">출결사항</Label>
          <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
            {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`form_attendance_${opt.value}`}
                  checked={formData.attendance_status.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setFormData({ ...formData, attendance_status: [...formData.attendance_status, opt.value] });
                    } else {
                      const newStatus = formData.attendance_status.filter(s => s !== opt.value);
                      setFormData({ ...formData, attendance_status: newStatus.length === 0 ? ['정상등원'] : newStatus });
                    }
                  }}
                />
                <label htmlFor={`form_attendance_${opt.value}`} className="text-sm cursor-pointer">{opt.label}</label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main lesson fields */}
      <div className={`space-y-4 ${isAssistant || formData.lesson_types.includes('휴강') ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="space-y-2">
          <Label htmlFor="form_lesson_range">수업 범위/내용 *</Label>
          <Input
            id="form_lesson_range"
            value={formData.lesson_range}
            onChange={(e) => setFormData({ ...formData, lesson_range: e.target.value })}
            placeholder="예: 2단원 함수, p.45-60"
            required={!formData.lesson_types.includes('휴강')}
          />
        </div>

        {/* MATH-CURRICULUM-TAG-V2: Curriculum tagging for Math only */}
        {formData.subject === '수학' && (
          <MathCurriculumTag
            curriculumVersion={formData.curriculum_version}
            course={formData.course}
            unitKey={formData.curriculum_unit_key}
            onChange={(version, course, unitKey) => {
              setFormData(prev => ({
                ...prev,
                curriculum_version: version,
                course: course,
                curriculum_unit_key: unitKey,
              }));
            }}
            onValidationError={setHasCustomCourseError}
            disabled={isViewMode}
          />
        )}

        {/* TESTVISIT-SCORE-V1: Disable understanding_score for test-only visits */}
        <div className={`space-y-2 ${formData.lesson_types.includes('테스트방문') ? 'opacity-60 pointer-events-none' : ''}`}>
          <Label>이해도 점수 *</Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <Button
                key={score}
                type="button"
                variant={formData.understanding_score === score.toString() ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFormData({ ...formData, understanding_score: score.toString() })}
                className="w-12 h-12 text-lg"
                disabled={formData.lesson_types.includes('테스트방문')}
              >
                {score}
              </Button>
            ))}
          </div>
          {formData.lesson_types.includes('테스트방문') && (
            <p className="text-sm text-amber-600">테스트방문 기록은 이해도를 입력하지 않습니다.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>숙제 상태 *</Label>
          <Select
            value={formData.homework_status}
            onValueChange={(value) => setFormData({ ...formData, homework_status: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              {HOMEWORK_STATUS.map((status) => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* FORM-WORKFLOW-REFINE-V2: Updated learning issues labels */}
        <div className="space-y-2">
          <Label>학습 이슈</Label>
          <div className="flex flex-wrap gap-2">
            {getLearningIssuesForSubject(formData.subject as SubjectType).map((issue) => (
              <Badge
                key={issue}
                variant={formData.learning_issues.includes(issue) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleIssue(issue)}
              >
                {issue}
              </Badge>
            ))}
          </div>
          {/* FORM-WORKFLOW-REFINE-V2: D) Updated learning_issues_note label and placeholder */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">학습 상황 상세(리포트 근거)</Label>
            <Textarea
              placeholder={`※ 꼭 문제가 아니어도 좋습니다.
이번 주 학습태도/집중/이해 흐름/실수 패턴/질문 태도/시간 관리 등
관찰된 내용을 최대한 구체적으로 적어주세요.
(이 내용이 주간 리포트의 핵심 근거가 됩니다.)`}
              value={formData.learning_issues_note}
              onChange={(e) => setFormData({ ...formData, learning_issues_note: e.target.value })}
              rows={4}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="form_next_lesson_goal">다음 수업 목표</Label>
          <Input
            id="form_next_lesson_goal"
            value={formData.next_lesson_goal}
            onChange={(e) => setFormData({ ...formData, next_lesson_goal: e.target.value })}
            placeholder="다음 수업에서 다룰 내용"
          />
        </div>

        {/* FORM-WORKFLOW-REFINE-V2: F) Renamed notes field */}
        <div className="space-y-2">
          <Label htmlFor="form_notes">원장/학습기록용 메모 (학부모 미전달)</Label>
          <Textarea
            id="form_notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="학부모에게 전송되지 않으며 내부 기록으로 남깁니다."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            학부모에게 전송되지 않으며 내부 기록으로 남깁니다.
          </p>
        </div>
      </div>

      {/* New homework section */}
      <div className="p-4 rounded-lg border-2 border-green-500/30 bg-green-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="w-5 h-5 text-green-600" />
          <Label className="text-base font-semibold text-green-700">오늘 숙제</Label>
        </div>
        <Textarea
          placeholder="오늘 배정할 숙제 내용"
          value={newHomeworkContent}
          onChange={(e) => setNewHomeworkContent(e.target.value)}
          rows={3}
        />
      </div>

      {/* Test section */}
      <div className="p-4 rounded-lg border-2 border-purple-500/30 bg-purple-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-purple-600" />
          <Label className="text-base font-semibold text-purple-700">오늘 테스트</Label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-sm">테스트 이름</Label>
            <Input
              value={testFormData.test_name}
              onChange={(e) => setTestFormData({ ...testFormData, test_name: e.target.value })}
              placeholder="예: 단원평가"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">결과/점수</Label>
            <Input
              value={testFormData.test_result_text}
              onChange={(e) => setTestFormData({ ...testFormData, test_result_text: e.target.value })}
              placeholder="예: 85점"
            />
          </div>
          {formData.subject === '영어' && (
            <div className="space-y-1">
              <Label className="text-sm">통과 여부</Label>
              <Select
                value={testFormData.test_result}
                onValueChange={(value) => setTestFormData({ ...testFormData, test_result: value as 'pass' | 'fail' | 'none' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  <SelectItem value="pass">통과</SelectItem>
                  <SelectItem value="fail">불통과</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-sm">테스트 시간</Label>
            <Select
              value={testFormData.test_time || '__none__'}
              onValueChange={(value) => setTestFormData({ ...testFormData, test_time: value === '__none__' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="시간 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">선택 안함</SelectItem>
                {TEST_TIME_OPTIONS.map((time) => (
                  <SelectItem key={time} value={time}>{time}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">담당 조교</Label>
            <Select
              value={testFormData.test_assistant || '__none__'}
              onValueChange={(value) => setTestFormData({ ...testFormData, test_assistant: value === '__none__' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">선택 안함</SelectItem>
                <SelectItem value="다인조교">다인조교</SelectItem>
                <SelectItem value="유빈조교">유빈조교</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-sm">테스트 메모</Label>
          <Textarea
            value={testFormData.test_notes}
            onChange={(e) => setTestFormData({ ...testFormData, test_notes: e.target.value })}
            placeholder="테스트 관련 메모"
            rows={2}
          />
        </div>
      </div>

      {/* Action buttons - view mode shows only close button */}
      {isViewMode ? (
        <div className="flex items-center justify-between pt-4 border-t pointer-events-auto">
          <Button type="button" variant="outline" onClick={onCancel}>
            닫기
          </Button>
          {isAdmin && onRequestEdit && (
            <Button type="button" onClick={onRequestEdit}>
              <FileEdit className="w-4 h-4 mr-1" />
              편집하기
            </Button>
          )}
        </div>
      ) : canManage && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isSavingDraft}>
              {isSavingDraft && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Save className="w-4 h-4 mr-1" />
              임시저장
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Send className="w-4 h-4 mr-1" />
              제출
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
