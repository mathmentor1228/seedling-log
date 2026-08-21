import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth, isAssistant as checkIsAssistant, isTeacher as checkIsTeacher, isAdmin as checkIsAdmin, canManageLessons } from '@/lib/auth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, subDays } from 'date-fns';
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
import { Plus, Edit2, Trash2, FileEdit, GraduationCap, Calendar, AlertTriangle, Filter, X, ChevronLeft, ChevronRight, Eye, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getTodayKST } from '@/lib/utils';
import { LessonFormContext } from '@/components/lessons/LessonRecordForm';
import { NewLessonEntryDialog } from '@/components/lessons/NewLessonEntryDialog';
import DailyHomeworkChecklist from '@/components/DailyHomeworkChecklist';
import { ExamPrepScheduleManager } from '@/components/ExamPrepScheduleManager';
import { TestTab } from '@/components/lessons/TestTab';
import { SelfStudyTab } from '@/components/lessons/SelfStudyTab';
import { ClinicTab } from '@/components/lessons/ClinicTab';
import { StudentProfileTab } from '@/components/lessons/StudentProfileTab';
import MathQuestionBoard from '@/components/lessons/MathQuestionBoard';
import MathQuestionAnalytics from '@/components/lessons/MathQuestionAnalytics';
import { TeacherLessonRecords } from '@/components/lessons/TeacherLessonRecords';

interface Teacher {
  id: string;
  full_name: string;
}

type SubjectType = '수학' | '과학' | '영어' | '국어';

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
  teacher_id?: string;
  teacher_display_name?: string | null;
  teacher_name?: string;
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

interface TodaySlotStudent {
  id: string;
  name: string;
  previousHomeworkStatus?: 'completed' | 'partial' | 'not_done' | 'none_assigned' | null;
  debugReason?: 'no_prev_record' | 'found' | 'blocked_by_access' | null;
  firstSubject?: boolean;
  followup2wDue?: boolean;
  hyugangRecordId?: string | null;
  hasClinicNote?: boolean;
}

interface TodaySlot {
  id: string;
  class_id: string;
  class_name: string;
  subject: string;
  start_time: string;
  end_time: string;
  students: TodaySlotStudent[];
}

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  scope: 'all' | 'teacher';
  teacher_id: string | null;
}

// Normalize homework status values from DB
function normalizeHomeworkStatus(status: string | null | undefined): TodaySlotStudent['previousHomeworkStatus'] {
  if (!status) return null;
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return 'not_done';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return 'partial';
  if (['completed', '완료'].includes(normalized)) return 'completed';
  if (['none_assigned', '없음', '미배정'].includes(normalized)) return 'none_assigned';
  return null;
}

// Helper function to render roster badges
function getRosterBadges(
  status: TodaySlotStudent['previousHomeworkStatus'],
  debugReason: TodaySlotStudent['debugReason'],
  firstSubject: boolean | undefined,
  followup2wDue: boolean | undefined,
  subject: string,
  isAdmin: boolean,
  onMarkFollowupDone?: () => void
) {
  const badges: React.ReactNode[] = [];
  
  if (status === 'not_done') {
    badges.push(
      <Badge key="hw" className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">
        지난 숙제 미이행
      </Badge>
    );
  } else if (status === 'partial') {
    badges.push(
      <Badge key="hw" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
        지난 숙제 일부완료
      </Badge>
    );
  } else if (firstSubject) {
    badges.push(
      <Badge key="first" variant="outline" className="text-muted-foreground border-muted text-xs">
        첫 {subject} 수업
      </Badge>
    );
  }
  
  if (followup2wDue) {
    badges.push(
      <Badge key="followup" className="bg-purple-500/15 text-purple-600 border-purple-500/30 text-xs">
        첫등록 2주후(연락)
      </Badge>
    );
    if (isAdmin && onMarkFollowupDone) {
      badges.push(
        <Button
          key="followup-btn"
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-500/10"
          onClick={(e) => {
            e.stopPropagation();
            onMarkFollowupDone();
          }}
        >
          연락완료
        </Button>
      );
    }
  }
  
  return badges.length > 0 ? badges : null;
}

// HOMEWORK-STATUS-DISPLAY-FIX-V1: Correct labels (없음 not 미배정)
const HOMEWORK_STATUS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '일부완료' },
  { value: 'not_done', label: '미이행' },
  { value: 'none_assigned', label: '없음' },
];

