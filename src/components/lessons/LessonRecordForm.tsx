import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth, isAssistant as checkIsAssistant, isTeacher as checkIsTeacher, isAdmin as checkIsAdmin, canManageLessons } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toStorageAttendanceStatuses } from '@/lib/attendance';
import { reconcileLessonHomework, HOMEWORK_LOAD_COLUMNS } from '@/lib/homeworkReconcile';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Save, Send, FileEdit, CheckCircle2, Clock, AlertCircle, HelpCircle, XCircle, ClipboardCheck, ClipboardList, Calendar, Loader2, Camera, Mic, Star, X, ChevronLeft, ChevronRight, ArrowRight, PackageX, Frown, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { MathCurriculumTag } from './MathCurriculumTag';
import { EnglishCurriculumTag } from './EnglishCurriculumTag';
import SubmissionImageCarousel from './SubmissionImageCarousel';

type SubjectType = '수학' | '과학' | '영어' | '국어';

export interface LessonFormContext {
  student_id: string;
  class_id: string;
  subject: string;
  lesson_date: string;
  /** SUPPLEMENT-LESSON-V1: Pre-select lesson types (e.g. ['보충수업']) */
  lesson_types?: string[];
}

export interface LessonRecordFormProps {
  initialContext?: LessonFormContext;
  existingRecordId?: string | null;
  onSaved?: () => void;
  onSubmitted?: () => void;
  onCancel?: () => void;
  students: { id: string; name: string }[];
  classes: { id: string; name: string; subject: string }[];
  /** SUPPLEMENT-TEACHER-V1: Available teachers for supplementary lesson teacher selection */
  teachers?: { id: string; name: string }[];
  mode?: 'view' | 'edit';
  onRequestEdit?: () => void;
  originalTeacherId?: string | null;
  /** PREFILL-FIX-V5: Force new record mode - skip DB lookup for existing drafts */
  forceNewRecord?: boolean;
}

interface HomeworkAssignment {
  id: string;
  student_id: string;
  subject: SubjectType;
  lesson_record_id: string | null;
  assigned_date: string;
  content: string;
  check_status: 'unchecked' | 'checked';
  result: 'completed' | 'partial' | 'not_done' | 'lost' | 'low_effort' | 'unable_to_verify' | null;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  checker_name?: string;
  submission_image_url?: string | null;
  submission_audio_url?: string | null;
  submission_text?: string | null;
  submitted_at?: string | null;
}

// TEACHER-HW-SUBMISSION-VIEW-V1: Interface for student submission data
interface HomeworkSubmission {
  id: string;
  homework_id: string;
  student_id: string;
  image_url: string | null;
  submission_note: string | null;
  submitted_at: string;
  status: 'pending' | 'reviewed' | 'approved' | 'needs_revision';
  feedback: string | null;
  points_awarded: number | null;
}

// TEACHER-HW-SUBMISSION-VIEW-V1: Interface for point history
interface PointHistoryEntry {
  id: string;
  points: number;
  reason: string;
  created_at: string;
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
  // ENGLISH-CURRICULUM-V1: English curriculum fields
  english_grammar_unit?: string | null;
  english_reading_units?: string[] | null;
  // KOREAN-CATEGORY-V1: Korean curriculum categories
  korean_categories?: string[] | null;
}

const SUBJECTS = [
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '영어', label: '영어' },
  { value: '국어', label: '국어' },
] as const;

const SUBJECT_VALUES: SubjectType[] = ['수학', '과학', '영어', '국어'];

// LEARNING-ISSUE-ROUTINE-V1: Added '풀이 루틴을 지키지 않음' to all subjects
const SUBJECT_SPECIFIC_ISSUES: Record<SubjectType, string[]> = {
  '수학': ['개념 이해 부족', '계산 실수 잦음', '문제 해석 미흡', '풀이 과정 정리 필요', '응용·서술형 약함', '시간 관리 어려움', '풀이 루틴을 지키지 않음'],
  '과학': ['개념 연결 미흡', '암기 부족', '자료 해석 어려움', '실험·탐구 서술 약함', '단원 간 개념 혼동', '풀이 루틴을 지키지 않음'],
  '영어': ['단어 이해 부족', '문법 개념 혼동', '독해 속도 느림', '근거 문장 찾기 어려움', '듣기 이해 부족', '풀이 루틴을 지키지 않음'],
  '국어': ['지문 독해 어려움', '핵심 개념어 정리 미흡', '서술형 논리 부족', '문학 표현 분석 미흡', '시간 배분 문제', '풀이 루틴을 지키지 않음'],
};

// HOMEWORK-STATUS-DISPLAY-FIX-V1: Correct labels (없음 not 미배정)
const HOMEWORK_STATUS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '일부완료' },
  { value: 'not_done', label: '미이행' },
  { value: 'none_assigned', label: '없음' },
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
  { value: 'lost', label: '분실', icon: PackageX, color: 'text-orange-600' },
  { value: 'low_effort', label: '성의부족', icon: Frown, color: 'text-rose-600' },
  { value: 'unable_to_verify', label: '확인불가', icon: HelpCircle, color: 'text-muted-foreground' },
];

// KOREAN-CATEGORY-V1: Korean subject categories for multi-select
const KOREAN_CATEGORY_OPTIONS = [
  '고1 문학',
  '고1 어법',
  '고2 문학',
  '고2 독서와 작문',
  '평가원 기출 문학',
  '평가원 기출 독서',
  '화법과 작문',
  '모의고사 해설',
  'EBS 수능특강 문학',
  'EBS 수능특강 독서',
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

// SUPPLEMENT-TIME-V3: Include morning hours (09:00~12:00) and afternoon hours (13:00~21:00)
const SUPPLEMENT_TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const hour = 9 + Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});
const TEST_TIME_OPTIONS = SUPPLEMENT_TIME_OPTIONS;

/**
 * LessonRecordForm - Shared component for lesson record creation and editing
 * Used by both Dashboard and Lessons pages via LessonModal wrapper.
 * LESSON-SHARED-FORM-V3
 * TAG-PREFILL-MATH-ENGLISH-V1: Student-specific prefill for Math and English
 */

// TAG-PREFILL-MATH-ENGLISH-V1: Track source of curriculum tag prefill
type TagSource = 'student_last' | 'user_default' | 'empty' | 'existing_record';

// TAG-PREFILL-MATH-ENGLISH-V1: LocalStorage key for user-level curriculum defaults
function curriculumDefaultsKey(userId?: string | null) {
  return userId ? `lesson_records:curriculumDefaults:${userId}` : 'lesson_records:curriculumDefaults';
}

