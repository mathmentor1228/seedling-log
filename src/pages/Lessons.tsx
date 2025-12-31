import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth, isAssistant as checkIsAssistant, isTeacher as checkIsTeacher, isAdmin as checkIsAdmin, canManageLessons } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScoreBadge } from '@/components/ui/score-badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit2, Trash2, Loader2, ClipboardList, Save, Send, FileEdit, CheckCircle2, Clock, AlertCircle, HelpCircle, XCircle, ClipboardCheck, GraduationCap, Calendar } from 'lucide-react';
import { format } from 'date-fns';

type SubjectType = '수학' | '과학' | '영어' | '국어';

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
  next_lesson_goal: string | null;
  notes: string | null;
  student_name?: string;
  submitted: boolean;
  submitted_at: string | null;
  draft_created_at: string;
  // Test fields
  test_name?: string | null;
  test_result_text?: string | null;
  test_result?: 'pass' | 'fail' | 'none';
  test_notes?: string | null;
  test_date?: string | null;
  test_time?: string | null;
  test_assistant?: string | null;
  // Lesson type and attendance fields
  lesson_types?: string[];
  attendance_status?: string[];
}

interface Student {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string;
}

interface TodaySlot {
  id: string;
  class_id: string;
  class_name: string;
  subject: string;
  start_time: string;
  end_time: string;
  students: { id: string; name: string }[];
}

const SUBJECTS = [
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '영어', label: '영어' },
  { value: '국어', label: '국어' },
] as const;

const SUBJECT_VALUES: SubjectType[] = ['수학', '과학', '영어', '국어'];

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


// Common learning issues for all subjects
const COMMON_ISSUES = [
  '체력적으로 피곤',
  '고민하는 노력 필요',
  '학습속도 느림',
];

// Subject-specific learning issues
const SUBJECT_SPECIFIC_ISSUES: Record<SubjectType, string[]> = {
  '수학': [
    '개념 이해 부족',
    '계산 실수',
    '문제 해석 미흡',
    '풀이 과정 누락',
    '시간 관리 미숙',
  ],
  '과학': [
    '개념 암기 부족',
    '개념 간 연결 부족',
    '그래프/자료 해석 미흡',
    '서술형 정리 부족',
    '실험/탐구 이해 부족',
  ],
  '영어': [
    '어휘 부족',
    '문장 구조 이해 부족',
    '독해 속도 느림',
    '문법 적용 미흡',
    '추론/빈칸 문제 약함',
    '단어통과',
    '단어불통과',
  ],
  '국어': [
    '지문 독해 미흡',
    '선지 판단 오류',
    '어휘/표현 이해 부족',
    '문학 해석 미흡',
    '서술형 구조 부족',
  ],
};

// Get learning issues for a specific subject
function getLearningIssuesForSubject(subject: SubjectType | ''): string[] {
  if (!subject || !SUBJECT_VALUES.includes(subject as SubjectType)) {
    return COMMON_ISSUES;
  }
  return [...COMMON_ISSUES, ...SUBJECT_SPECIFIC_ISSUES[subject as SubjectType]];
}

const HOMEWORK_STATUS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '부분 완료' },
  { value: 'not_done', label: '미완료' },
  { value: 'none_assigned', label: '미배정' },
];

// Lesson type options for 종류 checkbox group
const LESSON_TYPE_OPTIONS = [
  { value: '정규수업', label: '정규수업' },
  { value: '보충수업', label: '보충수업' },
  { value: '시험특강', label: '시험특강' },
  { value: '방학특강', label: '방학특강' },
  { value: '공지사항', label: '공지사항' },
];

// Attendance status options for 출결사항 checkbox group
const ATTENDANCE_STATUS_OPTIONS = [
  { value: '정상등원', label: '정상등원' },
  { value: '지각', label: '지각' },
  { value: '조퇴', label: '조퇴' },
  { value: '인정결석', label: '인정결석' },
  { value: '무단결석', label: '무단결석' },
  { value: '보충불가', label: '보충불가' },
];

// Homework result options
const HOMEWORK_RESULT_OPTIONS = [
  { value: 'completed', label: '완료', icon: CheckCircle2, color: 'text-green-600' },
  { value: 'partial', label: '부분', icon: Clock, color: 'text-amber-600' },
  { value: 'not_done', label: '미완', icon: XCircle, color: 'text-red-600' },
  { value: 'unable_to_verify', label: '확인불가', icon: HelpCircle, color: 'text-muted-foreground' },
];

function getHomeworkStatusBadge(homework: HomeworkAssignment | null) {
  if (!homework) return null;
  
  if (homework.check_status === 'unchecked') {
    return <Badge variant="outline" className="border-amber-500/50 text-amber-600"><AlertCircle className="w-3 h-3 mr-1" />미확인</Badge>;
  }
  
  const option = HOMEWORK_RESULT_OPTIONS.find(o => o.value === homework.result);
  if (!option) return null;
  
  const Icon = option.icon;
  const colorClass = homework.result === 'completed' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                     homework.result === 'partial' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                     homework.result === 'not_done' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                     'bg-muted text-muted-foreground';
  
  return <Badge variant="outline" className={colorClass}><Icon className="w-3 h-3 mr-1" />{option.label}</Badge>;
}