export default function Lessons() {
  const { user, role, assignedSubject } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [todaySlots, setTodaySlots] = useState<TodaySlot[]>([]);
  const [todayHolidays, setTodayHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [filterStartDate, setFilterStartDate] = useState<string>(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [filterEndDate, setFilterEndDate] = useState<string>(getTodayKST());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterHomeworkStatus, setFilterHomeworkStatus] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>(() => {
    // Assistants with an assigned subject are locked to that subject
    if (role === 'assistant' && assignedSubject) return assignedSubject;
    return 'all';
  });
  // Keep filter in sync once auth resolves
  useEffect(() => {
    if (role === 'assistant' && assignedSubject && filterSubject !== assignedSubject) {
      setFilterSubject(assignedSubject);
    }
  }, [role, assignedSubject]);
  const subjectLocked = role === 'assistant' && !!assignedSubject;
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 50;
  
  const { toast } = useToast();
  
  const [isNewEntryDialogOpen, setIsNewEntryDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  const isAssistant = checkIsAssistant(role);
  const isTeacher = checkIsTeacher(role);
  const isAdmin = checkIsAdmin(role);
  // TEACHER-LESSONS-V1: 강사 전용 조회 UI (관리자·원장·조교는 기존 화면 유지)
  const teacherOnlyLessons = isTeacher && !isAdmin && !isAssistant;
  const canManage = canManageLessons(role);
  
  useEffect(() => {
    fetchStudents();
    fetchClasses();
    if (isAdmin || isAssistant) {
      fetchTeachers();
    }
    if (isTeacher || isAdmin || isAssistant) {
      fetchTodaySlots();
      fetchTodayHolidays();
    }
  }, [user, role]);

  useEffect(() => {
    fetchLessons();
  }, [user, role, filterStartDate, filterEndDate, filterStatus, filterHomeworkStatus, filterSubject, filterTeacherId, searchQuery, currentPage]);

  // Deep link handling
  useEffect(() => {
    const studentId = searchParams.get('student_id');
    const subject = searchParams.get('subject');
    const classId = searchParams.get('class_id');
    const lessonDate = searchParams.get('lesson_date');
    
    if (studentId && !loading && students.length > 0 && classes.length > 0) {
      setSearchParams({});
      
      const validClassId = classId && classes.some(c => c.id === classId) ? classId : '';
      
      if (classId && !validClassId) {
        toast({
          title: '클래스 오류',
          description: '클래스를 찾을 수 없습니다. 직접 선택해주세요.',
          variant: 'destructive',
        });
      }
      
      const finalDate = lessonDate || getTodayKST();
      const finalSubject = subject || '수학';
      
      // Check for existing record
      (async () => {
        const { data: existing } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', studentId)
          .eq('class_id', validClassId || null)
          .eq('lesson_date', finalDate)
          .eq('subject', finalSubject as SubjectType)
          .maybeSingle();
        
        if (existing) {
          // Open existing record
          openModal({
            student_id: studentId,
            class_id: validClassId,
            subject: finalSubject,
            lesson_date: finalDate,
          }, existing.id, 'edit');
        } else {
          // Open new record
          openModal({
            student_id: studentId,
            class_id: validClassId,
            subject: finalSubject,
            lesson_date: finalDate,
          }, null, 'edit');
        }
      })();
    }
  }, [searchParams, loading, students, classes]);

  function openModal(context: LessonFormContext | null, existingId: string | null, mode: 'view' | 'edit', forceNew: boolean = false) {
    if (existingId) {
      navigate(`/lessons/record/${existingId}?mode=${mode}`);
    } else {
      const params = new URLSearchParams();
      if (context?.student_id) params.set('student_id', context.student_id);
      if (context?.class_id) params.set('class_id', context.class_id);
      if (context?.subject) params.set('subject', context.subject);
      if (context?.lesson_date) params.set('lesson_date', context.lesson_date);
      params.set('mode', mode);
      navigate(`/lessons/record/new?${params.toString()}`);
    }
  }

  function handleModalClose(open: boolean) {
    if (!open) fetchLessons();
  }

  function openBatchLessonWindow() {
    const popup = window.open('/lessons/batch', '_blank', 'noopener,noreferrer');

    if (!popup) {
      toast({
        title: '새 창을 열 수 없습니다',
        description: '브라우저 팝업 차단을 해제한 뒤 다시 시도해주세요.',
        variant: 'destructive',
      });
    }
  }

  async function fetchLessons() {
    if (!user) return;

    try {
      let query = supabase
        .from('lesson_records')
        .select(`
          *,
          students:student_id (name)
        `, { count: 'exact' });

      if (filterStartDate) {
        query = query.gte('lesson_date', filterStartDate);
      }
      if (filterEndDate) {
        query = query.lte('lesson_date', filterEndDate);
      }

      if (filterStatus === 'submitted') {
        query = query.eq('submitted', true);
      } else if (filterStatus === 'draft') {
        query = query.eq('submitted', false);
      }

      if (filterHomeworkStatus !== 'all' && filterHomeworkStatus !== 'pending_verification') {
        query = query.eq('homework_status', filterHomeworkStatus);
      }

      if (filterSubject !== 'all') {
        query = query.eq('subject', filterSubject as SubjectType);
      }

      if ((isAdmin || isAssistant) && filterTeacherId !== 'all') {
        query = query.eq('teacher_id', filterTeacherId);
      } else if (role === 'teacher') {
        query = query.eq('teacher_id', user.id);
      }

      query = query.order('lesson_date', { ascending: false }).order('created_at', { ascending: false });

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const teacherIds = [...new Set((data || []).map((l: any) => l.teacher_id).filter(Boolean))];
      let teacherNameMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);
        teacherNameMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || '알 수 없음']));
      }

      let formattedLessons = (data || []).map((l: any) => ({
        ...l,
        student_name: l.students?.name,
        teacher_name: l.teacher_display_name || teacherNameMap[l.teacher_id] || '',
      }));

      if (searchQuery) {
        const lowerSearch = searchQuery.toLowerCase();
        formattedLessons = formattedLessons.filter(lesson =>
          lesson.student_name?.toLowerCase().includes(lowerSearch) ||
          lesson.subject?.toLowerCase().includes(lowerSearch)
        );
      }

      setLessons(formattedLessons);
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error('Error fetching lessons:', error);
      const statusCode = error?.code || error?.status || 'UNKNOWN';
      const message = error?.message || '알 수 없는 오류';
      setLoadError(`수업 기록 로드 실패 (${statusCode}/${message}). 새로고침 후에도 동일하면 관리자에게 문의하세요.`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTeachers() {
    try {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');
      
      const teacherIds = (roleData || []).map(r => r.user_id);
      if (teacherIds.length === 0) {
        setTeachers([]);
        return;
      }
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      
      setTeachers((profiles || []).map(p => ({
        id: p.id,
        full_name: p.full_name || '알 수 없음',
      })));
    } catch (error) {
      console.error('Error fetching teachers:', error);
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

  async function fetchTodaySlots() {
    if (!user) return;

    try {
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      const dayOfWeek = kstDate.getUTCDay();

      // CLASS-ACTIVE-TOGGLE-V1: Include inactive_until filter
      const todayKSTDate = getTodayKST();
      
      let schedulesQuery = supabase
        .from('class_schedules')
        .select(`
          id,
          class_id,
          start_time,
          end_time,
          day_of_week,
          teacher_id,
          inactive_until,
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

      if (checkIsTeacher(role)) {
        schedulesQuery = schedulesQuery.eq('teacher_id', user.id);
      }

      const { data: schedules, error: schedulesError } = await schedulesQuery;

      if (schedulesError) {
        console.error('Error fetching today slots:', schedulesError);
        return;
      }

      // CLASS-ACTIVE-TOGGLE-V1: Filter out schedules that are inactive until today or later
      const activeSchedules = (schedules || []).filter((s: any) => {
        if (!s.inactive_until) return true;
        return s.inactive_until < todayKSTDate;
      });

      const classIds = activeSchedules?.map(s => (s.classes as any)?.id).filter(Boolean) || [];
      const classSubjectMap: Record<string, string> = {};
      (activeSchedules || []).forEach((s: any) => {
        if (s.classes?.id && s.classes?.subject) {
          classSubjectMap[s.classes.id] = s.classes.subject;
        }
      });
      
      let studentsMap: Record<string, TodaySlotStudent[]> = {};
      let allStudentClassPairs: { studentId: string; classId: string; subject: string }[] = [];
      
      if (classIds.length > 0) {
        const { data: classStudents, error: studentsError } = await supabase
          .from('class_students')
          .select(`
            class_id,
            students:student_id!inner (id, name, enrollment_status)
          `)
          .in('class_id', classIds)
          .neq('students.enrollment_status', '퇴원');

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
              allStudentClassPairs.push({ 
                studentId: cs.students.id, 
                classId: cs.class_id,
                subject: classSubjectMap[cs.class_id] || '',
              });
            }
          });
        }
      }

      const today = getTodayKST();
      
      let previousHomeworkMap: Record<string, { 
        status: TodaySlotStudent['previousHomeworkStatus']; 
        debugReason: TodaySlotStudent['debugReason'];
        firstSubject: boolean;
        followup2wDue: boolean;
      }> = {};
      
      let hyugangMap: Record<string, string> = {};
      
      if (allStudentClassPairs.length > 0) {
        const pairs = allStudentClassPairs.map(p => ({
          student_id: p.studentId,
          class_id: p.classId,
          subject: p.subject,
        }));
        
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'get_prev_homework_status_for_roster',
          { _pairs: pairs, _today: today }
        );

        if (!rpcError && rpcResult) {
          (rpcResult as any[]).forEach((row: any) => {
            const key = `${row.student_id}:${row.class_id}`;
            previousHomeworkMap[key] = {
              status: normalizeHomeworkStatus(row.homework_status),
              debugReason: row.debug_reason as TodaySlotStudent['debugReason'],
              firstSubject: row.first_subject === true,
              followup2wDue: row.followup_2w_due === true,
            };
          });
        }
        
        const studentIds = [...new Set(allStudentClassPairs.map(p => p.studentId))];
        const classIdsForHyugang = [...new Set(allStudentClassPairs.map(p => p.classId))];
        
        const { data: hyugangRecords } = await supabase
          .from('lesson_records')
          .select('id, student_id, class_id, lesson_types')
          .eq('lesson_date', today)
          .in('student_id', studentIds)
          .in('class_id', classIdsForHyugang)
          .eq('submitted', true);
        
        if (hyugangRecords) {
          hyugangRecords.forEach((lr: any) => {
            if (lr.lesson_types && lr.lesson_types.includes('휴강')) {
              const key = `${lr.student_id}:${lr.class_id}`;
              hyugangMap[key] = lr.id;
            }
          });
        }
      }

      // Fetch unconfirmed clinic notes for today's students
      const allStudentIds = [...new Set(allStudentClassPairs.map(p => p.studentId))];
      const clinicNoteMap: Record<string, boolean> = {};
      if (allStudentIds.length > 0) {
        const { data: clinicNotes } = await supabase
          .from('clinic_records')
          .select('student_id, teacher_note, clinic_date')
          .in('student_id', allStudentIds)
          .eq('teacher_note_shown', false)
          .not('teacher_note', 'is', null);
        (clinicNotes || []).forEach((c: any) => {
          clinicNoteMap[c.student_id] = true;
        });
      }

      Object.keys(studentsMap).forEach(classId => {
        studentsMap[classId] = studentsMap[classId].map(student => {
          const key = `${student.id}:${classId}`;
          const mapped = previousHomeworkMap[key];
          return {
            ...student,
            previousHomeworkStatus: mapped?.status || null,
            debugReason: mapped?.debugReason || null,
            firstSubject: mapped?.firstSubject || false,
            followup2wDue: mapped?.followup2wDue || false,
            hyugangRecordId: hyugangMap[key] || null,
            hasClinicNote: clinicNoteMap[student.id] || false,
          };
        });
      });

      // Build slots from activeSchedules
      const slots: TodaySlot[] = (activeSchedules || []).map((s: any) => ({
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

  async function fetchTodayHolidays() {
    if (!user) return;
    
    try {
      const today = getTodayKST();
      
      const { data: holidays, error } = await supabase
        .from('holidays')
        .select('*')
        .eq('holiday_date', today);
      
      if (error) {
        console.error('Error fetching holidays:', error);
        return;
      }
      
      const relevantHolidays = (holidays || []).filter((h: any) => 
        h.scope === 'all' || (h.scope === 'teacher' && h.teacher_id === user.id)
      );
      
      setTodayHolidays(relevantHolidays as Holiday[]);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  }

  async function markFollowupDone(studentId: string, subject: string) {
    try {
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('followup_2w_done_subjects')
        .eq('id', studentId)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      const currentDone = (student?.followup_2w_done_subjects as string[]) || [];
      if (currentDone.includes(subject)) return;
      
      const { error: updateError } = await supabase
        .from('students')
        .update({ followup_2w_done_subjects: [...currentDone, subject] })
        .eq('id', studentId);
      
      if (updateError) throw updateError;
      
      toast({
        title: '연락 완료',
        description: `${subject} 과목 첫등록 2주 연락이 완료 처리되었습니다.`,
      });
      
      await fetchTodaySlots();
    } catch (error) {
      console.error('Error marking followup done:', error);
      toast({
        title: '오류',
        description: '연락 완료 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }

  function handleOpenNewForm() {
    
    // PREFILL-FIX-V5: For new record, set forceNewRecord=true to skip DB lookup
    openModal({
      student_id: '',
      class_id: '',
      subject: '수학',
      lesson_date: getTodayKST(),
    }, null, 'edit', true); // forceNewRecord = true
  }

  function handleView(lesson: LessonRecord) {
    openModal({
      student_id: lesson.student_id,
      class_id: lesson.class_id || '',
      subject: lesson.subject,
      lesson_date: lesson.lesson_date,
    }, lesson.id, 'view');
  }

  function handleEdit(lesson: LessonRecord) {
    openModal({
      student_id: lesson.student_id,
      class_id: lesson.class_id || '',
      subject: lesson.subject,
      lesson_date: lesson.lesson_date,
    }, lesson.id, 'edit');
  }

  async function handleDelete(id: string) {
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
  }

  function handleTodaySlotClick(student: TodaySlotStudent, slot: TodaySlot) {
    const prefill: LessonFormContext = {
      student_id: student.id,
      class_id: slot.class_id,
      subject: slot.subject,
      lesson_date: getTodayKST(),
    };
    // PREFILL-FIX-V5: Today slot click should also force new record mode
    openModal(prefill, null, 'edit', true);
  }

  const getHomeworkLabel = (status: string) => {
    return HOMEWORK_STATUS.find((s) => s.value === status)?.label || status;
  };

  const resetFilters = () => {
    setFilterStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    setFilterEndDate(getTodayKST());
    setFilterStatus('all');
    setFilterHomeworkStatus('all');
    setFilterSubject('all');
    setFilterTeacherId('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasActiveFilters = filterStartDate !== format(subDays(new Date(), 7), 'yyyy-MM-dd') ||
    filterEndDate !== getTodayKST() ||
    filterStatus !== 'all' ||
    filterHomeworkStatus !== 'all' ||
    filterSubject !== 'all' ||
    filterTeacherId !== 'all' ||
    searchQuery !== '';

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">수업 관리</h1>
      </div>

      <Tabs defaultValue="lessons" className="w-full">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="overflow-x-auto flex-1 min-w-0">
            <TabsList className="flex-nowrap w-max">
              <TabsTrigger value="lessons">수업 기록</TabsTrigger>
              {(isAdmin || isTeacher) && (
                <TabsTrigger value="exam-prep">내신특강</TabsTrigger>
              )}
              {(isAdmin || isTeacher || isAssistant) && (
                <>
                  <TabsTrigger value="test">🔬 테스트</TabsTrigger>
                  <TabsTrigger value="self_study">📚 자습</TabsTrigger>
                </>
              )}
              {(isAdmin || isTeacher) && (
                <>
                  <TabsTrigger value="student-profile">👤 학생</TabsTrigger>
                  <TabsTrigger value="math-questions">📚 수학질문방</TabsTrigger>
                  <TabsTrigger value="math-analytics">📊 질문분석</TabsTrigger>
                </>
              )}
            </TabsList>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <Button onClick={openBatchLessonWindow} size="sm" variant="outline" className="gap-1.5">
                <Users className="w-4 h-4" />일괄 작성
              </Button>
              <Button onClick={() => setIsNewEntryDialogOpen(true)} size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" />수업기록 생성
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="lessons" className="space-y-6">
      {teacherOnlyLessons ? <TeacherLessonRecords teacherId={user?.id} /> : (<>

      {/* New lesson entry dialog (individual/batch choice) */}
      <NewLessonEntryDialog
        open={isNewEntryDialogOpen}
        onOpenChange={setIsNewEntryDialogOpen}
        onIndividual={handleOpenNewForm}
        onBatchCreate={() => { fetchLessons(); }}
      />



      {/* 오늘 수업 Section */}
      {(isTeacher || isAdmin || isAssistant) && (
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
                            className={`flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors ${student.hyugangRecordId ? 'bg-muted/50 opacity-60' : ''}`}
                            onClick={() => handleTodaySlotClick(student, slot)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{student.name}</span>
                              {student.hyugangRecordId && (
                                <Badge variant="outline" className="text-xs bg-muted">휴강</Badge>
                              )}
                              {getRosterBadges(
                                student.previousHomeworkStatus,
                                student.debugReason,
                                student.firstSubject,
                                student.followup2wDue,
                                slot.subject,
                                isAdmin,
                                () => markFollowupDone(student.id, slot.subject)
                              )}
                              {student.hasClinicNote && (
                                <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">
                                  🏥 클리닉 메모
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTodaySlotClick(student, slot);
                                }}
                              >
                                <FileEdit className="w-3.5 h-3.5 mr-1" />
                                {student.hyugangRecordId ? '휴강 기록 보기' : '수업기록'}
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


      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="w-4 h-4 text-muted-foreground" />
              필터
              {hasActiveFilters && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  !
                </span>
              )}
              <span className="text-xs text-muted-foreground">{showFilters ? '▲' : '▼'}</span>
            </button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground h-7 text-xs">
                <X className="w-3.5 h-3.5 mr-1" />초기화
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">기간</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => { setFilterStartDate(e.target.value); setCurrentPage(1); }}
                      className="text-sm h-9"
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => { setFilterEndDate(e.target.value); setCurrentPage(1); }}
                      className="text-sm h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">상태</Label>
                  <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="submitted">제출됨</SelectItem>
                      <SelectItem value="draft">임시저장</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">숙제 상태</Label>
                  <Select value={filterHomeworkStatus} onValueChange={(v) => { setFilterHomeworkStatus(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="completed">완료</SelectItem>
                      <SelectItem value="partial">부분 완료</SelectItem>
                      <SelectItem value="not_done">미완료</SelectItem>
                      <SelectItem value="none_assigned">미배정</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">과목</Label>
                  <Select value={filterSubject} disabled={subjectLocked} onValueChange={(v) => { setFilterSubject(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="수학">수학</SelectItem>
                      <SelectItem value="과학">과학</SelectItem>
                      <SelectItem value="영어">영어</SelectItem>
                      <SelectItem value="국어">국어</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(isAdmin || isAssistant) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">선생님</Label>
                    <Select value={filterTeacherId} onValueChange={(v) => { setFilterTeacherId(v); setCurrentPage(1); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">검색</Label>
                    <Input
                      placeholder="학생 이름 검색..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="h-9"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        
        <CardContent>
          <div className="text-sm text-muted-foreground mb-3">
            총 {totalCount}개 기록
          </div>
          
          {lessons.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">해당 조건의 수업 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
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
                  {lessons.map((lesson) => (
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
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => handleView(lesson)}
                            title="조회"
                          >
                            <Eye className="w-3.5 h-3.5" />보기
                          </Button>
                          {(isAdmin || (isTeacher && lesson.teacher_id === user?.id)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-primary"
                              onClick={() => handleEdit(lesson)}
                              title="수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />수정
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(lesson.id)}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
          
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentPage} / {totalPages} 페이지
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </>) }
      </TabsContent>

      {(isAdmin || isTeacher || isAssistant) && (
        <TabsContent value="daily-hw" className="mt-4">
          <DailyHomeworkChecklist />
        </TabsContent>
      )}

      {(isAdmin || isTeacher) && (
        <TabsContent value="exam-prep" className="mt-4">
          <ExamPrepScheduleManager />
        </TabsContent>
      )}

      {(isAdmin || isTeacher || isAssistant) && (
        <>
          <TabsContent value="test" className="mt-4">
            <TestTab />
          </TabsContent>
          <TabsContent value="self_study" className="mt-4">
            <SelfStudyTab />
          </TabsContent>
          <TabsContent value="clinic" className="mt-4">
            <ClinicTab />
          </TabsContent>
        </>
      )}

      {(isAdmin || isTeacher) && (
        <TabsContent value="student-profile" className="mt-4">
          <StudentProfileTab />
        </TabsContent>
      )}

      {(isAdmin || isTeacher) && (
        <TabsContent value="math-questions" className="mt-4">
          <MathQuestionBoard />
        </TabsContent>
      )}
      {(isAdmin || isTeacher) && (
        <TabsContent value="math-analytics" className="mt-4">
          <MathQuestionAnalytics />
        </TabsContent>
      )}
      </Tabs>
    </div>
  );
}