function getUserCurriculumDefaults(userId?: string | null): { version: string; course: string; unitKey: string } | null {
  try {
    const raw = localStorage.getItem(curriculumDefaultsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version || parsed.course || parsed.unitKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading curriculum defaults:', e);
  }
  return null;
}

// SHARED-FORM-V3: Helper to check if understanding_score should be disabled
const ABSENCE_STATUSES = ['결석', '인정결석', '무단결석', '보충불가'];
const DISABLE_SCORE_LESSON_TYPES = ['테스트방문', '휴강'];
function shouldDisableUnderstandingScore(lessonTypes: string[], attendanceStatus: string[]): boolean {
  // Disable for test-only visits and holidays
  if (lessonTypes.some(lt => DISABLE_SCORE_LESSON_TYPES.includes(lt))) return true;
  // Disable for absences
  if (attendanceStatus.some(s => ABSENCE_STATUSES.includes(s))) return true;
  return false;
}

interface ClassScheduleInfo {
  class_id: string;
  class_name: string;
  subject: string;
  teacher_id: string;
  teacher_name: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
}

export function LessonRecordForm({
  initialContext,
  existingRecordId,
  onSaved,
  onSubmitted,
  onCancel,
  students,
  classes,
  teachers,
  mode = 'edit',
  onRequestEdit,
  originalTeacherId,
  forceNewRecord = false,
}: LessonRecordFormProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  // View mode: all inputs disabled, no auto-save, no mutations
  const isViewMode = mode === 'view';
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    internal_notes: '',
    lesson_types: (initialContext?.lesson_types && initialContext.lesson_types.length > 0 ? initialContext.lesson_types : ['정규수업']) as string[],
    attendance_status: ['정상등원'] as string[],
    // MATH-CURRICULUM-TAG-V2: Curriculum fields
    curriculum_version: '',
    course: '',
    curriculum_unit_key: '',
    // ENGLISH-CURRICULUM-V1: English curriculum fields
    english_grammar_unit: '' as string | null,
    english_reading_units: [] as string[],
    // KOREAN-CATEGORY-V1: Korean curriculum categories
    korean_categories: [] as string[],
    // SUPPLEMENT-TIME-V1: Time input for supplementary lessons
    supplement_time: '',
    // SUPPLEMENT-TEACHER-V1: Teacher name for supplementary lessons
    supplement_teacher_name: '',
  });

  // MATH-CURRICULUM-TAG-V2: Validation state for custom course
  const [hasCustomCourseError, setHasCustomCourseError] = useState(false);

  // PREFILL-FIX-V4: Track curriculum tag prefill source (separate for Math and English)
  const [tagSource, setTagSource] = useState<TagSource>('empty');
  const [englishTagSource, setEnglishTagSource] = useState<TagSource>('empty');
  const [tagPrefillOccurred, setTagPrefillOccurred] = useState(false);
  const [englishTagPrefillOccurred, setEnglishTagPrefillOccurred] = useState(false);
  // PREFILL-FIX-V4: Guard flags to prevent wipes
  const tagUserChangedRef = useRef(false); // Track if user manually changed math tags
  const englishTagUserChangedRef = useRef(false); // Track if user manually changed english tags
  // PREFILL-FIX-V4: Track last prefilled student+subject to detect changes
  const lastMathPrefillKeyRef = useRef<string>(''); // "studentId|subject"
  const lastEnglishPrefillKeyRef = useRef<string>('');
  const [prefillDebugRecordId, setPrefillDebugRecordId] = useState<string | null>(null);
  const [englishPrefillDebugRecordId, setEnglishPrefillDebugRecordId] = useState<string | null>(null);
  // PREFILL-FIX-V5: Track if this is a NEW record (not existing) - survives draft creation
  const [isNewRecordMode, setIsNewRecordMode] = useState<boolean>(false);
  // PREFILL-FIX-V5: Track if this is a newly created draft (allows prefill even with recordId)
  const [isNewDraft, setIsNewDraft] = useState<boolean>(false);
  // PREFILL-FIX-V5: Track initial load completion for prefill timing
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);

  // Previous lesson state
  const [previousLesson, setPreviousLesson] = useState<LessonRecord | null>(null);
  const [previousLessonHomework, setPreviousLessonHomework] = useState<HomeworkAssignment | null>(null);
  // MULTI-HW-V1: All unchecked previous homeworks (including carry-forwarded)
  const [allPreviousHomeworks, setAllPreviousHomeworks] = useState<HomeworkAssignment[]>([]);
  const [loadingPreviousLesson, setLoadingPreviousLesson] = useState(false);

  // Homework states
  const [previousHomework, setPreviousHomework] = useState<HomeworkAssignment | null>(null);
  // MULTI-HW-V1: Per-homework check state
  const [homeworkCheckResults, setHomeworkCheckResults] = useState<Record<string, string>>({});
  const [homeworkCheckNotesMap, setHomeworkCheckNotesMap] = useState<Record<string, string>>({});
  const [homeworkCheckResult, setHomeworkCheckResult] = useState<string>('');
  const [homeworkCheckNotes, setHomeworkCheckNotes] = useState<string>('');
  const [isSavingHomeworkCheck, setIsSavingHomeworkCheck] = useState(false);
  // MULTI-HW-ASSIGN-V1: Multiple homework items support
  // HW-DAILY-OPT-IN-V1: is_daily=false by default → homework_type='regular' (one-off, due next lesson).
  // Daily recurring homework is only created when the teacher explicitly toggles 데일리체크 on.
  // HW-RECONCILE-V1: keep existing homework row id so saves update in place instead of delete+reinsert
  const [newHomeworkItems, setNewHomeworkItems] = useState<{ id?: string; content: string; is_daily?: boolean }[]>([{ content: '', is_daily: false }]);
  // Legacy alias for compatibility
  const newHomeworkContent = newHomeworkItems[0]?.content || '';
  
  // TEACHER-HW-SUBMISSION-VIEW-V1: Student submission and point history states
  const [studentSubmission, setStudentSubmission] = useState<HomeworkSubmission | null>(null);
  const [pointHistory, setPointHistory] = useState<PointHistoryEntry[]>([]);
  const [showSubmissionImageModal, setShowSubmissionImageModal] = useState(false);

  // CARRY-FORWARD-FORM-V1: Carry forward homework from lesson form
  const [carryForwardLoading, setCarryForwardLoading] = useState(false);

  // ABSENCE-SUPPLEMENT-V1: Absence → supplementary lesson scheduling
  const [showAbsenceSupplementDialog, setShowAbsenceSupplementDialog] = useState(false);
  const [supplementDate, setSupplementDate] = useState('');
  const [supplementTime, setSupplementTime] = useState('');
  const [isSavingSupplementary, setIsSavingSupplementary] = useState(false);

  // CLASS-SCHEDULE-PICKER-V1: Schedule-based class selection
  const [classSchedules, setClassSchedules] = useState<ClassScheduleInfo[]>([]);
  const [classPickerTeacherId, setClassPickerTeacherId] = useState<string>('');

  // Fetch class schedules for the picker
  useEffect(() => {
    if (!canManage) return;
    (async () => {
      const { data } = await supabase
        .from('class_schedules')
        .select('class_id, day_of_week, start_time, end_time, teacher_id, classes!inner(name, subject)')
        .eq('is_active', true)
        .order('start_time');
      if (data) {
        const mapped: ClassScheduleInfo[] = (data as any[]).map(d => ({
          class_id: d.class_id,
          class_name: d.classes?.name || '',
          subject: d.classes?.subject || '',
          teacher_id: d.teacher_id,
          teacher_name: '',
          start_time: d.start_time?.slice(0, 5) || '',
          end_time: d.end_time?.slice(0, 5) || '',
          day_of_week: d.day_of_week,
        }));
        // Fill teacher names from teachers prop
        setClassSchedules(mapped);
      }
    })();
  }, [canManage]);

  // Get day of week from selected date
  const selectedDayOfWeek = useMemo(() => {
    if (!formData.lesson_date) return -1;
    return new Date(formData.lesson_date + 'T00:00:00').getDay();
  }, [formData.lesson_date]);

  // Filter schedules for picker
  const filteredSchedules = useMemo(() => {
    let filtered = classSchedules.filter(s => s.day_of_week === selectedDayOfWeek);
    if (classPickerTeacherId) {
      filtered = filtered.filter(s => s.teacher_id === classPickerTeacherId);
    }
    return filtered;
  }, [classSchedules, selectedDayOfWeek, classPickerTeacherId]);

  // Unique teachers from schedules
  const scheduleTeachers = useMemo(() => {
    const teacherIds = [...new Set(classSchedules.map(s => s.teacher_id))];
    return teacherIds.map(id => {
      const t = teachers?.find(t => t.id === id);
      return { id, name: t?.name || '알 수 없음' };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [classSchedules, teachers]);

  // WRITE-PERSIST-FIX-V1: Added test_content as required field
  const [testFormData, setTestFormData] = useState({
    test_name: '', // Unified: saves to test_name, test_content, test_title
    test_result_text: '',
    test_result: 'none' as 'pass' | 'fail' | 'none',
    test_notes: '',
    test_date: '',
    test_time: '',
    test_assistant: '',
  });
  const [isSavingTestFields, setIsSavingTestFields] = useState(false);
  const [isSyncingTest, setIsSyncingTest] = useState(false);

  // TEST-SYNC-V1: Sync test data from DB (entered via Test tab) into this form
  const syncTestFromDb = useCallback(async () => {
    if (!existingRecordId) {
      toast({ title: '동기화 불가', description: '저장된 일지가 없습니다. 먼저 임시저장 해주세요.', variant: 'destructive' });
      return;
    }
    setIsSyncingTest(true);
    try {
      const { data: record } = await supabase
        .from('lesson_records')
        .select('test_name, test_content, test_result_text, test_result, test_notes, test_date, test_time, test_assistant, lesson_date, student_id, subject')
        .eq('id', existingRecordId)
        .maybeSingle();

      if (!record) {
        toast({ title: '레코드를 찾을 수 없습니다', variant: 'destructive' });
        return;
      }

      const dbTestName = record.test_name || (record as any).test_content || '';
      const dbResultText = record.test_result_text || '';
      const dbResult = (record.test_result as 'pass' | 'fail' | 'none') || 'none';

      // If DB has test data, use it
      if (dbTestName.trim() || dbResultText.trim()) {
        setTestFormData({
          test_name: dbTestName,
          test_result_text: dbResultText,
          test_result: dbResult,
          test_notes: record.test_notes || '',
          test_date: record.test_date || record.lesson_date || '',
          test_time: record.test_time || '',
          test_assistant: record.test_assistant || '',
        });
        toast({ title: '테스트 데이터 연동 완료', description: '테스트 탭에서 입력된 결과가 반영되었습니다.' });
        return;
      }

      // Fallback 1: check linked test_records
      const { data: testRecord } = await supabase
        .from('test_records')
        .select('content, score, passed, start_time, assistant_name')
        .eq('lesson_record_id', existingRecordId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (testRecord && (testRecord.content?.trim() || testRecord.score?.trim() || testRecord.passed != null)) {
        setTestFormData(prev => ({
          ...prev,
          test_name: testRecord.content || '',
          test_result_text: testRecord.score || '',
          test_result: testRecord.passed === true ? 'pass' : testRecord.passed === false ? 'fail' : 'none',
          test_time: testRecord.start_time || prev.test_time,
          test_assistant: testRecord.assistant_name || prev.test_assistant,
        }));
        toast({ title: '테스트 데이터 연동 완료', description: '테스트 기록에서 결과가 반영되었습니다.' });
      } else {
        // Fallback 2: legacy test_schedules
        const { data: testSched } = await supabase
          .from('test_schedules')
          .select('content, result_score, result_passed, test_type, test_time, notes')
          .eq('student_id', record.student_id)
          .eq('subject', record.subject)
          .eq('test_date', record.lesson_date)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (testSched && (testSched.content?.trim() || testSched.result_score?.trim() || testSched.result_passed != null)) {
          const resultText = testSched.result_score ||
            (testSched.result_passed != null ? (testSched.result_passed ? '통과' : '불통과') : '');
          const testResult = testSched.result_passed != null
            ? (testSched.result_passed ? 'pass' as const : 'fail' as const)
            : 'none' as const;
          setTestFormData(prev => ({
            ...prev,
            test_name: testSched.content || '',
            test_result_text: resultText,
            test_result: testResult,
            test_notes: testSched.notes || prev.test_notes,
            test_time: testSched.test_time || prev.test_time,
          }));
          toast({ title: '테스트 데이터 연동 완료', description: '기존 테스트 일정에서 결과가 반영되었습니다.' });
        } else {
          toast({ title: '연동할 테스트 데이터 없음', description: '이 날짜/과목에 입력된 테스트 기록이 없습니다.' });
        }
      }
    } catch (err: any) {
      toast({ title: '연동 실패', description: err.message || '다시 시도해주세요.', variant: 'destructive' });
    } finally {
      setIsSyncingTest(false);
    }
  }, [existingRecordId, toast]);

  // Override state
  const [prevHomeworkOverrideEditing, setPrevHomeworkOverrideEditing] = useState(false);
  const [prevHomeworkOverrideText, setPrevHomeworkOverrideText] = useState('');
  const [isSavingPrevHomeworkOverride, setIsSavingPrevHomeworkOverride] = useState(false);

  // PREFILL-FIX-V4: Prefill math curriculum tags from student's most recent record
  const prefillStudentCurriculumTags = useCallback(async (studentId: string, userId: string) => {
    if (!studentId) {
      setTagSource('empty');
      setPrefillDebugRecordId(null);
      return;
    }

    // PREFILL-FIX-V4: Skip if already prefilled for this student (key-based guard)
    const prefillKey = `${studentId}|수학`;
    if (lastMathPrefillKeyRef.current === prefillKey) {
      console.log('[PREFILL-FIX-V4] Skipping math prefill - already applied for key:', prefillKey);
      return;
    }

    // PREFILL-FIX-V4: Skip if user already touched tags
    if (tagUserChangedRef.current) {
      console.log('[PREFILL-FIX-V4] Skipping math prefill - user has touched tags');
      return;
    }

    try {
      // Query most recent math lesson - allows prefill if ANY of curriculum_version OR course OR curriculum_unit_key is set
      const { data: recentMathLesson } = await supabase
        .from('lesson_records')
        .select('id, curriculum_version, course, curriculum_unit_key, lesson_date, submitted')
        .eq('student_id', studentId)
        .eq('subject', '수학')
        .or('curriculum_version.not.is.null,course.not.is.null,curriculum_unit_key.not.is.null')
        .order('submitted', { ascending: false }) // Prefer submitted first
        .order('lesson_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentMathLesson && (recentMathLesson.curriculum_version || recentMathLesson.course || recentMathLesson.curriculum_unit_key)) {
        // Use student's most recent curriculum tags
        setFormData(prev => ({
          ...prev,
          curriculum_version: recentMathLesson.curriculum_version || '',
          course: recentMathLesson.course || '',
          curriculum_unit_key: recentMathLesson.curriculum_unit_key || '',
        }));
        setTagSource('student_last');
        setTagPrefillOccurred(true);
        tagUserChangedRef.current = false;
        lastMathPrefillKeyRef.current = prefillKey;
        setPrefillDebugRecordId(recentMathLesson.id);
        console.log('[PREFILL-FIX-V4] Math prefilled from student last record:', recentMathLesson);
        return;
      }

      // Fallback: Try user-level localStorage defaults
      const userDefaults = getUserCurriculumDefaults(userId);
      if (userDefaults && (userDefaults.version || userDefaults.course || userDefaults.unitKey)) {
        setFormData(prev => ({
          ...prev,
          curriculum_version: userDefaults.version || '',
          course: userDefaults.course || '',
          curriculum_unit_key: userDefaults.unitKey || '',
        }));
        setTagSource('user_default');
        setTagPrefillOccurred(true);
        tagUserChangedRef.current = false;
        lastMathPrefillKeyRef.current = prefillKey;
        setPrefillDebugRecordId(null);
        console.log('[PREFILL-FIX-V4] Math prefilled from user defaults:', userDefaults);
        return;
      }

      // No prefill source found - still mark key to avoid re-running
      setTagSource('empty');
      setTagPrefillOccurred(false);
      lastMathPrefillKeyRef.current = prefillKey;
      setPrefillDebugRecordId(null);
    } catch (error) {
      console.error('[PREFILL-FIX-V4] Error fetching math curriculum tags:', error);
      setTagSource('empty');
      setPrefillDebugRecordId(null);
    }
  }, []);

  // PREFILL-FIX-V4: Prefill English curriculum tags from student's most recent English record
  const prefillEnglishCurriculumTags = useCallback(async (studentId: string) => {
    if (!studentId) {
      setEnglishTagSource('empty');
      setEnglishPrefillDebugRecordId(null);
      return;
    }

    // PREFILL-FIX-V4: Skip if already prefilled for this student (key-based guard)
    const prefillKey = `${studentId}|영어`;
    if (lastEnglishPrefillKeyRef.current === prefillKey) {
      console.log('[PREFILL-FIX-V4] Skipping english prefill - already applied for key:', prefillKey);
      return;
    }

    // PREFILL-FIX-V4: Skip if user already touched tags
    if (englishTagUserChangedRef.current) {
      console.log('[PREFILL-FIX-V4] Skipping english prefill - user has touched tags');
      return;
    }

    try {
      // Query most recent English lesson - qualifies if grammar_unit OR reading_units has values
      const { data: recentEnglishLesson } = await supabase
        .from('lesson_records')
        .select('id, english_grammar_unit, english_reading_units, lesson_date, submitted')
        .eq('student_id', studentId)
        .eq('subject', '영어')
        .or('english_grammar_unit.not.is.null,english_reading_units.not.is.null')
        .order('submitted', { ascending: false })
        .order('lesson_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentEnglishLesson && (recentEnglishLesson.english_grammar_unit || (recentEnglishLesson.english_reading_units && recentEnglishLesson.english_reading_units.length > 0))) {
        setFormData(prev => ({
          ...prev,
          english_grammar_unit: recentEnglishLesson.english_grammar_unit || null,
          english_reading_units: recentEnglishLesson.english_reading_units || [],
        }));
        setEnglishTagSource('student_last');
        setEnglishTagPrefillOccurred(true);
        englishTagUserChangedRef.current = false;
        lastEnglishPrefillKeyRef.current = prefillKey;
        setEnglishPrefillDebugRecordId(recentEnglishLesson.id);
        console.log('[PREFILL-FIX-V4] English prefilled from student last record:', recentEnglishLesson);
        return;
      }

      // No prefill source found for English - still mark key
      setEnglishTagSource('empty');
      setEnglishTagPrefillOccurred(false);
      lastEnglishPrefillKeyRef.current = prefillKey;
      setEnglishPrefillDebugRecordId(null);
    } catch (error) {
      console.error('[PREFILL-FIX-V4] Error fetching English curriculum tags:', error);
      setEnglishTagSource('empty');
      setEnglishPrefillDebugRecordId(null);
    }
  }, []);

  // PREFILL-FIX-V5: Reset prefill state when form context changes
  useEffect(() => {
    // Reset all prefill guards when form is re-initialized
    setInitialLoadComplete(false);
    setIsNewRecordMode(false);
    setIsNewDraft(false);
    tagUserChangedRef.current = false;
    englishTagUserChangedRef.current = false;
    lastMathPrefillKeyRef.current = '';
    lastEnglishPrefillKeyRef.current = '';
    setTagPrefillOccurred(false);
    setEnglishTagPrefillOccurred(false);
    initializeForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingRecordId, initialContext, isViewMode, forceNewRecord]);

  // TEST-PREFILL-V2: Fetch test data from test_records first, then legacy test_schedules
  async function prefillFromTestSchedules(studentId: string, subject: string, lessonDate: string) {
    try {
      const { data: testRecord } = await supabase
        .from('test_records')
        .select('content, score, passed, start_time, assistant_name')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .eq('test_date', lessonDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (testRecord) {
        const hasContent = !!(testRecord.content?.trim());
        const hasResult = !!(testRecord.score?.trim()) || testRecord.passed != null;
        
        if (hasContent || hasResult) {
          setTestFormData(prev => {
            // Only prefill if current test data is empty
            if (prev.test_name?.trim()) return prev;
            
            const resultText = testRecord.score || '';
            const testResult = testRecord.passed != null
              ? (testRecord.passed ? 'pass' as const : 'fail' as const)
              : 'none' as const;
            
            console.log('[TEST-PREFILL-V2] Prefilling test data from test_records:', testRecord);
            return {
              ...prev,
              test_name: testRecord.content || '',
              test_result_text: resultText,
              test_result: testResult,
              test_notes: prev.test_notes,
              test_date: lessonDate,
              test_time: testRecord.start_time || prev.test_time,
              test_assistant: testRecord.assistant_name || prev.test_assistant,
            };
          });
          return;
        }
      }

      const { data: testSched } = await supabase
        .from('test_schedules')
        .select('content, result_score, result_passed, test_type, test_time, notes')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .eq('test_date', lessonDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (testSched) {
        const hasContent = !!(testSched.content?.trim());
        const hasResult = !!(testSched.result_score?.trim()) || testSched.result_passed != null;

        if (hasContent || hasResult) {
          setTestFormData(prev => {
            if (prev.test_name?.trim()) return prev;

            const resultText = testSched.result_score || 
              (testSched.result_passed != null ? (testSched.result_passed ? '통과' : '불통과') : '');
            const testResult = testSched.result_passed != null
              ? (testSched.result_passed ? 'pass' as const : 'fail' as const)
              : 'none' as const;

            console.log('[TEST-PREFILL-V2] Prefilling legacy test data from test_schedules:', testSched);
            return {
              ...prev,
              test_name: testSched.content || '',
              test_result_text: resultText,
              test_result: testResult,
              test_notes: testSched.notes || prev.test_notes,
              test_date: lessonDate,
              test_time: testSched.test_time || prev.test_time,
            };
          });
        }
      }
    } catch (err) {
      console.error('[TEST-PREFILL-V2] Error:', err);
    }
  }

  async function initializeForm() {
    if (!user) return;
    setLoading(true);

    try {
      let recordId = existingRecordId;

      // PREFILL-FIX-V6: Skip DB lookup when forceNewRecord is true (user explicitly clicked "+ 수업기록 생성")
      // UNIFY-LESSON-KEY-V1: 일지 통일 키 = (학생, 과목, 날짜). class_id·교사·입력 경로가 달라도
      // 같은 날 같은 과목 일지는 하나로 — 기존 기록이 있으면 새 draft 대신 그걸 이어서 편집.
      // 제출본 우선, 그다음 오래된 것(원본) 우선.
      if (!forceNewRecord && !recordId && initialContext?.student_id) {
        const { data: existingList } = await supabase
          .from('lesson_records')
          .select('id, submitted')
          .eq('student_id', initialContext.student_id)
          .eq('lesson_date', initialContext.lesson_date || getTodayKST())
          .eq('subject', (initialContext.subject || getLastSelectedSubject(user.id)) as SubjectType)
          .order('submitted', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1);
        if (existingList && existingList.length > 0) {
          recordId = existingList[0].id;
          console.log('[UNIFY-LESSON-KEY-V1] Found existing record for (student,subject,date):', recordId);
        }
      } else if (forceNewRecord) {
        console.log('[PREFILL-FIX-V6] forceNewRecord=true, skipping DB lookup for existing drafts');
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
            understanding_score: record.understanding_score?.toString() || '3',
            homework_status: record.homework_status,
            learning_issues: record.learning_issues || [],
            learning_issues_note: record.learning_issues_note || '',
            next_lesson_goal: record.next_lesson_goal || '',
            notes: record.notes || '',
            internal_notes: (record as any).internal_notes || '',
            lesson_types: record.lesson_types || ['정규수업'],
            attendance_status: record.attendance_status || ['정상등원'],
            // MATH-CURRICULUM-TAG-V1: Load curriculum fields
            curriculum_version: (record as any).curriculum_version || '',
            course: (record as any).course || '',
            curriculum_unit_key: (record as any).curriculum_unit_key || '',
            // ENGLISH-CURRICULUM-V1: Load English curriculum fields
            english_grammar_unit: (record as any).english_grammar_unit || null,
            english_reading_units: (record as any).english_reading_units || [],
            // KOREAN-CATEGORY-V1: Load Korean curriculum categories
            korean_categories: (record as any).korean_categories || [],
            // SUPPLEMENT-TIME-V2: Extract time and teacher from notes for 보충수업
            supplement_time: (() => {
              const timeMatch = (record.notes || '').match(/\[보충 시간:\s*(\d{1,2}:\d{2})\]/);
              return timeMatch ? timeMatch[1] : '';
            })(),
            supplement_teacher_name: (() => {
              const teacherMatch = (record.notes || '').match(/\[보충 선생님:\s*([^\]]+)\]/);
              return teacherMatch ? teacherMatch[1].trim() : '';
            })(),
          });
          // PREFILL-FIX-V6: For existing records with EMPTY curriculum tags, allow prefill from student's last record
          const hasMathTags = !!(record as any).curriculum_version || !!(record as any).course || !!(record as any).curriculum_unit_key;
          const hasEnglishTags = !!(record as any).english_grammar_unit || ((record as any).english_reading_units && (record as any).english_reading_units.length > 0);
          
          if (!hasMathTags && record.subject === '수학') {
            // Allow math prefill to run for this existing record
            setTagSource('empty');
            setIsNewRecordMode(true); // Trick prefill trigger to run
            console.log('[PREFILL-FIX-V6] Existing math record has no curriculum tags, allowing prefill');
          } else {
            setTagSource('existing_record');
            lastMathPrefillKeyRef.current = `${record.student_id}|수학`;
          }
          
          if (!hasEnglishTags && record.subject === '영어') {
            setEnglishTagSource('empty');
            setIsNewRecordMode(true);
            console.log('[PREFILL-FIX-V6] Existing English record has no curriculum tags, allowing prefill');
          } else {
            setEnglishTagSource('existing_record');
            lastEnglishPrefillKeyRef.current = `${record.student_id}|영어`;
          }
          
          setTagPrefillOccurred(false);
          setEnglishTagPrefillOccurred(false);
          setPrefillDebugRecordId(record.id);
          setEnglishPrefillDebugRecordId(record.id);
          if (hasMathTags && hasEnglishTags) {
            setIsNewRecordMode(false);
          }
          setIsNewDraft(false);
          // WRITE-PERSIST-FIX-V1: Load test_content from DB
          const loadedTestName = record.test_name || (record as any).test_content || '';
          setTestFormData({
            test_name: loadedTestName,
            test_result_text: record.test_result_text || '',
            test_result: (record.test_result as 'pass' | 'fail' | 'none') || 'none',
            test_notes: record.test_notes || '',
            test_date: record.test_date || record.lesson_date,
            test_time: record.test_time || '',
            test_assistant: record.test_assistant || '',
          });

          // TEST-SCHEDULE-PREFILL-V1: If lesson record has no test data, try to prefill from test_schedules
          if (!loadedTestName.trim() && !record.test_result_text?.trim()) {
            await prefillFromTestSchedules(record.student_id, record.subject, record.lesson_date);
          }

          // Load homework content
          // MULTI-HW-ASSIGN-V1: Load all existing homework for this record
          const { data: existingHwList } = await supabase
            .from('homework_assignments')
            .select(HOMEWORK_LOAD_COLUMNS)
            .eq('lesson_record_id', record.id);
          if (existingHwList && existingHwList.length > 0) {
            setNewHomeworkItems(existingHwList.map((hw: any) => ({
              id: hw.id,
              content: hw.content || '',
              is_daily: hw.homework_type === 'daily',
            })));
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
          setIsNewRecordMode(true); // It's a new record even in view mode
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
            const newSubject = initialContext.subject || getLastSelectedSubject(user.id);
            setFormData(prev => ({
              ...prev,
              student_id: initialContext.student_id,
              class_id: initialContext.class_id || '',
              subject: newSubject,
              lesson_date: initialContext.lesson_date || getTodayKST(),
            }));
            // PREFILL-FIX-V5: Mark as new record mode AND new draft for prefill to run
            setIsNewRecordMode(true);
            setIsNewDraft(true);
            console.log('[PREFILL-FIX-V5] New draft created, isNewRecordMode=true, isNewDraft=true, subject=', newSubject);
            // TEST-SCHEDULE-PREFILL-V1: Prefill test data from test_schedules for new drafts
            const draftDate = initialContext.lesson_date || getTodayKST();
            await prefillFromTestSchedules(initialContext.student_id, newSubject, draftDate);
          }
        }
      } else {
        // PREFILL-FIX-V5: Form opened without initialContext (e.g., blank new form)
        setIsNewRecordMode(true);
        setIsNewDraft(true);
        console.log('[PREFILL-FIX-V5] No initialContext, marking as new record mode');
      }
    } catch (error) {
      console.error('Error initializing form:', error);
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
      console.log('[PREFILL-FIX-V5] Initial load complete');
    }
  }

  // PREFILL-FIX-V5: useEffect to trigger prefill when student_id + subject + loading state settle
  // Allow prefill for new records OR new drafts (even if recordId exists)
  useEffect(() => {
    if (!initialLoadComplete || !user?.id) {
      return;
    }
    
    // PREFILL-FIX-V5: Allow prefill if isNewRecordMode OR isNewDraft
    if (!isNewRecordMode && !isNewDraft) {
      console.log('[PREFILL-FIX-V5] Not new record/draft, skipping prefill');
      return;
    }
    
    const studentId = formData.student_id;
    const subject = formData.subject;
    
    if (!studentId) {
      console.log('[PREFILL-FIX-V5] No student_id, skipping prefill');
      return;
    }

    console.log('[PREFILL-FIX-V5] Prefill trigger: student=', studentId, 'subject=', subject, 'newMode=', isNewRecordMode, 'newDraft=', isNewDraft);

    if (subject === '수학') {
      prefillStudentCurriculumTags(studentId, user.id);
    } else if (subject === '영어') {
      prefillEnglishCurriculumTags(studentId);
    }
  }, [initialLoadComplete, isNewRecordMode, isNewDraft, formData.student_id, formData.subject, user?.id, prefillStudentCurriculumTags, prefillEnglishCurriculumTags]);

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

      // Filter out 휴강/공지사항 lesson types and find the first valid lesson
      // PREV-LESSON-FIX-V1: Show most recent valid lesson regardless of homework existence
      let validLesson: LessonRecord | null = null;
      let homeworkData: HomeworkAssignment | null = null;
      
      for (const lesson of (lessonData || [])) {
        const lessonTypes = (lesson as any).lesson_types || [];
        if (lessonTypes.includes('휴강') || lessonTypes.includes('공지사항')) {
          continue; // Skip 휴강/공지사항 records
        }
        
        // Use the first valid (non-휴강) lesson as previous lesson
        validLesson = lesson as LessonRecord;
        
        // Check if this lesson has homework
        const { data: hw } = await supabase
          .from('homework_assignments')
          .select('*')
          .eq('lesson_record_id', lesson.id)
          .maybeSingle();
        
        if (hw && hw.content && hw.content.trim() !== '') {
          homeworkData = hw as HomeworkAssignment;
        }
        break; // Always use the first valid lesson
      }

      // PREV-HW-FALLBACK-V1: If lesson-linked homework is missing, use latest previous assignment for same student+subject
      if (!homeworkData) {
        const { data: fallbackHw } = await supabase
          .from('homework_assignments')
          .select('*')
          .eq('student_id', studentId)
          .eq('subject', subject as SubjectType)
          .lt('assigned_date', currentDate)
          .not('content', 'eq', '')
          .order('assigned_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackHw && fallbackHw.content && fallbackHw.content.trim() !== '') {
          homeworkData = fallbackHw as HomeworkAssignment;
        }
      }

      // MULTI-HW-V1: Fetch ALL unchecked homeworks for this student+subject (includes carry-forwards)
      const { data: allUncheckedHw } = await supabase
        .from('homework_assignments')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject', subject as SubjectType)
        .eq('check_status', 'unchecked')
        .lt('assigned_date', currentDate)
        .not('content', 'eq', '')
        .order('assigned_date', { ascending: false });

      const allUncheckedList = (allUncheckedHw || []) as HomeworkAssignment[];

      // Also fetch checker names for any checked items in allPreviousHomeworks context
      // Fetch all unchecked + the lesson-linked homework (which may already be checked)
      let allHwItems: HomeworkAssignment[] = [...allUncheckedList];
      
      // Add the lesson-linked homework if it's checked (already handled above) and not in the unchecked list
      if (homeworkData && homeworkData.check_status === 'checked') {
        if (!allHwItems.find(h => h.id === homeworkData!.id)) {
          allHwItems.push(homeworkData);
        }
      }

      // Deduplicate
      const seenIds = new Set<string>();
      allHwItems = allHwItems.filter(h => {
        if (seenIds.has(h.id)) return false;
        seenIds.add(h.id);
        return true;
      });

      setAllPreviousHomeworks(allHwItems);

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
          
          // TEACHER-HW-SUBMISSION-VIEW-V1: Fetch student submission for this homework
          const { data: submissionData } = await supabase
            .from('homework_submissions')
            .select('*')
            .eq('homework_id', homeworkData.id)
            .eq('student_id', studentId)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (submissionData) {
            setStudentSubmission(submissionData as HomeworkSubmission);
          } else {
            setStudentSubmission(null);
          }
          
          // TEACHER-HW-SUBMISSION-VIEW-V1: Fetch point history for this homework
          const { data: pointData } = await supabase
            .from('student_point_history')
            .select('id, points, reason, created_at')
            .eq('student_id', studentId)
            .eq('related_homework_id', homeworkData.id)
            .order('created_at', { ascending: false });
          
          if (pointData && pointData.length > 0) {
            setPointHistory(pointData as PointHistoryEntry[]);
          } else {
            setPointHistory([]);
          }
        } else {
          setPreviousLessonHomework(null);
          setStudentSubmission(null);
          setPointHistory([]);
        }
      } else {
        setPreviousLesson(null);
        setPreviousLessonHomework(null);
        setAllPreviousHomeworks(allUncheckedList); // Still show unchecked homeworks even without previous lesson
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
    const attendance_status = toStorageAttendanceStatuses(formData.attendance_status);

    // LESSON-EDIT-MODE-V1: Preserve original teacher_id in edit mode unless explicitly new record
    const teacherId = originalTeacherId || user!.id;

    // MATH-CURRICULUM-TAG-V1: Include curriculum fields for Math subject
    // KOREAN-CATEGORY-V1: Include korean_categories for 국어 subject
    const curriculumFields = subject === '수학' ? {
      curriculum_version: formData.curriculum_version || null,
      course: formData.course || null,
      curriculum_unit_key: formData.curriculum_unit_key || null,
      english_grammar_unit: null,
      english_reading_units: null,
      korean_categories: null,
    } : subject === '영어' ? {
      // ENGLISH-CURRICULUM-V1: Include English curriculum fields
      curriculum_version: null,
      course: null,
      curriculum_unit_key: null,
      english_grammar_unit: formData.english_grammar_unit || null,
      english_reading_units: formData.english_reading_units && formData.english_reading_units.length > 0 
        ? formData.english_reading_units 
        : null,
      korean_categories: null,
    } : subject === '국어' ? {
      // KOREAN-CATEGORY-V1: Include Korean curriculum categories
      curriculum_version: null,
      course: null,
      curriculum_unit_key: null,
      english_grammar_unit: null,
      english_reading_units: null,
      korean_categories: formData.korean_categories && formData.korean_categories.length > 0
        ? formData.korean_categories
        : null,
    } : {
      curriculum_version: null,
      course: null,
      curriculum_unit_key: null,
      english_grammar_unit: null,
      english_reading_units: null,
      korean_categories: null,
    };

    // SUPPLEMENT-TIME-V2: Prepend supplement_time and teacher to notes for 보충수업
    const isSupplementary = lesson_types.includes('보충수업');
    let finalNotes = formData.notes.trim() || null;
    if (isSupplementary && formData.supplement_time) {
      const timePrefix = `[보충 시간: ${formData.supplement_time}]`;
      if (!finalNotes || !finalNotes.includes('[보충 시간:')) {
        finalNotes = finalNotes ? `${timePrefix}\n${finalNotes}` : timePrefix;
      }
    }
    // SUPPLEMENT-TEACHER-V1: Prepend teacher name to notes for 보충수업
    if (isSupplementary && formData.supplement_teacher_name) {
      const teacherPrefix = `[보충 선생님: ${formData.supplement_teacher_name}]`;
      if (!finalNotes || !finalNotes.includes('[보충 선생님:')) {
        finalNotes = finalNotes ? `${teacherPrefix}\n${finalNotes}` : teacherPrefix;
      }
    }

    const basePayload = {
      teacher_id: teacherId,
      student_id: formData.student_id,
      class_id: formData.class_id || null,
      subject,
      lesson_date: formData.lesson_date,
      lesson_range: formData.lesson_range.trim(),
      // SHARED-FORM-V3: Set understanding_score to NULL for test visits AND absences
      understanding_score: shouldDisableUnderstandingScore(lesson_types, attendance_status) ? null : parseInt(formData.understanding_score),
      homework_status: formData.homework_status,
      learning_issues: formData.learning_issues,
      learning_issues_note: formData.learning_issues_note.trim() || null,
      next_lesson_goal: formData.next_lesson_goal.trim() || null,
      notes: finalNotes,
      internal_notes: formData.internal_notes.trim() || null,
      lesson_types,
      attendance_status,
      ...curriculumFields,
    };

    if (includeTestFields) {
      return {
        ...basePayload,
        test_name: testFormData.test_name || null,
        test_content: testFormData.test_name || null, // Unified: same value
        test_title: testFormData.test_name || null, // Unified: same value
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
        // HOMEWORK-STATUS-PROTECT-V1: On update, preserve DB homework_status to prevent overwriting
        // homework check results that were set by handleSaveHomeworkCheck
        const { homework_status: _hwIgnored, ...updatePayload } = payload;
        const { error } = await supabase
          .from('lesson_records')
          .update({ ...updatePayload, submitted: false })
          .eq('id', draftId);
        if (error) throw error;
      } else {
        // LESSON-DEDUP-V1: 같은 학생·과목·날짜의 기존 레코드가 있으면 (draft/submitted 무관, class_id 무관)
        // 항상 그 레코드에 병합 update. 새 insert는 진짜 없을 때만.
        const { data: existingRecord } = await supabase
          .from('lesson_records')
          .select('id, submitted')
          .eq('student_id', payload.student_id)
          .eq('lesson_date', payload.lesson_date)
          .eq('subject', payload.subject)
          .maybeSingle();

        if (existingRecord) {
          console.log('[LESSON-DEDUP-V1] Merging into existing record:', existingRecord.id);
          const { homework_status: _hwIgnored, ...updatePayload } = payload;
          // 이미 제출된 레코드면 submitted 상태 보존, 아니면 draft로
          const nextSubmitted = existingRecord.submitted ? {} : { submitted: false };
          const { error } = await supabase
            .from('lesson_records')
            .update({ ...updatePayload, ...nextSubmitted })
            .eq('id', existingRecord.id);
          if (error) throw error;
          setCurrentDraftId(existingRecord.id);
          finalDraftId = existingRecord.id;
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
      }


      // MULTI-HW-ASSIGN-V1: Save multiple homework items
      const validItems = newHomeworkItems.filter(item => item.content.trim());
      if (validItems.length > 0 && finalDraftId) {
        // HW-RECONCILE-V1: update existing rows in place, insert only new ones
        await reconcileLessonHomework({
          lessonRecordId: finalDraftId,
          studentId: formData.student_id,
          subject: formData.subject,
          assignedDate: formData.lesson_date,
          items: validItems.map(item => ({
            id: item.id,
            content: item.content,
            homework_type: item.is_daily ? 'daily' : 'regular',
          })),
        });
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
        // HOMEWORK-STATUS-PROTECT-V1: On update, preserve DB homework_status
        const { homework_status: _hwIgnored, ...updatePayload } = payload;
        const { error } = await supabase.from('lesson_records').update(updatePayload).eq('id', recordId);
        if (error) throw error;
      } else {
        // LESSON-DEDUP-V1: 같은 학생·과목·날짜의 기존 레코드가 있으면 그 위에 병합 update (submitted=true 처리)
        const { data: existingRecord } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', payload.student_id)
          .eq('lesson_date', payload.lesson_date)
          .eq('subject', payload.subject)
          .maybeSingle();

        if (existingRecord) {
          console.log('[LESSON-DEDUP-V1] Submitting into existing record:', existingRecord.id);
          const { homework_status: _hwIgnored, ...updatePayload } = payload;
          const { error } = await supabase.from('lesson_records').update(updatePayload).eq('id', existingRecord.id);
          if (error) throw error;
          finalRecordId = existingRecord.id;
        } else {
          const { data, error } = await supabase.from('lesson_records').insert(payload).select().single();
          if (error) throw error;
          finalRecordId = data.id;
        }
      }


      // MULTI-HW-ASSIGN-V1: Save multiple homework items
      const validItems = newHomeworkItems.filter(item => item.content.trim());
      if (validItems.length > 0 && finalRecordId) {
        // HW-RECONCILE-V1: update existing rows in place, insert only new ones
        await reconcileLessonHomework({
          lessonRecordId: finalRecordId,
          studentId: formData.student_id,
          subject: formData.subject,
          assignedDate: formData.lesson_date,
          items: validItems.map(item => ({
            id: item.id,
            content: item.content,
            homework_type: item.is_daily ? 'daily' : 'regular',
          })),
        });
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

  // HOMEWORK-STATUS-PERSIST-V2: Map homework check result to lesson_records.homework_status
  const mapHomeworkResultToStatus = (result: string): string => {
    switch (result) {
      case 'completed': return 'completed';
      case 'partial': return 'partial';
      case 'not_done': return 'not_done';
      case 'lost': return 'not_done';
      case 'low_effort': return 'not_done';
      case 'unable_to_verify': return 'none_assigned';
      default: return 'none_assigned';
    }
  };

  // ABSENCE-AUTO-CARRY-V1: When absence is marked, auto carry-forward all unchecked previous homeworks
  // to the next calendar day, mark originals as checked (unable_to_verify) with a 결석 reason note.
  const autoCarryForwardOnAbsence = async () => {
    if (isViewMode || !user) return;
    if (!formData.student_id || !formData.subject) return;
    try {
      const pool: HomeworkAssignment[] = [];
      const seen = new Set<string>();
      for (const h of allPreviousHomeworks || []) {
        if (h && h.check_status !== 'checked' && !seen.has(h.id)) { pool.push(h); seen.add(h.id); }
      }
      if (previousHomework && previousHomework.check_status !== 'checked' && !seen.has(previousHomework.id)) {
        pool.push(previousHomework); seen.add(previousHomework.id);
      }
      if (pool.length === 0) return;

      const base = new Date(formData.lesson_date || getTodayKST());
      base.setDate(base.getDate() + 1);
      const nextDate = format(base, 'yyyy-MM-dd');
      const reasonLabel = '결석';
      const carryNote = `[이월사유: ${reasonLabel}] 결석으로 다음시간 검사예정으로 이월`;

      let carried = 0;
      for (const hwItem of pool) {
        const contentWithReason = `[${reasonLabel}이월] ${hwItem.content}`;
        const { data: dup } = await supabase
          .from('homework_assignments')
          .select('id')
          .eq('student_id', hwItem.student_id)
          .eq('subject', hwItem.subject as any)
          .eq('assigned_date', nextDate)
          .eq('content', contentWithReason)
          .maybeSingle();
        if (!dup) {
          await supabase.from('homework_assignments').insert({
            student_id: hwItem.student_id,
            subject: hwItem.subject as any,
            content: contentWithReason,
            assigned_date: nextDate,
            homework_type: 'regular',
            created_by: user.id,
          });
        }
        await supabase.from('homework_assignments').update({
          check_status: 'checked',
          checked_by: user.id,
          checked_at: new Date().toISOString(),
          result: 'unable_to_verify',
          notes: carryNote,
        }).eq('id', hwItem.id);
        carried++;
      }

      if (carried > 0) {
        toast({ title: '결석 → 숙제 자동 이월', description: `${carried}건을 ${nextDate}로 이월했습니다.` });
        await fetchPreviousLesson(formData.student_id, formData.subject, formData.lesson_date);
      }
    } catch (err: any) {
      console.error('[ABSENCE-AUTO-CARRY] failed:', err);
      toast({ title: '숙제 자동 이월 실패', description: err.message, variant: 'destructive' });
    }
  };

  // MULTI-HW-V1: Save homework check for a specific homework item
  const handleSaveHomeworkCheckForItem = async (hwItem: HomeworkAssignment, checkResult: string, checkNotes: string) => {
    if (isViewMode) return;
    if (!hwItem || !checkResult || !user) return;

    setIsSavingHomeworkCheck(true);
    try {
      const { error } = await supabase
        .from('homework_assignments')
        .update({
          check_status: 'checked',
          result: checkResult,
          notes: checkNotes.trim() || null,
          checked_by: user.id,
          checked_at: new Date().toISOString(),
        })
        .eq('id', hwItem.id);

      if (error) throw error;

      const homeworkStatusToSave = mapHomeworkResultToStatus(checkResult);
      setFormData(prev => ({ ...prev, homework_status: homeworkStatusToSave }));

      // HW-STATUS-PERSIST-FIX-V1: include currentDraftId so newly-created drafts also persist the homework_status
      const targetRecordId = editingLesson?.id || existingRecordId || currentDraftId;
      if (targetRecordId) {
        await supabase
          .from('lesson_records')
          .update({ homework_status: homeworkStatusToSave })
          .eq('id', targetRecordId);
      }

      // POINT-AWARD-V3: Award/deduct points
      let pointsAwarded = false;
      let awardedPoints = 0;
      
      let pointsAlreadyAwarded = false;
      if (['completed', 'not_done', 'lost', 'low_effort'].includes(checkResult)) {
        const { data: existingPoints } = await supabase
          .from('student_point_history')
          .select('id')
          .eq('related_homework_id', hwItem.id)
          .limit(1);
        pointsAlreadyAwarded = (existingPoints?.length || 0) > 0;
      }

      if (!pointsAlreadyAwarded) {
        if (checkResult === 'completed') {
          const hasPhotoSubmission = !!(hwItem.submission_image_url && hwItem.submitted_at);
          awardedPoints = hasPhotoSubmission ? 10 : 5;
        } else if (['not_done', 'lost', 'low_effort'].includes(checkResult)) {
          awardedPoints = -5;
        }
      }

      if (awardedPoints !== 0 && !pointsAlreadyAwarded) {
        let reason = '';
        if (awardedPoints === 10) reason = '숙제 완료 보상 (사진 인증)';
        else if (awardedPoints === 5) reason = '숙제 완료 보상 (현장 확인)';
        else if (awardedPoints === -5) reason = '숙제 미이행 감점';

        await supabase.from('student_point_history').insert({
          student_id: hwItem.student_id,
          points: awardedPoints,
          reason,
          related_homework_id: hwItem.id,
          created_by: user.id,
        });

        const { data: student } = await supabase
          .from('students')
          .select('total_points')
          .eq('id', hwItem.student_id)
          .single();

        if (student) {
          await supabase
            .from('students')
            .update({ total_points: (student.total_points || 0) + awardedPoints })
            .eq('id', hwItem.student_id);
          pointsAwarded = true;
        }
      }

      const statusLabel = { completed: '완료', partial: '일부완료', not_done: '미이행', none_assigned: '없음' }[homeworkStatusToSave] || homeworkStatusToSave;
      if (pointsAwarded) {
        const pointLabel = awardedPoints > 0 ? `+${awardedPoints}점 지급` : `${awardedPoints}점 감점`;
        toast({ title: '숙제 확인 완료', description: `숙제상태: ${statusLabel} | ${pointLabel}` });
      } else {
        toast({ title: '숙제 확인 완료', description: `숙제상태: ${statusLabel}` });
      }
      
      if (formData.student_id && formData.subject) {
        await fetchPreviousLesson(formData.student_id, formData.subject, formData.lesson_date);
      }
    } catch (error: any) {
      console.error('Error saving homework check:', error);
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingHomeworkCheck(false);
    }
  };

  // Legacy wrapper for backward compat
  const handleSaveHomeworkCheck = async () => {
    if (!previousHomework || !homeworkCheckResult) return;
    await handleSaveHomeworkCheckForItem(previousHomework, homeworkCheckResult, homeworkCheckNotes);
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
    <form onSubmit={handleSubmit} className={`space-y-5 ${isViewMode ? 'pointer-events-none' : ''}`}>

      {/* Error banner if no students/classes loaded */}
      {students.length === 0 && classes.length === 0 && (
        <div className="p-3 bg-destructive/20 text-destructive rounded-lg text-sm font-medium">
          학생 및 클래스 목록을 불러오지 못했습니다.
        </div>
      )}

      {/* View mode: re-enable pointer events for edit button */}
      {isViewMode && isAdmin && onRequestEdit && (
        <div className="pointer-events-auto flex justify-end">
          <Button type="button" variant="default" onClick={onRequestEdit}>
            <FileEdit className="w-4 h-4 mr-1" />
            편집하기
          </Button>
        </div>
      )}

      {/* STICKY-HEADER-V2: Sticky context header — refined design */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-3 -mx-5 px-5 pt-1 space-y-2 border-b border-border/40">
        {/* Context info header */}
        <div className="flex items-center gap-3 py-2.5 flex-wrap">
        {/* Student field - PREFILL-FIX-V4: Reset prefill keys on student change */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">학생:</span>
          {canSelectStudentClass ? (
            <Select
              value={formData.student_id || '_placeholder_'}
              onValueChange={(value) => {
                if (value !== '_placeholder_') {
                  // PREFILL-FIX-V4: Reset prefill keys when student changes
                  lastMathPrefillKeyRef.current = '';
                  lastEnglishPrefillKeyRef.current = '';
                  tagUserChangedRef.current = false;
                  englishTagUserChangedRef.current = false;
                  setFormData(prev => ({ ...prev, student_id: value }));
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
        
        {/* Class field - SUPPLEMENT-TIME-V1: Show time & teacher input for 보충수업 instead of class selector */}
        {formData.lesson_types.includes('보충수업') ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">시간:</span>
            {/* SUPPLEMENT-LOCK-V2: Lock time only for submitted records, drafts remain editable */}
            {editingLesson?.submitted && formData.supplement_time ? (
              <Badge variant="secondary" className="h-8 px-3 text-sm font-mono">{formData.supplement_time}</Badge>
            ) : (
              <Input
                type="time"
                className="w-[140px] h-8"
                placeholder="시간 입력"
                value={formData.supplement_time || ''}
                onChange={(e) => setFormData({ ...formData, supplement_time: e.target.value, class_id: '' })}
                disabled={isViewMode}
              />
            )}
            {!formData.supplement_time && !isViewMode && !(editingLesson?.submitted) && (
              <span className="text-xs text-orange-500">⚠ 시간을 입력해주세요</span>
            )}
            <span className="text-sm text-muted-foreground ml-2">선생님:</span>
            {/* SUPPLEMENT-LOCK-V2: Lock teacher only for submitted records */}
            {editingLesson?.submitted && formData.supplement_teacher_name ? (
              <Badge variant="secondary" className="h-8 px-3 text-sm">{formData.supplement_teacher_name}</Badge>
            ) : teachers && teachers.length > 0 ? (
              <Select
                value={formData.supplement_teacher_name || '_placeholder_'}
                onValueChange={(value) => {
                  if (value !== '_placeholder_') {
                    setFormData({ ...formData, supplement_teacher_name: value });
                  }
                }}
                disabled={isViewMode}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue placeholder="선생님 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_placeholder_" disabled>선생님 선택</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="w-[140px] h-8"
                placeholder="선생님 이름"
                value={formData.supplement_teacher_name || ''}
                onChange={(e) => setFormData({ ...formData, supplement_teacher_name: e.target.value })}
                disabled={isViewMode}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">클래스:</span>
            {canSelectStudentClass ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Teacher filter for schedule-based picker */}
                <Select
                  value={classPickerTeacherId || '_all_'}
                  onValueChange={(v) => setClassPickerTeacherId(v === '_all_' ? '' : v)}
                >
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue placeholder="선생님" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all_">전체 선생님</SelectItem>
                    {scheduleTeachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Schedule-based class selection */}
                <Select
                  value={formData.class_id || '_placeholder_'}
                  onValueChange={(value) => {
                    if (value === '_no_class_') {
                      setFormData({ ...formData, class_id: '' });
                    } else if (value !== '_placeholder_') {
                      const sched = filteredSchedules.find(s => s.class_id === value);
                      const cls = classes.find(c => c.id === value);
                      setFormData({ ...formData, class_id: value, subject: sched?.subject || cls?.subject || formData.subject });
                    }
                  }}
                >
                  <SelectTrigger className="w-[220px] h-8 text-xs">
                    <SelectValue placeholder="시간대/클래스 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_placeholder_" disabled>시간대/클래스 선택</SelectItem>
                    <SelectItem value="_no_class_" className="text-muted-foreground">⏱ 시간 미지정 (선생님 일지만)</SelectItem>
                    {filteredSchedules.length > 0 ? (
                      filteredSchedules.map((s, i) => {
                        const tName = teachers?.find(t => t.id === s.teacher_id)?.name || '';
                        return (
                          <SelectItem key={`${s.class_id}-${i}`} value={s.class_id}>
                            {s.start_time}~{s.end_time} · {s.class_name} ({s.subject}){tName && !classPickerTeacherId ? ` - ${tName}` : ''}
                          </SelectItem>
                        );
                      })
                    ) : (
                      <SelectItem value="_none_" disabled className="text-xs text-muted-foreground">
                        {selectedDayOfWeek >= 0 ? '해당 요일에 배정된 수업 없음' : '날짜를 선택하세요'}
                      </SelectItem>
                    )}
                    {/* Fallback: all classes not in schedule */}
                    {classes.filter(c => !filteredSchedules.some(s => s.class_id === c.id)).length > 0 && (
                      <>
                        <SelectItem value="_divider_" disabled className="text-[10px] text-muted-foreground border-t mt-1 pt-1">── 기타 클래스 ──</SelectItem>
                        {classes.filter(c => !filteredSchedules.some(s => s.class_id === c.id)).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name} ({c.subject})</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <span className="font-medium">{className}</span>
            )}
          </div>
        )}
        
        {/* Subject field */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">과목:</span>
          {canSelectStudentClass ? (
            <Select
              value={formData.subject}
              onValueChange={(value) => {
                // PREFILL-FIX-V4: Reset user-touch flags when switching subject (allow prefill for new subject)
                if (value === '수학') {
                  tagUserChangedRef.current = false;
                } else if (value === '영어') {
                  englishTagUserChangedRef.current = false;
                }
                setFormData(prev => ({ ...prev, subject: value }));
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

        {/* Previous lesson summary (compact, inside sticky) */}
        {formData.student_id && formData.subject && !loadingPreviousLesson && previousLesson && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pb-0.5">
            <span className="font-semibold text-primary">지난수업</span>
            <span className="text-muted-foreground/60">·</span>
            <span>{format(new Date(previousLesson.lesson_date), 'M/d')}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="font-medium text-foreground/80 truncate max-w-[280px]">{previousLesson.lesson_range}</span>
          </div>
        )}
      </div>
      {/* END STICKY-HEADER-V2 */}

      {/* Previous lesson detail section */}
      {formData.student_id && formData.subject && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b border-border/50">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">지난 수업</span>
            {loadingPreviousLesson && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
          </div>
          <div className="p-4 space-y-4">

          {loadingPreviousLesson ? (
            <div className="text-sm text-muted-foreground py-2">불러오는 중...</div>
          ) : previousLesson ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>{format(new Date(previousLesson.lesson_date), 'yyyy-MM-dd')}</span>
                <span className="text-muted-foreground/40">|</span>
                <span className="font-medium text-foreground text-sm">{previousLesson.lesson_range}</span>
              </div>

              {/* MULTI-HW-V1: Render ALL previous homeworks (unchecked + lesson-linked) */}
              {allPreviousHomeworks.length > 0 ? (
                <div className="space-y-3">
                  {allPreviousHomeworks.filter(h => h.check_status !== 'checked').length > 1 && (
                    <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-700">
                      확인할 숙제 {allPreviousHomeworks.filter(h => h.check_status !== 'checked').length}건
                    </Badge>
                  )}
                  {allPreviousHomeworks.map((hwItem, hwIdx) => (
                    <div key={hwItem.id} className="rounded-lg border border-border/60 bg-secondary/20 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
                        <span className="text-xs font-semibold text-foreground/80">
                          {allPreviousHomeworks.length > 1 ? `숙제 ${hwIdx + 1}` : '지난숙제'}
                          <span className="text-muted-foreground font-normal ml-1.5">{hwItem.assigned_date}</span>
                        </span>
                        {hwItem.check_status === 'checked' && (
                          <Badge variant="secondary" className="text-[10px] h-5">확인됨</Badge>
                        )}
                      </div>
                      <div className="p-3 space-y-3">
                      {/* CARRY-FORWARD-REASON-V1: Show reason badge for carried-forward homework */}
                      {(() => {
                        const reasonMatch = hwItem.content.match(/^\[(분실|미완|부분|성의부족|확인불가)\]\s*/);
                        if (reasonMatch) {
                          const reason = reasonMatch[1];
                          const cleanContent = hwItem.content.replace(reasonMatch[0], '');
                          const reasonColors: Record<string, string> = { '분실': 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', '미완': 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', '부분': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', '성의부족': 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', '확인불가': 'bg-muted text-muted-foreground' };
                          return (
                            <div className="space-y-1.5">
                              <Badge variant="outline" className={`text-[10px] ${reasonColors[reason] || 'bg-muted'}`}>⚠️ 이월사유: {reason}</Badge>
                              <p className="text-sm whitespace-pre-wrap bg-background/80 p-2.5 rounded-md border border-border/30 leading-relaxed">{cleanContent}</p>
                            </div>
                          );
                        }
                        return <p className="text-sm whitespace-pre-wrap bg-background/80 p-2.5 rounded-md border border-border/30 leading-relaxed">{hwItem.content}</p>;
                      })()}

                      {/* Submission display */}
                      {(() => {
                        const hwImages = hwItem.submission_image_url
                          ? hwItem.submission_image_url.split(',').map((u: string) => u.trim()).filter(Boolean)
                          : [];
                        const submittedAt = hwItem.submitted_at;
                        const submissionNote = hwItem.submission_text;
                        const audioUrl = hwItem.submission_audio_url || null;
                        const hasSubmission = hwImages.length > 0 || submissionNote || !!audioUrl;
                        if (!hasSubmission) return null;
                        return (
                          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                            <div className="flex items-center gap-2">
                              <Camera className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium text-primary">📷/🎤 인증 완료</span>
                              {submittedAt && (
                                <span className="text-xs text-muted-foreground">({format(new Date(submittedAt), 'MM/dd HH:mm')})</span>
                              )}
                            </div>
                            {audioUrl && (
                              <div className="rounded-md border bg-background p-2">
                                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Mic className="w-3 h-3" />음성 제출</p>
                                <audio controls className="w-full" src={audioUrl} />
                              </div>
                            )}
                            {submissionNote && (
                              <div className="text-sm text-muted-foreground bg-secondary/30 p-2 rounded">
                                <span className="font-medium text-xs">학생 메모: </span>{submissionNote}
                              </div>
                            )}
                            {hwImages.length > 0 && (
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {hwImages.slice(0, 4).map((url: string, idx: number) => (
                                  <div key={idx} className="relative cursor-pointer rounded overflow-hidden border w-20 h-20 flex-shrink-0" onClick={() => setShowSubmissionImageModal(true)}>
                                    <img src={url} alt={`숙제 인증 ${idx + 1}`} className="w-full h-full object-cover hover:opacity-80 transition-opacity" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {hwItem.check_status === 'checked' ? (
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          <span>확인됨</span>
                          {hwItem.result && (
                            <Badge variant="outline" className="text-[10px] h-4">
                              {HOMEWORK_RESULT_OPTIONS.find(o => o.value === hwItem.result)?.label || hwItem.result}
                            </Badge>
                          )}
                          {hwItem.notes?.includes('이월사유') && (
                            <Badge variant="outline" className="text-[10px] h-4 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              ↗ 다음시간 이월
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2.5 pt-2.5 border-t border-border/40">
                          <span className="text-xs font-medium text-muted-foreground">숙제상태 확인</span>
                          <div className="flex flex-wrap gap-1.5">
                            {HOMEWORK_RESULT_OPTIONS.map((opt) => {
                              const Icon = opt.icon;
                              const isSelected = (homeworkCheckResults[hwItem.id] || '') === opt.value;
                              return (
                                <Button key={opt.value} type="button" variant={isSelected ? 'default' : 'outline'} size="sm" onClick={() => setHomeworkCheckResults(prev => ({ ...prev, [hwItem.id]: opt.value }))} className={`gap-1 h-7 text-xs px-2.5 ${!isSelected ? 'border-border/60' : ''}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                  {opt.label === '완료' ? '완료' : opt.label === '부분' ? '일부완료' : opt.label === '미완' ? '미이행' : opt.label}
                                </Button>
                              );
                            })}
                          </div>
                          <Textarea placeholder="확인 메모 (선택)" value={homeworkCheckNotesMap[hwItem.id] || ''} onChange={(e) => setHomeworkCheckNotesMap(prev => ({ ...prev, [hwItem.id]: e.target.value }))} rows={2} className="text-xs" />
                          <div className="flex gap-2">
                            <Button type="button" size="sm" className="h-7 text-xs" onClick={() => handleSaveHomeworkCheckForItem(hwItem, homeworkCheckResults[hwItem.id] || '', homeworkCheckNotesMap[hwItem.id] || '')} disabled={!homeworkCheckResults[hwItem.id] || isSavingHomeworkCheck}>
                              {isSavingHomeworkCheck && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              확인 저장
                            </Button>
                            {/* CARRY-FORWARD-REASON-V1: Show carry-forward only for non-completion results */}
                            {homeworkCheckResults[hwItem.id] && homeworkCheckResults[hwItem.id] !== 'completed' && (
                            <Button type="button" size="sm" variant="outline" className="gap-1 h-7 text-xs" disabled={carryForwardLoading} onClick={async () => {
                              if (!user) return;
                              setCarryForwardLoading(true);
                              try {
                                const selectedResult = homeworkCheckResults[hwItem.id] || 'not_done';
                                const reasonLabel = HOMEWORK_RESULT_OPTIONS.find(o => o.value === selectedResult)?.label || selectedResult;
                                const contentWithReason = `[${reasonLabel}] ${hwItem.content}`;
                                const carryNote = `[이월사유: ${reasonLabel}] 다음시간 검사예정으로 이월`;
                                const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                                const nextDate = format(tomorrow, 'yyyy-MM-dd');
                                // HW-CARRY-FORWARD-DEDUP-V1: skip insert if an identical carried-forward row already exists
                                const { data: dupHw } = await supabase
                                  .from('homework_assignments')
                                  .select('id')
                                  .eq('student_id', hwItem.student_id)
                                  .eq('subject', hwItem.subject as any)
                                  .eq('assigned_date', nextDate)
                                  .eq('content', contentWithReason)
                                  .maybeSingle();
                                if (!dupHw) {
                                  await supabase.from('homework_assignments').insert({ student_id: hwItem.student_id, subject: hwItem.subject as any, content: contentWithReason, assigned_date: nextDate, homework_type: 'regular', created_by: user.id });
                                }
                                await supabase.from('homework_assignments').update({ check_status: 'checked', checked_by: user.id, checked_at: new Date().toISOString(), result: selectedResult, notes: carryNote }).eq('id', hwItem.id);
                                toast({ title: '다음시간으로 이월됨', description: `사유: ${reasonLabel} / ${hwItem.content}` });
                                if (formData.student_id && formData.subject) { await fetchPreviousLesson(formData.student_id, formData.subject, formData.lesson_date); }
                              } catch (err: any) { toast({ title: '이월 실패', description: err.message, variant: 'destructive' }); } finally { setCarryForwardLoading(false); }
                            }}>
                              {carryForwardLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                              다음시간 검사예정
                            </Button>
                            )}
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : previousLessonHomework ? (
                <div className="p-3 bg-background rounded-lg border space-y-3">
                  <Label className="text-sm font-medium">지난숙제</Label>
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
                            <Button key={opt.value} type="button" variant={homeworkCheckResult === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setHomeworkCheckResult(opt.value)} className="gap-1">
                              <Icon className="w-4 h-4" />
                              {opt.label === '완료' ? '완료' : opt.label === '부분' ? '일부완료' : opt.label === '미완' ? '미이행' : opt.label}
                            </Button>
                          );
                        })}
                      </div>
                      <Textarea placeholder="확인 메모 (선택)" value={homeworkCheckNotes} onChange={(e) => setHomeworkCheckNotes(e.target.value)} rows={2} className="text-sm" />
                      <Button type="button" size="sm" onClick={handleSaveHomeworkCheck} disabled={!homeworkCheckResult || isSavingHomeworkCheck}>
                        {isSavingHomeworkCheck && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        확인 저장
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Image carousel modal */}
              <Dialog open={showSubmissionImageModal} onOpenChange={setShowSubmissionImageModal}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Camera className="w-5 h-5" />
                      학생 숙제 인증 사진
                    </DialogTitle>
                  </DialogHeader>
                  {(() => {
                    const hwImages = previousLessonHomework?.submission_image_url
                      ? previousLessonHomework.submission_image_url.split(',').map((u: string) => u.trim()).filter(Boolean)
                      : [];
                    const subImages = studentSubmission?.image_url
                      ? studentSubmission.image_url.split(',').map((u: string) => u.trim()).filter(Boolean)
                      : [];
                    const images = hwImages.length > 0 ? hwImages : subImages;
                    const submittedAt = previousLessonHomework?.submitted_at || studentSubmission?.submitted_at;
                    const note = previousLessonHomework?.submission_text || studentSubmission?.submission_note;
                    if (images.length === 0) return null;
                    return <SubmissionImageCarousel images={images} submittedAt={submittedAt} note={note} />;
                  })()}
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-2">이전 수업 기록 없음</div>
          )}
          </div>
        </div>
      )}

      {/* 휴강 indicator */}
      {formData.lesson_types.includes('휴강') && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-muted">
          <Badge variant="secondary">휴강 기록</Badge>
          <span className="text-sm text-muted-foreground">수업 범위, 이해도 등 필드가 비활성화됩니다.</span>
        </div>
      )}

      {/* SHARED-FORM-V3: 테스트방문 indicator */}
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
                    const newStatus = [...formData.attendance_status, opt.value];
                    setFormData({ ...formData, attendance_status: newStatus });
                    // ABSENCE-SUPPLEMENT-V1: Prompt for supplementary scheduling on absence
                    if (ABSENCE_STATUSES.includes(opt.value)) {
                      setSupplementDate('');
                      setSupplementTime('');
                      setShowAbsenceSupplementDialog(true);
                      // ABSENCE-AUTO-CARRY-V1: Auto carry-forward unchecked homework on absence
                      void autoCarryForwardOnAbsence();
                    }
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

      {/* ABSENCE-SUPPLEMENT-V1: Supplementary lesson scheduling dialog */}
      <AlertDialog open={showAbsenceSupplementDialog} onOpenChange={setShowAbsenceSupplementDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>보충수업 일정을 잡으시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              결석 처리된 학생의 보충수업 날짜와 시간을 지정할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-sm">보충수업 날짜</Label>
              <Input
                type="date"
                value={supplementDate}
                onChange={(e) => setSupplementDate(e.target.value)}
                min={formData.lesson_date}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">보충수업 시간</Label>
              <Select
                value={supplementTime || '__none__'}
                onValueChange={(v) => setSupplementTime(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="시간 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">선택 안함</SelectItem>
                  <SelectItem value="미정">시간 미정</SelectItem>
                  {SUPPLEMENT_TIME_OPTIONS.map((time) => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>아니오</AlertDialogCancel>
            <AlertDialogAction
              disabled={!supplementDate || isSavingSupplementary}
              onClick={async (e) => {
                e.preventDefault();
                if (!supplementDate || !user || !formData.student_id) return;
                setIsSavingSupplementary(true);
                try {
                  const teacherName = teachers?.find(t => t.id === user.id)?.name || '';
                  const timeLabel = supplementTime && supplementTime !== '미정' ? supplementTime : '미정';
                  const notesContent = [
                    `[보충 시간: ${timeLabel}]`,
                    teacherName ? `[보충 선생님: ${teacherName}]` : '',
                  ].filter(Boolean).join('\n');

                  const { error } = await supabase
                    .from('lesson_records')
                    .insert({
                      teacher_id: user.id,
                      student_id: formData.student_id,
                      class_id: formData.class_id || null,
                      subject: formData.subject as any,
                      lesson_date: supplementDate,
                      lesson_range: '보충수업 예정',
                      homework_status: 'none_assigned',
                      lesson_types: ['보충수업'],
                      attendance_status: ['정상등원'],
                      notes: notesContent,
                      submitted: false,
                    });
                  if (error) throw error;
                  toast({ title: '보충수업 일정 등록 완료', description: `${supplementDate} ${timeLabel === '미정' ? '(시간 미정)' : timeLabel}` });
                  setShowAbsenceSupplementDialog(false);
                } catch (err: any) {
                  toast({ title: '보충수업 등록 실패', description: err.message, variant: 'destructive' });
                } finally {
                  setIsSavingSupplementary(false);
                }
              }}
            >
              {isSavingSupplementary ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              등록
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        {/* TAG-PREFILL-MATH-ENGLISH-V1: Show prefill indicator and debug info */}
        {formData.subject === '수학' && (
          <div className="space-y-2">
            <MathCurriculumTag
              curriculumVersion={formData.curriculum_version}
              course={formData.course}
              unitKey={formData.curriculum_unit_key}
              onChange={(version, course, unitKey) => {
                tagUserChangedRef.current = true; // Mark that user changed tags
                setTagPrefillOccurred(false); // Hide prefill message after user change
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
            {/* TAG-PREFILL-MATH-ENGLISH-V1: Show helper text when prefill occurred */}
            {tagPrefillOccurred && !tagUserChangedRef.current && (
              <p className="text-xs text-muted-foreground">
                ✓ 최근 입력 태그를 불러왔습니다.
              </p>
            )}
            {/* PREFILL-FIX-V5: Admin debug info with record ID and state */}
            {isAdmin && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded font-mono">
                PREFILL-FIX-V5: source={tagSource} newMode={isNewRecordMode ? 1 : 0} isNewDraft={isNewDraft ? 1 : 0} recordId={currentDraftId?.slice(0, 8) || 'none'}
              </span>
            )}
          </div>
        )}

        {/* ENGLISH-CURRICULUM-V1: English curriculum tagging */}
        {/* TAG-PREFILL-MATH-ENGLISH-V1 */}
        {formData.subject === '영어' && (
          <div className="space-y-2">
            <EnglishCurriculumTag
              grammarUnit={formData.english_grammar_unit}
              readingUnits={formData.english_reading_units}
              studentGrade={null} // Grade not available in form context; user selects level manually
              onChange={(grammarUnit, readingUnits) => {
                englishTagUserChangedRef.current = true;
                setEnglishTagPrefillOccurred(false);
                setFormData(prev => ({
                  ...prev,
                  english_grammar_unit: grammarUnit,
                  english_reading_units: readingUnits,
                }));
              }}
              disabled={isViewMode}
            />
            {/* TAG-PREFILL-MATH-ENGLISH-V1: Show helper text when prefill occurred */}
            {englishTagPrefillOccurred && !englishTagUserChangedRef.current && (
              <p className="text-xs text-muted-foreground">
                ✓ 최근 입력 태그를 불러왔습니다.
              </p>
            )}
            {/* PREFILL-FIX-V5: Admin debug info for English */}
            {isAdmin && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded font-mono">
                PREFILL-FIX-V5: source={englishTagSource} newMode={isNewRecordMode ? 1 : 0} isNewDraft={isNewDraft ? 1 : 0} recordId={currentDraftId?.slice(0, 8) || 'none'}
              </span>
            )}
          </div>
        )}

        {/* KOREAN-CATEGORY-V1: Korean subject categories multi-select */}
        {formData.subject === '국어' && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">국어 수업 카테고리(복수 선택)</Label>
            <div className="p-3 bg-secondary/50 rounded-lg grid grid-cols-2 gap-2">
              {KOREAN_CATEGORY_OPTIONS.map((category) => (
                <div key={category} className="flex items-center space-x-2">
                  <Checkbox
                    id={`korean_category_${category}`}
                    checked={formData.korean_categories.includes(category)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData({ ...formData, korean_categories: [...formData.korean_categories, category] });
                      } else {
                        setFormData({ ...formData, korean_categories: formData.korean_categories.filter(c => c !== category) });
                      }
                    }}
                    disabled={isViewMode}
                  />
                  <label htmlFor={`korean_category_${category}`} className="text-sm cursor-pointer">{category}</label>
                </div>
              ))}
            </div>
            {/* View mode: show as badges */}
            {isViewMode && formData.korean_categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.korean_categories.map((cat) => (
                  <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
        {(() => {
          const isDisabled = shouldDisableUnderstandingScore(formData.lesson_types, formData.attendance_status);
          const isTestVisit = formData.lesson_types.includes('테스트방문');
          const isAbsence = formData.attendance_status.some(s => ABSENCE_STATUSES.includes(s));
          return (
            <div className={`space-y-2 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
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
                    disabled={isDisabled}
                  >
                    {score}
                  </Button>
                ))}
              </div>
              {isTestVisit && (
                <p className="text-sm text-amber-600">테스트방문 기록은 이해도를 입력하지 않습니다.</p>
              )}
              {isAbsence && !isTestVisit && (
                <p className="text-sm text-amber-600">결석 기록은 이해도를 입력하지 않습니다.</p>
              )}
            </div>
          );
        })()}

        {/* HOMEWORK-STATUS-SINGLE-SOURCE-V2: Duplicate homework_status block removed. 
            homework_status is managed via the assistant homework-check area above (lines 1125-1163). */}

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

        {/* 학부모 직접전달 메시지 */}
        <div className="space-y-2">
          <Label htmlFor="form_notes">학부모 직접전달 메시지</Label>
          <Textarea
            id="form_notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="학부모 리포트에 포함되는 메시지입니다."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            주간 리포트 생성 시 학부모에게 전달됩니다.
          </p>
        </div>

        {/* 학부모 미전달 메시지 */}
        <div className="space-y-2">
          <Label htmlFor="form_internal_notes">학부모 미전달 메시지</Label>
          <Textarea
            id="form_internal_notes"
            value={formData.internal_notes}
            onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
            placeholder="학부모에게 전송되지 않으며 내부 기록으로 남깁니다."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            학부모에게 전송되지 않으며 내부 기록으로 남깁니다.
          </p>
        </div>
      </div>

      {/* MULTI-HW-ASSIGN-V1: Multiple homework section */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-green-500/8 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-700">오늘 숙제 ({newHomeworkItems.filter(i => i.content.trim()).length}개)</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewHomeworkItems(prev => [...prev, { content: '', is_daily: false }])}
            className="text-xs gap-1 h-7"
          >
            <Plus className="w-3 h-3" />
            숙제 추가
          </Button>
        </div>
        <div className="p-4 space-y-3">
          {newHomeworkItems.map((item, idx) => (
            <div key={idx} className="relative">
              {newHomeworkItems.length > 1 && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">숙제 {idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewHomeworkItems(prev => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-muted-foreground hover:text-destructive gap-1 h-6 px-2"
                  >
                    <X className="w-3 h-3" />
                    삭제
                  </Button>
                </div>
              )}
              <Textarea
                placeholder={idx === 0 ? "오늘 배정할 숙제 내용" : "추가 숙제 내용"}
                value={item.content}
                onChange={(e) => setNewHomeworkItems(prev => prev.map((it, i) => i === idx ? { ...it, content: e.target.value } : it))}
                rows={2}
                className="text-sm"
              />
              {/* HW-DAILY-OPT-IN-V1: explicit daily-check toggle. Default OFF → homework_type='regular' (다음수업까지 1회성) */}
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!item.is_daily}
                  onChange={(e) => setNewHomeworkItems(prev => prev.map((it, i) => i === idx ? { ...it, is_daily: e.target.checked } : it))}
                  className="w-3.5 h-3.5 rounded border-border"
                />
                <span className="text-[11px] text-muted-foreground">
                  데일리체크 (매일 반복 인증) — 체크 안 하면 <strong>다음 수업까지 1회성</strong>으로 저장됩니다.
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Test section */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-purple-500/8 border-b border-border/50">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700">오늘 테스트</span>
          </div>
          {!isViewMode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={syncTestFromDb}
              disabled={isSyncingTest}
              className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingTest ? 'animate-spin' : ''}`} />
              테스트 연동
            </Button>
          )}
        </div>
        <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-sm">테스트내용 및 범위 <span className="text-destructive text-xs">*필수</span></Label>
            <Input
              value={testFormData.test_name}
              onChange={(e) => setTestFormData({ ...testFormData, test_name: e.target.value })}
              placeholder="예: 중2 1단원 단원평가 / 영단어 Day5 재시험"
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
                <SelectItem value="은서조교">은서조교</SelectItem>
                <SelectItem value="유빈조교">유빈조교</SelectItem>
                <SelectItem value="최수린조교">최수린조교</SelectItem>
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
            className="text-sm"
          />
        </div>
        </div>
      </div>

      {/* Action buttons */}
      {isViewMode ? (
        <div className="flex items-center justify-between pt-5 border-t border-border/60 pointer-events-auto">
          <Button type="button" variant="outline" onClick={onCancel} className="h-9">
            닫기
          </Button>
          {isAdmin && onRequestEdit && (
            <Button type="button" onClick={onRequestEdit} className="h-9">
              <FileEdit className="w-4 h-4 mr-1" />
              편집하기
            </Button>
          )}
        </div>
      ) : canManage && (
        <div className="flex items-center justify-between pt-5 border-t border-border/60">
          <Button type="button" variant="ghost" onClick={onCancel} className="h-9 text-muted-foreground">
            취소
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isSavingDraft} className="h-9">
              {isSavingDraft && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Save className="w-4 h-4 mr-1" />
              임시저장
            </Button>
            <Button type="submit" disabled={isSubmitting} className="h-9">
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