export default function Lessons() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [todaySlots, setTodaySlots] = useState<TodaySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonRecord | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    subject: '',
    lesson_date: format(new Date(), 'yyyy-MM-dd'),
    lesson_range: '',
    understanding_score: '3',
    homework_status: 'none_assigned',
    learning_issues: [] as string[],
    next_lesson_goal: '',
    notes: '',
    lesson_types: ['정규수업'] as string[],
    attendance_status: ['정상등원'] as string[],
  });
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Subject change confirmation dialog state
  const [pendingSubject, setPendingSubject] = useState<SubjectType | null>(null);
  const [showSubjectChangeDialog, setShowSubjectChangeDialog] = useState(false);
  
  // Previous homework state
  const [previousHomework, setPreviousHomework] = useState<HomeworkAssignment | null>(null);
  const [loadingHomework, setLoadingHomework] = useState(false);
  const [homeworkCheckResult, setHomeworkCheckResult] = useState<string>('');
  const [homeworkCheckNotes, setHomeworkCheckNotes] = useState<string>('');
  const [isSavingHomeworkCheck, setIsSavingHomeworkCheck] = useState(false);
  
  // New homework state
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

  // Generate test time options (16:00 to 21:00, 30-min steps)
  const TEST_TIME_OPTIONS = Array.from({ length: 11 }, (_, i) => {
    const hour = 16 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  });

  // Check if user is assistant (can only update test fields and homework check)
  const isAssistant = checkIsAssistant(role);
  const isTeacher = checkIsTeacher(role);
  const isAdmin = checkIsAdmin(role);
  // Check if user can create/edit/delete lessons
  const canManage = canManageLessons(role);
  
  useEffect(() => {
    fetchLessons();
    fetchStudents();
    fetchClasses();
    // Fetch today's slots for teachers/admins
    if (isTeacher || isAdmin) {
      fetchTodaySlots();
    }
  }, [user, role]);

  // Deep link handling - auto-open dialog with student_id, class_id, subject, lesson_date from URL
  useEffect(() => {
    const studentId = searchParams.get('student_id');
    const subject = searchParams.get('subject');
    const classId = searchParams.get('class_id');
    const lessonDate = searchParams.get('lesson_date');
    
    // Need students and classes to be loaded before prefilling
    if (studentId && !loading && students.length > 0 && classes.length > 0) {
      // Clear URL params
      setSearchParams({});
      
      // Validate class_id exists in loaded classes
      const validClassId = classId && classes.some(c => c.id === classId) ? classId : '';
      
      if (classId && !validClassId) {
        toast({
          title: '클래스 오류',
          description: '클래스를 찾을 수 없습니다. 직접 선택해주세요.',
          variant: 'destructive',
        });
      }
      
      const finalDate = lessonDate || format(new Date(), 'yyyy-MM-dd');
      const finalSubject = subject || getLastSelectedSubject(user?.id);
      
      // Pre-fill form with all available params
      setFormData(prev => ({
        ...prev,
        student_id: studentId,
        class_id: validClassId,
        subject: finalSubject,
        lesson_date: finalDate,
      }));
      
      // Reset editing state and open dialog
      setEditingLesson(null);
      setCurrentDraftId(null);
      setIsDialogOpen(true);
      
      // Create draft with prefilled values after a short delay
      setTimeout(async () => {
        await createInitialDraft({
          student_id: studentId,
          class_id: validClassId,
          subject: finalSubject,
          lesson_date: finalDate,
        });
      }, 100);
    }
  }, [searchParams, loading, students, classes, toast, user]);

  // Auto-save effect
  useEffect(() => {
    if (!currentDraftId || !isDialogOpen) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData, currentDraftId, isDialogOpen]);

  async function fetchLessons() {
    if (!user) return;

    try {
      let query = supabase
        .from('lesson_records')
        .select(`
          *,
          students:student_id (name)
        `)
        .order('lesson_date', { ascending: false });

      if (role === 'teacher') {
        query = query.eq('teacher_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedLessons = (data || []).map((l: any) => ({
        ...l,
        student_name: l.students?.name,
      }));

      setLessons(formattedLessons);
    } catch (error) {
      console.error('Error fetching lessons:', error);
      toast({
        title: '오류',
        description: '수업 기록을 불러오는데 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }

  async function fetchClasses() {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, subject')
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }

  // Fetch today's class slots for the current teacher
  async function fetchTodaySlots() {
    if (!user) return;

    try {
      // Get today's day of week (0=Sunday, 1=Monday, etc.) using KST
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      const dayOfWeek = kstDate.getUTCDay();

      // Fetch class schedules for today
      let schedulesQuery = supabase
        .from('class_schedules')
        .select(`
          id,
          class_id,
          start_time,
          end_time,
          day_of_week,
          teacher_id,
          classes:class_id (
            id,
            name,
            subject,
            teacher_id
          )
        `)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time', { ascending: true });

      // For teachers, only show their own schedules
      if (checkIsTeacher(role)) {
        schedulesQuery = schedulesQuery.eq('teacher_id', user.id);
      }

      const { data: schedules, error: schedulesError } = await schedulesQuery;

      if (schedulesError) {
        console.error('Error fetching today slots:', schedulesError);
        return;
      }

      // Get students for each class
      const classIds = schedules?.map(s => (s.classes as any)?.id).filter(Boolean) || [];
      
      let studentsMap: Record<string, { id: string; name: string }[]> = {};
      
      if (classIds.length > 0) {
        const { data: classStudents, error: studentsError } = await supabase
          .from('class_students')
          .select(`
            class_id,
            students:student_id (id, name)
          `)
          .in('class_id', classIds);

        if (!studentsError) {
          (classStudents || []).forEach((cs: any) => {
            if (!studentsMap[cs.class_id]) {
              studentsMap[cs.class_id] = [];
            }
            if (cs.students) {
              studentsMap[cs.class_id].push({
                id: cs.students.id,
                name: cs.students.name,
              });
            }
          });
        }
      }

      // Build slots array
      const slots: TodaySlot[] = (schedules || []).map((s: any) => ({
        id: s.id,
        class_id: s.classes?.id || '',
        class_name: s.classes?.name || '알 수 없음',
        subject: s.classes?.subject || '-',
        start_time: s.start_time,
        end_time: s.end_time,
        students: studentsMap[s.classes?.id] || [],
      }));

      setTodaySlots(slots);
    } catch (error) {
      console.error('Error fetching today slots:', error);
    }
  }

  // Create initial draft when opening form for new record
  // If prefill is provided, use those values instead of defaults
  interface DraftPrefill {
    student_id?: string;
    class_id?: string;
    subject?: string;
    lesson_date?: string;
  }
  
  async function createInitialDraft(prefill?: DraftPrefill) {
    if (!user) return;

    try {
      const defaultStudent = prefill?.student_id || students[0]?.id || '';
      const defaultSubject = prefill?.subject || getLastSelectedSubject(user.id);
      const defaultClassId = prefill?.class_id || null;
      const defaultDate = prefill?.lesson_date || format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('lesson_records')
        .insert({
          teacher_id: user.id,
          student_id: defaultStudent,
          class_id: defaultClassId,
          subject: defaultSubject as SubjectType,
          lesson_date: defaultDate,
          lesson_range: '',
          understanding_score: 3,
          homework_status: 'none_assigned',
          learning_issues: [],
          submitted: false,
        } as any)
        .select()
        .single();

      if (error) throw error;

      setCurrentDraftId(data.id);
      setFormData({
        student_id: defaultStudent,
        class_id: defaultClassId || '',
        subject: defaultSubject,
        lesson_date: defaultDate,
        lesson_range: '',
        understanding_score: '3',
        homework_status: 'none_assigned',
        learning_issues: [],
        next_lesson_goal: '',
        notes: '',
        lesson_types: ['정규수업'],
        attendance_status: ['정상등원'],
      });

      return data.id;
    } catch (error: any) {
      console.error('Error creating draft:', error);
      toast({
        title: '오류',
        description: '임시저장 생성에 실패했습니다',
        variant: 'destructive',
      });
      return null;
    }
  }

  // Auto-save to existing draft
  const handleAutoSave = useCallback(async () => {
    if (!currentDraftId || !user) return;

    try {
      const payload = buildPayload();
      if (!payload.student_id) return; // Don't save if no student selected

      await supabase
        .from('lesson_records')
        .update({
          ...payload,
          submitted: false,
        })
        .eq('id', currentDraftId);
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }, [currentDraftId, formData, user]);

  function buildPayload() {
    const subject = formData.subject as SubjectType;
    // Ensure at least one value is selected for lesson_types and attendance_status
    const lesson_types = formData.lesson_types.length > 0 ? formData.lesson_types : ['정규수업'];
    const attendance_status = formData.attendance_status.length > 0 ? formData.attendance_status : ['정상등원'];
    return {
      teacher_id: user!.id,
      student_id: formData.student_id,
      class_id: formData.class_id || null,
      subject,
      lesson_date: formData.lesson_date,
      lesson_range: formData.lesson_range.trim(),
      understanding_score: parseInt(formData.understanding_score),
      homework_status: formData.homework_status,
      learning_issues: formData.learning_issues,
      next_lesson_goal: formData.next_lesson_goal.trim() || null,
      notes: formData.notes.trim() || null,
      lesson_types,
      attendance_status,
    };
  }

  // Manual save as draft
  const handleSaveDraft = async () => {
    if (!user) return;

    if (!formData.student_id) {
      toast({
        title: '유효성 오류',
        description: '학생을 선택해주세요',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingDraft(true);

    try {
      const payload = buildPayload();
      const draftId = currentDraftId || editingLesson?.id;

      if (draftId) {
        const { error } = await supabase
          .from('lesson_records')
          .update({
            ...payload,
            submitted: false,
          })
          .eq('id', draftId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('lesson_records')
          .insert({
            ...payload,
            submitted: false,
          })
          .select()
          .single();

        if (error) throw error;
        setCurrentDraftId(data.id);
      }

      toast({
        title: '임시저장 완료',
        description: '수업 기록이 임시저장되었습니다',
      });

      fetchLessons();
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({
        title: '오류',
        description: error.message || '임시저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit record
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;

    if (!formData.student_id || !formData.subject || !formData.lesson_range) {
      toast({
        title: '유효성 오류',
        description: '필수 항목을 모두 입력해주세요',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        ...buildPayload(),
        submitted: true,
        submitted_at: new Date().toISOString(),
      };

      const recordId = currentDraftId || editingLesson?.id;
      let finalRecordId = recordId;

      if (recordId) {
        const { error } = await supabase
          .from('lesson_records')
          .update(payload)
          .eq('id', recordId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('lesson_records')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        finalRecordId = data.id;
      }

      // Insert new homework if content provided
      if (newHomeworkContent.trim() && finalRecordId) {
        const { error: homeworkError } = await supabase
          .from('homework_assignments')
          .insert({
            student_id: formData.student_id,
            subject: formData.subject as SubjectType,
            lesson_record_id: finalRecordId,
            assigned_date: formData.lesson_date,
            content: newHomeworkContent.trim(),
          });

        if (homeworkError) {
          console.error('Error inserting homework:', homeworkError);
          // Don't throw - lesson was saved successfully
        }
      }

      toast({
        title: '제출 완료',
        description: '수업 기록이 제출되었습니다',
      });

      setIsDialogOpen(false);
      setEditingLesson(null);
      setCurrentDraftId(null);
      resetForm();
      fetchLessons();
    } catch (error: any) {
      console.error('Error submitting lesson:', error);
      toast({
        title: '오류',
        description: error.message || '수업 기록 제출에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    const lastSubject = getLastSelectedSubject(user?.id);
    setFormData({
      student_id: '',
      class_id: '',
      subject: lastSubject,
      lesson_date: format(new Date(), 'yyyy-MM-dd'),
      lesson_range: '',
      understanding_score: '3',
      homework_status: 'none_assigned',
      learning_issues: [],
      next_lesson_goal: '',
      notes: '',
      lesson_types: ['정규수업'],
      attendance_status: ['정상등원'],
    });
    setCurrentDraftId(null);
    setPreviousHomework(null);
    setHomeworkCheckResult('');
    setHomeworkCheckNotes('');
    setNewHomeworkContent('');
    setTestFormData({
      test_name: '',
      test_result_text: '',
      test_result: 'none',
      test_notes: '',
      test_date: '',
      test_time: '',
      test_assistant: '',
    });
  };

  // Fetch previous homework when student_id and subject change
  const fetchPreviousHomework = useCallback(async (studentId: string, subject: string) => {
    if (!studentId || !subject) {
      setPreviousHomework(null);
      return;
    }

    setLoadingHomework(true);
    try {
      const { data, error } = await supabase
        .from('homework_assignments')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject', subject as SubjectType)
        .order('assigned_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Fetch checker name if checked
        let checkerName = '';
        if (data.checked_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', data.checked_by)
            .maybeSingle();
          checkerName = profile?.full_name || profile?.email || '';
        }
        
        setPreviousHomework({
          ...data,
          checker_name: checkerName,
        } as HomeworkAssignment);
        
        // Pre-fill check fields if already checked
        if (data.check_status === 'checked') {
          setHomeworkCheckResult(data.result || '');
          setHomeworkCheckNotes(data.notes || '');
        } else {
          setHomeworkCheckResult('');
          setHomeworkCheckNotes('');
        }
      } else {
        setPreviousHomework(null);
        setHomeworkCheckResult('');
        setHomeworkCheckNotes('');
      }
    } catch (error) {
      console.error('Error fetching previous homework:', error);
      setPreviousHomework(null);
    } finally {
      setLoadingHomework(false);
    }
  }, []);

  // Effect to fetch homework when student/subject changes
  useEffect(() => {
    if (isDialogOpen && formData.student_id && formData.subject) {
      fetchPreviousHomework(formData.student_id, formData.subject);
    }
  }, [isDialogOpen, formData.student_id, formData.subject, fetchPreviousHomework]);

  // Save homework check
  const handleSaveHomeworkCheck = async () => {
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

      toast({
        title: '확인 완료',
        description: '숙제 확인이 저장되었습니다',
      });

      // Refresh the homework data
      await fetchPreviousHomework(formData.student_id, formData.subject);
    } catch (error: any) {
      console.error('Error saving homework check:', error);
      toast({
        title: '오류',
        description: error.message || '숙제 확인 저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingHomeworkCheck(false);
    }
  };

  // Save test fields (uses RPC for assistant role)
  const handleSaveTestFields = async () => {
    if (!editingLesson?.id || !user) return;

    setIsSavingTestFields(true);
    try {
      // Use RPC for assistants (security definer function)
      if (isAssistant) {
        const { error } = await supabase.rpc('update_lesson_test_fields', {
          _lesson_id: editingLesson.id,
          _test_name: testFormData.test_name || null,
          _test_result_text: testFormData.test_result_text || null,
          _test_result: formData.subject === '영어' ? testFormData.test_result : 'none',
          _test_notes: testFormData.test_notes || null,
          _test_date: testFormData.test_date || null,
          _test_time: testFormData.test_time || null,
          _test_assistant: testFormData.test_assistant || null,
        });

        if (error) throw error;
      } else {
        // Direct update for teachers/admins
        const { error } = await supabase
          .from('lesson_records')
          .update({
            test_name: testFormData.test_name || null,
            test_result_text: testFormData.test_result_text || null,
            test_result: formData.subject === '영어' ? testFormData.test_result : 'none',
            test_notes: testFormData.test_notes || null,
            test_date: testFormData.test_date || null,
            test_time: testFormData.test_time || null,
            test_assistant: testFormData.test_assistant || null,
          })
          .eq('id', editingLesson.id);

        if (error) throw error;
      }

      toast({
        title: '저장 완료',
        description: '테스트 결과가 저장되었습니다',
      });

      fetchLessons();
    } catch (error: any) {
      console.error('Error saving test fields:', error);
      toast({
        title: '오류',
        description: error.message || '테스트 결과 저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTestFields(false);
    }
  };

  const handleOpenNewForm = async () => {
    setEditingLesson(null);
    resetForm();
    setIsDialogOpen(true);
    // Create draft after dialog opens
    setTimeout(async () => {
      if (students.length > 0) {
        await createInitialDraft();
      }
    }, 100);
  };

  const handleEdit = (lesson: LessonRecord) => {
    setEditingLesson(lesson);
    setCurrentDraftId(lesson.id);
    setFormData({
      student_id: lesson.student_id,
      class_id: lesson.class_id || '',
      subject: lesson.subject,
      lesson_date: lesson.lesson_date,
      lesson_range: lesson.lesson_range,
      understanding_score: lesson.understanding_score.toString(),
      homework_status: lesson.homework_status,
      learning_issues: lesson.learning_issues || [],
      next_lesson_goal: lesson.next_lesson_goal || '',
      notes: lesson.notes || '',
      lesson_types: lesson.lesson_types || ['정규수업'],
      attendance_status: lesson.attendance_status || ['정상등원'],
    });
    // Set test form data from lesson
    setTestFormData({
      test_name: lesson.test_name || '',
      test_result_text: lesson.test_result_text || '',
      test_result: lesson.test_result || 'none',
      test_notes: lesson.test_notes || '',
      test_date: lesson.test_date || lesson.lesson_date,
      test_time: lesson.test_time || '',
      test_assistant: lesson.test_assistant || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 수업 기록을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('lesson_records').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: '삭제 완료',
        description: '수업 기록이 삭제되었습니다',
      });
      fetchLessons();
    } catch (error: any) {
      console.error('Error deleting lesson:', error);
      toast({
        title: '오류',
        description: error.message || '수업 기록 삭제에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  const handleDialogClose = async (open: boolean) => {
    if (!open) {
      // If closing and there's an empty draft, delete it
      if (currentDraftId && !formData.student_id && !formData.subject && !formData.lesson_range) {
        try {
          await supabase.from('lesson_records').delete().eq('id', currentDraftId);
        } catch (error) {
          console.error('Error cleaning up empty draft:', error);
        }
      }
      setEditingLesson(null);
      setCurrentDraftId(null);
      resetForm();
      fetchLessons();
    }
    setIsDialogOpen(open);
  };

  const toggleIssue = (issue: string) => {
    setFormData((prev) => ({
      ...prev,
      learning_issues: prev.learning_issues.includes(issue)
        ? prev.learning_issues.filter((i) => i !== issue)
        : [...prev.learning_issues, issue],
    }));
  };

  const filteredLessons = lessons.filter(
    (lesson) =>
      lesson.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lesson.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getHomeworkLabel = (status: string) => {
    return HOMEWORK_STATUS.find((s) => s.value === status)?.label || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">수업 기록</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'admin' ? '전체 수업 기록' : '수업 내용을 기록하고 관리하세요'}
          </p>
        </div>
      </div>

      {/* 오늘 수업 Section - For teachers and admins */}
      {(isTeacher || isAdmin) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              오늘 수업 ({todaySlots.length}개)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaySlots.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">오늘 배정된 수업이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {todaySlots.map((slot) => (
                  <div key={slot.id} className="border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{slot.class_name}</span>
                        <Badge variant="outline">{slot.subject}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground font-medium">
                        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                      </span>
                    </div>
                    {slot.students.length > 0 ? (
                      <div className="space-y-2">
                        {slot.students.map((student) => (
                          <div 
                            key={student.id} 
                            className="flex items-center justify-between p-2 bg-secondary/50 rounded-md cursor-pointer hover:bg-secondary transition-colors"
                            onClick={() => {
                              const prefill = {
                                student_id: student.id,
                                class_id: slot.class_id,
                                subject: slot.subject,
                                lesson_date: format(new Date(), 'yyyy-MM-dd'),
                              };
                              // Pre-fill form and open dialog
                              setFormData(prev => ({
                                ...prev,
                                ...prefill,
                              }));
                              setEditingLesson(null);
                              setCurrentDraftId(null);
                              setIsDialogOpen(true);
                              // Create draft with prefilled values
                              setTimeout(() => createInitialDraft(prefill), 100);
                            }}
                          >
                            <span className="font-medium text-foreground">{student.name}</span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const prefill = {
                                    student_id: student.id,
                                    class_id: slot.class_id,
                                    subject: slot.subject,
                                    lesson_date: format(new Date(), 'yyyy-MM-dd'),
                                  };
                                  // Pre-fill form and open dialog
                                  setFormData(prev => ({
                                    ...prev,
                                    ...prefill,
                                  }));
                                  setEditingLesson(null);
                                  setCurrentDraftId(null);
                                  setIsDialogOpen(true);
                                  // Create draft with prefilled values
                                  setTimeout(() => createInitialDraft(prefill), 100);
                                }}
                              >
                                <FileEdit className="w-3.5 h-3.5 mr-1" />
                                수업기록
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">배정된 학생이 없습니다</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">

        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          {canManage && (
            <DialogTrigger asChild>
              <Button onClick={handleOpenNewForm}>
                <Plus className="w-4 h-4 mr-2" />
                수업 기록 작성
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingLesson ? (
                  editingLesson.submitted ? '수업 기록 수정' : '임시저장 수정'
                ) : (
                  '새 수업 기록'
                )}
                {currentDraftId && !editingLesson?.submitted && (
                  <Badge variant="outline" className="ml-2">
                    <FileEdit className="w-3 h-3 mr-1" />
                    임시저장
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* 지난 숙제 Section - At the very top */}
              {formData.student_id && formData.subject && (
                <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Label className="text-base font-semibold">
                      지난 숙제 ({formData.subject})
                    </Label>
                    {loadingHomework ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      getHomeworkStatusBadge(previousHomework)
                    )}
                  </div>
                  
                  {loadingHomework ? (
                    <div className="text-sm text-muted-foreground">불러오는 중...</div>
                  ) : previousHomework ? (
                    <div className="space-y-3">
                      {/* Homework content - read only */}
                      <div className="p-3 bg-background rounded border">
                        <p className="text-sm whitespace-pre-wrap">{previousHomework.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          배정일: {format(new Date(previousHomework.assigned_date), 'yyyy-MM-dd')}
                        </p>
                      </div>
                      
                      {/* If already checked, show result */}
                      {previousHomework.check_status === 'checked' && (
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span>
                              확인됨: {HOMEWORK_RESULT_OPTIONS.find(o => o.value === previousHomework.result)?.label}
                              {previousHomework.checker_name && ` (${previousHomework.checker_name})`}
                            </span>
                          </div>
                          {previousHomework.checked_at && (
                            <p className="ml-6 text-xs">
                              {format(new Date(previousHomework.checked_at), 'yyyy-MM-dd HH:mm')}
                            </p>
                          )}
                          {previousHomework.notes && (
                            <p className="ml-6 mt-1 text-xs italic">{previousHomework.notes}</p>
                          )}
                        </div>
                      )}
                      
                      {/* Check controls - only if not already checked */}
                      {previousHomework.check_status !== 'checked' && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-sm">숙제 확인</Label>
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
                                  {opt.label}
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
                  ) : (
                    <div className="text-sm text-muted-foreground">지난 숙제 없음</div>
                  )}
                </div>
              )}

              {/* Main form fields - disabled for assistants */}
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isAssistant ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <Label htmlFor="student">학생 *</Label>
                  <Select
                    value={formData.student_id}
                    onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                    disabled={isAssistant}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="학생 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class">클래스 (선택)</Label>
                  <Select
                    value={formData.class_id}
                    onValueChange={(value) => setFormData({ ...formData, class_id: value })}
                    disabled={isAssistant}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="클래스 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} - {c.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 종류 and 출결사항 checkbox groups - disabled for assistants */}
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isAssistant ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">종류</Label>
                  <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                    {LESSON_TYPE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`lesson_type_${opt.value}`}
                          checked={formData.lesson_types.includes(opt.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, lesson_types: [...formData.lesson_types, opt.value] });
                            } else {
                              // Prevent unchecking if it would leave empty array
                              const newTypes = formData.lesson_types.filter(t => t !== opt.value);
                              if (newTypes.length === 0) {
                                setFormData({ ...formData, lesson_types: ['정규수업'] });
                              } else {
                                setFormData({ ...formData, lesson_types: newTypes });
                              }
                            }
                          }}
                          disabled={isAssistant}
                        />
                        <label htmlFor={`lesson_type_${opt.value}`} className="text-sm cursor-pointer">{opt.label}</label>
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
                          id={`attendance_${opt.value}`}
                          checked={formData.attendance_status.includes(opt.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, attendance_status: [...formData.attendance_status, opt.value] });
                            } else {
                              // Prevent unchecking if it would leave empty array
                              const newStatus = formData.attendance_status.filter(s => s !== opt.value);
                              if (newStatus.length === 0) {
                                setFormData({ ...formData, attendance_status: ['정상등원'] });
                              } else {
                                setFormData({ ...formData, attendance_status: newStatus });
                              }
                            }
                          }}
                          disabled={isAssistant}
                        />
                        <label htmlFor={`attendance_${opt.value}`} className="text-sm cursor-pointer">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Instructional fields - disabled for assistants */}
              <div className={`space-y-4 ${isAssistant ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="subject">과목 *</Label>
                    <Select
                      value={formData.subject}
                      onValueChange={(value) => {
                        const newSubject = SUBJECT_VALUES.includes(value as SubjectType)
                          ? (value as SubjectType)
                          : '수학';
                        if (formData.subject && formData.subject !== newSubject && formData.learning_issues.length > 0) {
                          setPendingSubject(newSubject);
                          setShowSubjectChangeDialog(true);
                        } else {
                          setFormData({ ...formData, subject: newSubject, learning_issues: [] });
                          setLastSelectedSubject(user?.id, newSubject);
                        }
                      }}
                      disabled={isAssistant}
                    >
                      <SelectTrigger className="cursor-pointer bg-secondary/50 border-2 border-input hover:border-primary/50 focus:border-primary transition-colors">
                        <SelectValue placeholder="과목 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((subject) => (
                          <SelectItem key={subject.value} value={subject.value}>
                            {subject.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">수학/과학/영어/국어 중 선택</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lesson_date">수업 날짜 *</Label>
                    <Input
                      id="lesson_date"
                      type="date"
                      value={formData.lesson_date}
                      onChange={(e) => setFormData({ ...formData, lesson_date: e.target.value })}
                      required
                      disabled={isAssistant}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lesson_range">수업 범위/내용 *</Label>
                  <Input
                    id="lesson_range"
                    value={formData.lesson_range}
                    onChange={(e) => setFormData({ ...formData, lesson_range: e.target.value })}
                    placeholder="예: 5장 이차방정식 (120-135페이지)"
                    required
                    disabled={isAssistant}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>이해도 (1-5) *</Label>
                    <Select
                      value={formData.understanding_score}
                      onValueChange={(value) => setFormData({ ...formData, understanding_score: value })}
                      disabled={isAssistant}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <SelectItem key={score} value={score.toString()}>
                            {score} - {score === 1 ? '매우 낮음' : score === 2 ? '낮음' : score === 3 ? '보통' : score === 4 ? '높음' : '매우 높음'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>숙제 상태 *</Label>
                    <Select
                      value={formData.homework_status}
                      onValueChange={(value) => setFormData({ ...formData, homework_status: value })}
                      disabled={isAssistant}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HOMEWORK_STATUS.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>학습 이슈 (해당 항목 선택)</Label>
                  <div className="grid grid-cols-2 gap-2 p-4 bg-secondary/50 rounded-lg">
                    {getLearningIssuesForSubject(formData.subject as SubjectType).map((issue) => (
                      <div key={issue} className="flex items-center space-x-2">
                        <Checkbox
                          id={issue}
                          checked={formData.learning_issues.includes(issue)}
                          onCheckedChange={() => toggleIssue(issue)}
                          disabled={isAssistant}
                        />
                        <label htmlFor={issue} className="text-sm cursor-pointer">{issue}</label>
                      </div>
                    ))}
                  </div>
                  {!formData.subject && (
                    <p className="text-xs text-muted-foreground">과목을 먼저 선택하세요</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_goal">다음 수업 목표</Label>
                <Input
                  id="next_goal"
                  value={formData.next_lesson_goal}
                  onChange={(e) => setFormData({ ...formData, next_lesson_goal: e.target.value })}
                  placeholder="다음 수업에서 집중할 내용"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">추가 메모</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="기타 관찰 사항이나 코멘트"
                  rows={3}
                />
              </div>

              {/* TEST-SECTION-MARKER-V3 */}
              <div className="bg-red-500 text-white font-bold text-center py-2 rounded">TEST-SECTION-MARKER-V3</div>
              
              {/* 테스트/결과 Section - Always visible */}
              <div className="space-y-3 p-4 rounded-lg border-2 border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-amber-600" />
                    <Label className="text-base font-semibold">테스트/결과</Label>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="test_name" className="text-sm">테스트 이름</Label>
                      <Input
                        id="test_name"
                        value={testFormData.test_name}
                        onChange={(e) => setTestFormData({ ...testFormData, test_name: e.target.value })}
                        placeholder="예: 1단원 테스트"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="test_date" className="text-sm">테스트 날짜</Label>
                      <Input
                        id="test_date"
                        type="date"
                        value={testFormData.test_date}
                        onChange={(e) => setTestFormData({ ...testFormData, test_date: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="test_time" className="text-sm">테스트 시간</Label>
                      <Select
                        value={testFormData.test_time}
                        onValueChange={(value) => setTestFormData({ ...testFormData, test_time: value })}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="시간 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEST_TIME_OPTIONS.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="test_result_text" className="text-sm">결과 (자유형식)</Label>
                    <Input
                      id="test_result_text"
                      value={testFormData.test_result_text}
                      onChange={(e) => setTestFormData({ ...testFormData, test_result_text: e.target.value })}
                      placeholder="예: 18/25, 10문제 중 7개"
                      className="text-sm"
                    />
                  </div>

                  {/* Pass/Fail - Only for English subject */}
                  {formData.subject === '영어' && (
                    <div className="space-y-1">
                      <Label className="text-sm">통과 여부 (영어 전용)</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={testFormData.test_result === 'pass' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTestFormData({ ...testFormData, test_result: 'pass' })}
                          className="gap-1"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          통과
                        </Button>
                        <Button
                          type="button"
                          variant={testFormData.test_result === 'fail' ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={() => setTestFormData({ ...testFormData, test_result: 'fail' })}
                          className="gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          불통과
                        </Button>
                        <Button
                          type="button"
                          variant={testFormData.test_result === 'none' ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => setTestFormData({ ...testFormData, test_result: 'none' })}
                          className="gap-1"
                        >
                          해당없음
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="test_notes" className="text-sm">테스트 메모</Label>
                      <Textarea
                        id="test_notes"
                        value={testFormData.test_notes}
                        onChange={(e) => setTestFormData({ ...testFormData, test_notes: e.target.value })}
                        placeholder="테스트 관련 메모"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      {/* TEST-ASSISTANT-MARKER-V1 */}
                      <div className="bg-green-500 text-white font-bold text-xs text-center py-1 rounded mb-1">TEST-ASSISTANT-MARKER-V1</div>
                      <Label htmlFor="test_assistant" className="text-sm">테스트 담당자</Label>
                      <Select
                        value={testFormData.test_assistant}
                        onValueChange={(value) => setTestFormData({ ...testFormData, test_assistant: value })}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="담당자 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="다인조교">다인조교</SelectItem>
                          <SelectItem value="유빈조교">유빈조교</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveTestFields}
                    disabled={isSavingTestFields}
                    className="w-full"
                  >
                    {isSavingTestFields && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    테스트 결과 저장
                  </Button>
                </div>

              {/* 이번 숙제 Section - Hidden for assistants */}
              {!isAssistant && (
                <div className="space-y-2 p-4 rounded-lg border-2 border-secondary bg-secondary/30">
                  <Label htmlFor="new_homework" className="text-base font-semibold">이번 숙제</Label>
                  <Textarea
                    id="new_homework"
                    value={newHomeworkContent}
                    onChange={(e) => setNewHomeworkContent(e.target.value)}
                    placeholder="이번 수업에서 배정할 숙제 내용을 입력하세요"
                    rows={2}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    제출 시 숙제가 자동으로 저장됩니다
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  {isAssistant ? '닫기' : '취소'}
                </Button>
                {/* Hide draft/submit buttons for assistants */}
                {!isAssistant && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSaveDraft}
                      disabled={isSavingDraft || isSubmitting}
                    >
                      {isSavingDraft && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <Save className="w-4 h-4 mr-2" />
                      임시저장
                    </Button>
                    <Button type="submit" disabled={isSubmitting || isSavingDraft}>
                      {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <Send className="w-4 h-4 mr-2" />
                      제출
                    </Button>
                  </>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="학생 또는 과목으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredLessons.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? '검색 결과가 없습니다' : '수업 기록이 없습니다. 첫 번째 수업을 기록해보세요!'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead>점수</TableHead>
                    <TableHead>숙제</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-[100px]">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLessons.map((lesson) => (
                    <TableRow key={lesson.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(lesson.lesson_date), 'MM/dd')}
                      </TableCell>
                      <TableCell className="font-medium">{lesson.student_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{lesson.subject}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={lesson.lesson_range}>
                        {lesson.lesson_range}
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={lesson.understanding_score} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getHomeworkLabel(lesson.homework_status)}
                      </TableCell>
                      <TableCell>
                        {lesson.submitted ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                            제출됨
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                            <FileEdit className="w-3 h-3 mr-1" />
                            임시저장
                          </Badge>
                        )}
                      </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(lesson)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(lesson.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Subject Change Confirmation Dialog */}
      <AlertDialog open={showSubjectChangeDialog} onOpenChange={setShowSubjectChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>과목 변경 확인</AlertDialogTitle>
            <AlertDialogDescription>
              과목을 변경하면 선택한 학습이슈가 초기화됩니다. 변경할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPendingSubject(null);
              setShowSubjectChangeDialog(false);
            }}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingSubject) {
                setFormData({ ...formData, subject: pendingSubject, learning_issues: [] });
                setLastSelectedSubject(user?.id, pendingSubject);
              }
              setPendingSubject(null);
              setShowSubjectChangeDialog(false);
            }}>
              변경
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
