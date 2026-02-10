import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdmin, isTeacher, isAssistant } from '@/lib/auth';
import AssistantDashboard from '@/components/AssistantDashboard';
import AdminStatsSection from '@/components/AdminStatsSection';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { AttentionSummaryBar, type AttentionItem } from '@/components/dashboard/AttentionSummaryBar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import HolidayManagement from '@/components/HolidayManagement';
import { AssistantRequestsWidget } from '@/components/AssistantRequestsWidget';
import { LessonModal } from '@/components/lessons/LessonModal';
import DailyHomeworkManager from '@/components/DailyHomeworkManager';
import { RosterActionModal } from '@/components/RosterActionModal';
import { HomeworkAlertModal } from '@/components/HomeworkAlertModal';
import SubmissionImageCarousel from '@/components/lessons/SubmissionImageCarousel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WeeklyScheduleVerification } from '@/components/WeeklyScheduleVerification';
import { LessonFormContext } from '@/components/lessons/LessonRecordForm';
import { useStudentLatestTests, formatTestLine, formatTestSnippet, formatTestTooltip, LatestTest } from '@/hooks/useStudentLatestTests';
import { 
  Users, 
  BookOpen, 
  ClipboardList, 
  AlertTriangle, 
  TrendingUp, 
  Calendar,
  Clock,
  FileEdit,
  CheckSquare,
  GraduationCap,
  Eye,
  EyeOff,
  UserCheck,
  PenLine,
  TestTube2,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { format, subDays, startOfDay, getDay } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

interface PendingHomework {
  id: string;
  student_id: string;
  student_name: string;
  subject: string;
  content: string;
  assigned_date: string;
  has_photo_submission: boolean;
  submission_image_url: string | null;
  submission_text: string | null;
  submitted_at: string | null;
}

interface TodayAttendanceRecord {
  id: string;
  student_id: string;
  student_name: string;
  teacher_name: string;
  class_name: string;
  subject: string;
  start_time: string;
  attendance_status: string[];
  lesson_date: string;
}

interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  lessonsThisWeek: number;
  avgUnderstanding: number;
  highRiskStudents: number;
}

// (Removed RecentLesson and AtRiskStudent - no longer displayed on admin dashboard)

interface OverdueDraft {
  id: string;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  student_name: string;
  class_id: string | null;
  subject: string;
  lesson_date: string;
  draft_created_at: string;
  overdue_hours: number;
}

interface GroupedOverdueDrafts {
  teacher_name: string;
  teacher_id: string;
  count: number;
  drafts: OverdueDraft[];
}

// TEACHER-OVERDUE-WARN-V1: Teacher's own overdue unsubmitted lessons
interface TeacherOverdueLesson {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string | null;
  class_name: string;
  subject: string;
  lesson_date: string;
  submitted: boolean;
  draft_created_at: string;
  start_time?: string;
}

interface TodaySlotStudent {
  id: string;
  name: string;
  previousHomeworkStatus?: 'completed' | 'partial' | 'not_done' | 'none_assigned' | null;
  debugReason?: 'no_prev_record' | 'found' | 'blocked_by_access' | null;
  firstSubject?: boolean;
  followup2wDue?: boolean;
  hyugangRecordId?: string | null;
  attendanceStatus?: string[];
  lessonRecordId?: string | null;
  // TEACHER-HW-ALERT-V2: Homework check note and previous goal
  homeworkCheckNote?: string | null;
  homeworkCheckLessonId?: string | null;
  prevNextLessonGoal?: string | null;
  // TEST-CONTENT-DISPLAY-V2: Today's test data for inline display (content-first)
  todayTestData?: {
    test_content: string | null;
    test_title: string | null;
    test_result_text: string | null;
    english_pass_fail: string | null;
  } | null;
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

// Normalize homework status values from DB (handles both English and Korean)
function normalizeHomeworkStatus(status: string | null | undefined): TodaySlotStudent['previousHomeworkStatus'] {
  if (!status) return null;
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return 'not_done';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return 'partial';
  if (['completed', '완료'].includes(normalized)) return 'completed';
  if (['none_assigned', '없음', '미배정'].includes(normalized)) return 'none_assigned';
  return null;
}

// HOMEWORK-STATUS-DISPLAY-FIX-V1: Helper to get display label for homework status
function getHomeworkStatusLabel(status: string | null | undefined): string {
  if (!status) return '확인대기';
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return '미이행';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return '일부완료';
  if (['completed', '완료'].includes(normalized)) return '완료';
  if (['none_assigned', '없음'].includes(normalized)) return '없음';
  return '확인대기';
}

// HOMEWORK-STATUS-DISPLAY-FIX-V1: Get badge variant based on status
function getHomeworkStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-muted text-muted-foreground';
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return 'bg-red-500/15 text-red-600 border-red-500/30';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
  if (['completed', '완료'].includes(normalized)) return 'bg-green-500/15 text-green-600 border-green-500/30';
  if (['none_assigned', '없음'].includes(normalized)) return 'bg-muted text-muted-foreground';
  return 'bg-muted text-muted-foreground';
}

// Helper function to render roster badges (homework, first subject, followup)
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
  
  // Priority 1: Homework badges
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
    // Priority 2: First subject badge (only if no homework issues)
    badges.push(
      <Badge key="first" variant="outline" className="text-muted-foreground border-muted text-xs">
        첫 {subject} 수업
      </Badge>
    );
  }
  
  // Additional: 2-week followup badge (can show alongside)
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

// Helper function to render attendance badge with high visibility
// 미등원: red, 지각: amber, 등원: neutral gray
function getAttendanceStatusBadge(attendanceStatus: unknown) {
  const safeStatus: string[] = Array.isArray(attendanceStatus)
    ? (attendanceStatus as string[])
    : [];

  if (safeStatus.length === 0) return null;
  
  // Check for various non-normal statuses
  const hasAbsent = safeStatus.includes('무단결석') || safeStatus.includes('인정결석');
  const hasNoShow = safeStatus.includes('보충불가') || safeStatus.includes('미등원');
  const hasLateOrEarly = safeStatus.includes('지각') || safeStatus.includes('조퇴');
  
  // Filter out '정상등원' and '등원' for display
  const displayStatus = safeStatus.filter(s => s !== '정상등원' && s !== '등원');
  
  // If only normal status, show neutral badge
  if (displayStatus.length === 0) {
    // Check if it's explicitly marked as '등원'
    if (safeStatus.includes('등원')) {
      return (
        <Badge variant="secondary" className="bg-muted/50 text-muted-foreground border-muted text-xs">
          등원
        </Badge>
      );
    }
    // All normal (정상등원) - don't show badge
    return null;
  }
  
  // 미등원 or absent - RED (high visibility)
  if (hasAbsent || hasNoShow) {
    return (
      <Badge className="bg-red-500 text-white border-red-600 text-xs font-medium shadow-sm">
        {displayStatus.join(', ')}
      </Badge>
    );
  }
  
  // 지각 or early leave - AMBER
  if (hasLateOrEarly) {
    return (
      <Badge className="bg-amber-500 text-white border-amber-600 text-xs font-medium shadow-sm">
        {displayStatus.join(', ')}
      </Badge>
    );
  }
  
  // Other status - show as-is
  return (
    <Badge variant="outline" className="text-xs">
      {displayStatus.join(', ')}
    </Badge>
  );
}

export default function Dashboard() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // DASH-LATEST-TEST-TOGGLE-V1: Latest test toggle hook - must be called before any early returns
  const latestTests = useStudentLatestTests();

  // Assistants get their own dedicated dashboard
  if (isAssistant(role)) {
    return <AssistantDashboard />;
  }

  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalClasses: 0,
    lessonsThisWeek: 0,
    avgUnderstanding: 0,
    highRiskStudents: 0,
  });
  // (Removed recentLessons and atRiskStudents state - no longer displayed)
  const [todaySlots, setTodaySlots] = useState<TodaySlot[]>([]);
  const [overdueDrafts, setOverdueDrafts] = useState<GroupedOverdueDrafts[]>([]);
  const [pendingHomework, setPendingHomework] = useState<PendingHomework[]>([]);
  const [todayHolidays, setTodayHolidays] = useState<Holiday[]>([]);
  const [allTodayHolidays, setAllTodayHolidays] = useState<Holiday[]>([]); // All holidays for today (for admin/assistant)
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ignoreHoliday, setIgnoreHoliday] = useState(false); // Admin toggle to show roster despite holiday
  
  // TEACHER-OVERDUE-WARN-V1: Teacher's own overdue lessons
  const [teacherOverdueLessons, setTeacherOverdueLessons] = useState<TeacherOverdueLesson[]>([]);
  const [hasShownOverdueToast, setHasShownOverdueToast] = useState(false);

  // Admin roster data (grouped by teacher)
  const [adminRosterData, setAdminRosterData] = useState<{
    teachers: { teacher_id: string; teacher_name: string }[];
    roster_rows: {
      teacher_id: string;
      teacher_name: string;
      student_id: string;
      student_name: string;
      class_id: string;
      class_name: string;
      subject: string;
      start_time: string;
      end_time: string;
    }[];
  } | null>(null);

  // Admin lesson modal state
  const [adminLessonModalOpen, setAdminLessonModalOpen] = useState(false);
  const [adminLessonModalContext, setAdminLessonModalContext] = useState<LessonFormContext | null>(null);
  const [adminLessonModalRecordId, setAdminLessonModalRecordId] = useState<string | null>(null);
  // PREFILL-FIX-V5: Track if opening for new record creation
  const [adminLessonModalForceNew, setAdminLessonModalForceNew] = useState(false);

  // Roster action modal state (for homework quick actions)
  const [rosterActionModalOpen, setRosterActionModalOpen] = useState(false);
  const [rosterActionContext, setRosterActionContext] = useState<any>(null);

  // Lesson status map for admin roster badges
  // HOMEWORK-STATUS-DISPLAY-FIX-V1: Include homeworkStatus in type
  // NEXT-HW-BADGE-V1: Include hasNextHomework
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, { submitted: boolean; recordId: string | null; homeworkStatus: string | null; hasNextHomework: boolean; hasPhotoSubmission: boolean; photoData?: { url: string; text: string | null; at: string | null; studentName: string } }>>({});

  // TEACHER-HW-ALERT-V2: Homework alert modal state
  const [hwAlertModalOpen, setHwAlertModalOpen] = useState(false);
  const [hwAlertContext, setHwAlertContext] = useState<{
    studentName: string;
    subject: string;
    lessonId: string;
    noteText: string;
    studentId: string;
  } | null>(null);
  
  // TEACHER-HW-ALERT-V2: Map for acknowledged alerts to hide badges
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Set<string>>(new Set());
  
  // Collapsible section states
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [homeworkOpen, setHomeworkOpen] = useState(true);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [adminOverdueOpen, setAdminOverdueOpen] = useState(true);
  
  // PHOTO-VIEW-V1: Photo viewer state for pending homework
  const [photoViewHw, setPhotoViewHw] = useState<PendingHomework | null>(null);
  
  // ADMIN-ROSTER-DEBUG-V1: Fallback today's lesson records (grouped by teacher)
  const [todayLessonRecordsFallback, setTodayLessonRecordsFallback] = useState<{
    teacher_id: string;
    teacher_name: string;
    records: {
      id: string;
      student_id: string;
      student_name: string;
      class_id: string | null;
      class_name: string;
      subject: string;
      submitted: boolean;
    }[];
  }[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) return;

      try {
        const weekAgo = subDays(new Date(), 7);
        // Use 7 days for assistants, 10 days for others
        const homeworkDaysAgo = isAssistant(role) ? subDays(new Date(), 7) : subDays(new Date(), 10);

        // Admin and Teacher can view dashboard stats (not assistant)
        if (!isAssistant(role)) {
          // Fetch students count
          const { count: studentsCount } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true });

          // Fetch classes count
          const { count: classesCount } = await supabase
            .from('classes')
            .select('*', { count: 'exact', head: true });

          // Fetch lessons this week
          let lessonsQuery = supabase
            .from('lesson_records')
            .select('*', { count: 'exact' })
            .gte('lesson_date', format(weekAgo, 'yyyy-MM-dd'));

          // Teachers only see their own lessons
          if (isTeacher(role)) {
            lessonsQuery = lessonsQuery.eq('teacher_id', user.id);
          }

          const { count: lessonsCount, data: lessonsData } = await lessonsQuery;

          // Calculate average understanding
          const avgScore = lessonsData?.length 
            ? lessonsData.reduce((sum, l) => sum + l.understanding_score, 0) / lessonsData.length
            : 0;

          // Fetch weekly reports for high-risk student count only
          const { data: reportsData } = await supabase
            .from('weekly_reports')
            .select('risk_level')
            .in('risk_level', ['high'])
            .limit(20);

          const highRisk = reportsData?.length || 0;

          setStats({
            totalStudents: studentsCount || 0,
            totalClasses: classesCount || 0,
            lessonsThisWeek: lessonsCount || 0,
            avgUnderstanding: Math.round(avgScore * 10) / 10,
            highRiskStudents: highRisk,
          });

          // Fetch overdue drafts for admin only
          if (isAdmin(role)) {
            await fetchOverdueDrafts();
            await fetchTodayAttendance();
            await fetchAdminRosterData();
          }
          
          // TEACHER-OVERDUE-WARN-V1: Fetch teacher's own overdue lessons
          if (isTeacher(role)) {
            await fetchTeacherOverdueLessons();
          }
        }

        // Fetch today's slots for teacher, admin, or assistant
        if (isTeacher(role) || isAdmin(role) || isAssistant(role)) {
          await fetchTodaySlots();
          await fetchTodayHolidays();
        }

        // Fetch pending homework (unchecked)
        // RLS handles filtering: admin/assistant see all, teacher sees only their students
        const { data: homeworkData } = await supabase
          .from('homework_assignments')
          .select(`
            id,
            student_id,
            subject,
            content,
            assigned_date,
            submitted_at,
            submission_image_url,
            submission_text,
            students:student_id (name)
          `)
          .eq('check_status', 'unchecked')
          .gte('assigned_date', format(homeworkDaysAgo, 'yyyy-MM-dd'))
          .order('assigned_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(20);

        setPendingHomework(
          (homeworkData || []).map((h: any) => ({
            id: h.id,
            student_id: h.student_id,
            student_name: h.students?.name || 'Unknown',
            subject: h.subject,
            content: h.content,
            assigned_date: h.assigned_date,
            has_photo_submission: !!(h.submitted_at && h.submission_image_url),
            submission_image_url: h.submission_image_url || null,
            submission_text: h.submission_text || null,
            submitted_at: h.submitted_at || null,
          }))
        );
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user, role]);

  // Refetch roster data when window regains focus (user returns from /lessons page)
  useEffect(() => {
    const handleFocus = () => {
      if (user && (isTeacher(role) || isAdmin(role))) {
        console.log('[Dashboard] Window focused - refetching attendance data');
        fetchTodaySlots();
        if (isAdmin(role)) {
          fetchTodayAttendance();
        }
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, role]);
  async function fetchOverdueDrafts() {
    try {
      // Query the view directly
      const { data, error } = await supabase
        .from('overdue_lesson_drafts')
        .select('*')
        .order('overdue_hours', { ascending: false });

      if (error) {
        console.error('Error fetching overdue drafts:', error);
        return;
      }

      // Group by teacher
      const grouped: Record<string, GroupedOverdueDrafts> = {};
      
      (data || []).forEach((draft: any) => {
        const teacherId = draft.teacher_id;
        const teacherName = draft.teacher_name || '알 수 없음';
        
        if (!grouped[teacherId]) {
          grouped[teacherId] = {
            teacher_id: teacherId,
            teacher_name: teacherName,
            count: 0,
            drafts: [],
          };
        }
        
        grouped[teacherId].count++;
        grouped[teacherId].drafts.push({
          id: draft.id,
          teacher_id: draft.teacher_id,
          teacher_name: teacherName,
          student_id: draft.student_id,
          student_name: draft.student_name || '알 수 없음',
          class_id: draft.class_id || null,
          subject: draft.subject || '-',
          lesson_date: draft.lesson_date,
          draft_created_at: draft.draft_created_at,
          overdue_hours: Math.round(Number(draft.overdue_hours) || 0),
        });
      });

      setOverdueDrafts(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching overdue drafts:', error);
      toast({
        title: '데이터 로드 오류',
        description: '미제출 기록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }

  // TEACHER-OVERDUE-WARN-V1: Fetch teacher's own overdue lessons
  async function fetchTeacherOverdueLessons() {
    if (!user) return;
    
    try {
      const today = getTodayKST();
      const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      
      // Fetch lesson records that are not submitted and lesson_date < today (last 7 days)
      const { data: lessons, error } = await supabase
        .from('lesson_records')
        .select(`
          id,
          student_id,
          class_id,
          subject,
          lesson_date,
          submitted,
          draft_created_at,
          students:student_id (name),
          classes:class_id (name)
        `)
        .eq('teacher_id', user.id)
        .eq('submitted', false)
        .lt('lesson_date', today)
        .gte('lesson_date', sevenDaysAgo)
        .order('lesson_date', { ascending: false });
      
      if (error) {
        console.error('Error fetching teacher overdue lessons:', error);
        return;
      }
      
      // Get class schedules for start times
      const classIds = [...new Set((lessons || []).map(l => l.class_id).filter(Boolean))] as string[];
      let scheduleMap: Record<string, string> = {};
      
      if (classIds.length > 0) {
        const { data: schedules } = await supabase
          .from('class_schedules')
          .select('class_id, start_time, day_of_week')
          .in('class_id', classIds)
          .eq('is_active', true);
        
        (schedules || []).forEach((s: any) => {
          // Use first schedule found for each class
          if (!scheduleMap[s.class_id]) {
            scheduleMap[s.class_id] = s.start_time?.slice(0, 5) || '';
          }
        });
      }
      
      const overdueLessons: TeacherOverdueLesson[] = (lessons || []).map((l: any) => ({
        id: l.id,
        student_id: l.student_id,
        student_name: l.students?.name || '알 수 없음',
        class_id: l.class_id,
        class_name: l.classes?.name || '-',
        subject: l.subject,
        lesson_date: l.lesson_date,
        submitted: l.submitted,
        draft_created_at: l.draft_created_at,
        start_time: l.class_id ? scheduleMap[l.class_id] : undefined,
      }));
      
      setTeacherOverdueLessons(overdueLessons);
      
      // Show toast on first load if there are overdue lessons
      if (overdueLessons.length > 0 && !hasShownOverdueToast) {
        toast({
          title: '미제출 수업일지',
          description: `미제출 수업일지 ${overdueLessons.length}건이 있습니다.`,
          variant: 'destructive',
        });
        setHasShownOverdueToast(true);
      }
    } catch (error) {
      console.error('Error fetching teacher overdue lessons:', error);
    }
  }

  // ADMIN-ROSTER-DEBUG-V1: Fetch admin roster data grouped by teacher (uses RPC)
  async function fetchAdminRosterData() {
    if (!user) return;
    
    try {
      const today = getTodayKST();
      
      // Get day of week for debugging
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      const dayOfWeek = kstDate.getUTCDay();
      
      const { data: rpcData, error } = await supabase.rpc('get_teacher_roster_sheet', { _date: today });
      
      if (error) {
        console.error('Error fetching admin roster data:', error);
        return;
      }
      
      // The RPC returns an array of rows, transform into expected structure
      const rosterRows: any[] = Array.isArray(rpcData) ? rpcData : [];
      
      // Build teachers array from unique teacher_id/teacher_name pairs
      const teacherMap = new Map<string, { teacher_id: string; teacher_name: string }>();
      rosterRows.forEach((row: any) => {
        if (row.teacher_id && !teacherMap.has(row.teacher_id)) {
          teacherMap.set(row.teacher_id, {
            teacher_id: row.teacher_id,
            teacher_name: row.teacher_name || '알 수 없음',
          });
        }
      });
      const teachers = Array.from(teacherMap.values());
      
      // ADMIN-ROSTER-DEBUG-V1: Fetch debug counts
      const { count: scheduledSlotsCount } = await supabase
        .from('class_schedules')
        .select('*', { count: 'exact', head: true })
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true);
      
      const { count: todayLessonRecordsCount } = await supabase
        .from('lesson_records')
        .select('*', { count: 'exact', head: true })
        .eq('lesson_date', today);
      
      console.log(`[Dashboard] ADMIN-ROSTER-DEBUG-V1: today=${today}, dayOfWeek=${dayOfWeek}, scheduledSlots=${scheduledSlotsCount}, rosterStudents=${rosterRows.length}, todayLessonRecords=${todayLessonRecordsCount}`);
      
      setAdminRosterData({
        teachers,
        roster_rows: rosterRows,
        _debug: {
          today,
          dayOfWeek,
          scheduledSlots: scheduledSlotsCount || 0,
          rosterStudents: rosterRows.length,
          todayLessonRecords: todayLessonRecordsCount || 0,
        },
      } as any);
      
      // Fetch lesson status for all student/class pairs
      if (rosterRows.length > 0) {
        const studentIds = [...new Set(rosterRows.map((r: any) => r.student_id))] as string[];
        const classIds = [...new Set(rosterRows.map((r: any) => r.class_id))] as string[];
        
        // HOMEWORK-STATUS-DISPLAY-FIX-V1: Include homework_status in select
        const { data: lessonRecords } = await supabase
          .from('lesson_records')
          .select('id, student_id, class_id, subject, submitted, homework_status')
          .eq('lesson_date', today)
          .in('student_id', studentIds)
          .in('class_id', classIds);
        
        const recordIds = (lessonRecords || []).map((lr: any) => lr.id).filter(Boolean);
        
        // NEXT-HW-BADGE-V1: Fetch homework_assignments for today's lesson records
        let hwAssignmentSet = new Set<string>();
        // PHOTO-SUBMISSION-BADGE-V1: Track which students have photo submissions for pending homework
        let photoSubmissionSet = new Set<string>();
        if (recordIds.length > 0) {
          const { data: hwAssignments } = await supabase
            .from('homework_assignments')
            .select('lesson_record_id, student_id, submitted_at, submission_image_url')
            .in('lesson_record_id', recordIds)
            .not('content', 'eq', '');
          
          hwAssignmentSet = new Set((hwAssignments || []).map((ha: any) => ha.lesson_record_id));
        }

        // Also check unchecked homework for photo submissions (for all roster students)
        let photoDataMap: Record<string, { url: string; text: string | null; at: string | null }> = {};
        if (studentIds.length > 0) {
          const { data: pendingHw } = await supabase
            .from('homework_assignments')
            .select('student_id, submitted_at, submission_image_url, submission_text')
            .in('student_id', studentIds)
            .eq('check_status', 'unchecked')
            .not('submitted_at', 'is', null)
            .not('submission_image_url', 'is', null);
          
          (pendingHw || []).forEach((hw: any) => {
            if (hw.submitted_at && hw.submission_image_url) {
              photoSubmissionSet.add(hw.student_id);
              photoDataMap[hw.student_id] = { url: hw.submission_image_url, text: hw.submission_text, at: hw.submitted_at };
            }
          });
        }
        
        // Build a student name lookup from roster rows
        const studentNameLookup: Record<string, string> = {};
        (adminRosterData?.roster_rows || []).forEach((r: any) => { studentNameLookup[r.student_id] = r.student_name; });

        const statusMap: Record<string, { submitted: boolean; recordId: string | null; homeworkStatus: string | null; hasNextHomework: boolean; hasPhotoSubmission: boolean; photoData?: { url: string; text: string | null; at: string | null; studentName: string } }> = {};
        (lessonRecords || []).forEach((lr: any) => {
          const key = `${lr.student_id}:${lr.class_id}:${lr.subject}`;
          const pd = photoDataMap[lr.student_id];
          statusMap[key] = { 
            submitted: lr.submitted, recordId: lr.id, homeworkStatus: lr.homework_status || null, hasNextHomework: hwAssignmentSet.has(lr.id), hasPhotoSubmission: photoSubmissionSet.has(lr.student_id),
            ...(pd ? { photoData: { ...pd, studentName: studentNameLookup[lr.student_id] || '학생' } } : {})
          };
        });
        
        setLessonStatusMap(statusMap);
      }
      
      // ADMIN-ROSTER-DEBUG-V1: Fetch fallback lesson records when roster is empty
      if (rosterRows.length === 0) {
        await fetchTodayLessonRecordsFallback();
      }
      
      console.log('[Dashboard] fetchAdminRosterData complete - teachers:', teachers.length, 'rows:', rosterRows.length);
    } catch (error) {
      console.error('Error fetching admin roster data:', error);
    }
  }
  
  // ADMIN-ROSTER-DEBUG-V1: Fetch today's lesson records as fallback (when roster is empty)
  async function fetchTodayLessonRecordsFallback() {
    try {
      const today = getTodayKST();
      
      const { data: lessonRecords, error } = await supabase
        .from('lesson_records')
        .select(`
          id,
          student_id,
          teacher_id,
          class_id,
          subject,
          submitted,
          students:student_id (name),
          classes:class_id (name)
        `)
        .eq('lesson_date', today)
        .order('teacher_id', { ascending: true });
      
      if (error) {
        console.error('Error fetching today lesson records fallback:', error);
        return;
      }
      
      // Get teacher names
      const teacherIds = [...new Set((lessonRecords || []).map((r: any) => r.teacher_id).filter(Boolean))];
      let teacherNameMap: Record<string, string> = {};
      
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);
        
        (profiles || []).forEach((p: any) => {
          teacherNameMap[p.id] = p.full_name || '알 수 없음';
        });
      }
      
      // Group by teacher
      const grouped: Record<string, {
        teacher_id: string;
        teacher_name: string;
        records: any[];
      }> = {};
      
      (lessonRecords || []).forEach((lr: any) => {
        const teacherId = lr.teacher_id || 'unknown';
        if (!grouped[teacherId]) {
          grouped[teacherId] = {
            teacher_id: teacherId,
            teacher_name: teacherNameMap[teacherId] || '알 수 없음',
            records: [],
          };
        }
        grouped[teacherId].records.push({
          id: lr.id,
          student_id: lr.student_id,
          student_name: lr.students?.name || '알 수 없음',
          class_id: lr.class_id,
          class_name: lr.classes?.name || '-',
          subject: lr.subject,
          submitted: lr.submitted,
        });
      });
      
      setTodayLessonRecordsFallback(Object.values(grouped));
      console.log('[Dashboard] fetchTodayLessonRecordsFallback complete - groups:', Object.keys(grouped).length);
    } catch (error) {
      console.error('Error fetching today lesson records fallback:', error);
    }
  }

  // Fetch today's attendance records (admin only)
  async function fetchTodayAttendance() {
    if (!user) return;
    
    try {
      const today = getTodayKST();
      
      // Fetch lesson records for today with attendance status
      const { data: lessonRecords, error } = await supabase
        .from('lesson_records')
        .select(`
          id,
          student_id,
          class_id,
          subject,
          attendance_status,
          lesson_date,
          students:student_id (name),
          classes:class_id (name, teacher_id)
        `)
        .eq('lesson_date', today)
        .eq('submitted', true);
      
      if (error) {
        console.error('Error fetching today attendance:', error);
        return;
      }

      // Get teacher names for the classes
      const teacherIds = [...new Set((lessonRecords || [])
        .map((lr: any) => lr.classes?.teacher_id)
        .filter(Boolean))];
      
      let teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);
        
        (profiles || []).forEach((p: any) => {
          teacherMap[p.id] = p.full_name || '알 수 없음';
        });
      }

      // Get class schedules for start times
      const classIds = [...new Set((lessonRecords || [])
        .map((lr: any) => lr.class_id)
        .filter(Boolean))];
      
      const kstDate = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const dayOfWeek = new Date(kstDate.getTime() + kstOffset).getUTCDay();
      
      let scheduleMap: Record<string, string> = {};
      if (classIds.length > 0) {
        const { data: schedules } = await supabase
          .from('class_schedules')
          .select('class_id, start_time')
          .in('class_id', classIds)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true);
        
        (schedules || []).forEach((s: any) => {
          scheduleMap[s.class_id] = s.start_time?.slice(0, 5) || '';
        });
      }

      // Build attendance records
      const records: TodayAttendanceRecord[] = (lessonRecords || []).map((lr: any) => ({
        id: lr.id,
        student_id: lr.student_id,
        student_name: lr.students?.name || '알 수 없음',
        teacher_name: teacherMap[lr.classes?.teacher_id] || '알 수 없음',
        class_name: lr.classes?.name || '-',
        subject: lr.subject,
        start_time: scheduleMap[lr.class_id] || '-',
        attendance_status: lr.attendance_status || ['정상등원'],
        lesson_date: lr.lesson_date,
      }));

      // Sort by priority: 무단결석/인정결석 > 지각/조퇴 > 정상등원
      const getStatusPriority = (status: string[]) => {
        if (status.includes('무단결석') || status.includes('인정결석')) return 0;
        if (status.includes('지각') || status.includes('조퇴')) return 1;
        return 2;
      };

      records.sort((a, b) => {
        const priorityA = getStatusPriority(a.attendance_status);
        const priorityB = getStatusPriority(b.attendance_status);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

      console.log('[Dashboard] fetchTodayAttendance complete - attendanceUpdated=true, records:', records.length);
      setTodayAttendance(records);
    } catch (error) {
      console.error('Error fetching today attendance:', error);
    }
  }

  async function fetchTodaySlots() {
    if (!user) {
      console.error('fetchTodaySlots: No user found');
      return;
    }

    try {
      // Get today's day of week (0=Sunday, 1=Monday, etc.) using KST
      const now = new Date();
      // Convert to KST by adding 9 hours offset
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      const dayOfWeek = kstDate.getUTCDay(); // Use UTC day since we added KST offset
      
      console.log('fetchTodaySlots: user.id =', user.id, ', dayOfWeek (KST) =', dayOfWeek);

      // CLASS-ACTIVE-TOGGLE-V1: Include inactive_until filter
      const todayKSTDate = getTodayKST();
      
      const { data: schedules, error: schedulesError } = await supabase
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
        .eq('teacher_id', user.id)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time', { ascending: true });

      // Filter out schedules that are inactive until today or later
      const activeSchedules = (schedules || []).filter((s: any) => {
        if (!s.inactive_until) return true;
        return s.inactive_until < todayKSTDate;
      });

      if (schedulesError) {
        console.error('Error fetching today slots:', schedulesError);
        toast({
          title: '데이터 로드 오류',
          description: '오늘 수업 정보를 불러오는 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        return;
      }

      console.log('fetchTodaySlots: schedules returned =', activeSchedules?.length || 0, 'active of', schedules?.length || 0, 'total');

      // Get students for each class - also build a map of class_id -> subject for RPC
      const classIds = activeSchedules?.map(s => (s.classes as any)?.id).filter(Boolean) || [];
      const classSubjectMap: Record<string, string> = {};
      (activeSchedules || []).forEach((s: any) => {
        if (s.classes?.id && s.classes?.subject) {
          classSubjectMap[s.classes.id] = s.classes.subject;
        }
      });
      
      let studentsMap: Record<string, TodaySlotStudent[]> = {};
      let allStudentClassPairs: { studentId: string; classId: string; subject: string }[] = [];
      let totalStudentsCount = 0;
      
      if (classIds.length > 0) {
        const { data: classStudents, error: studentsError } = await supabase
          .from('class_students')
          .select(`
            class_id,
            students:student_id (id, name)
          `)
          .in('class_id', classIds);

        if (studentsError) {
          console.error('Error fetching class students:', studentsError);
          toast({
            title: '데이터 로드 오류',
            description: '학생 목록을 불러오는 중 오류가 발생했습니다.',
            variant: 'destructive',
          });
        } else {
          console.log('fetchTodaySlots: classStudents returned =', classStudents?.length || 0, classStudents);
          // Group students by class_id and collect pairs for batch lookup
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
              totalStudentsCount++;
            }
          });
        }
      }

      // Batch fetch previous homework status via RPC
      const today = getTodayKST();
      
      // key: `${studentId}:${classId}` -> { status, debugReason, firstSubject, followup2wDue }
      let previousHomeworkMap: Record<string, { 
        status: TodaySlotStudent['previousHomeworkStatus']; 
        debugReason: TodaySlotStudent['debugReason'];
        firstSubject: boolean;
        followup2wDue: boolean;
      }> = {};
      
      // key: `${studentId}:${classId}` -> { hyugangRecordId, attendanceStatus, lessonRecordId, homeworkCheckNote, homeworkCheckLessonId, todayTestData }
      let lessonRecordMap: Record<string, { 
        hyugangRecordId: string | null; 
        attendanceStatus: string[]; 
        lessonRecordId: string | null;
        homeworkCheckNote: string | null;
        homeworkCheckLessonId: string | null;
        // TEST-CONTENT-DISPLAY-V2
        subject?: string;
        todayTestData?: {
          test_content: string | null;
          test_title: string | null;
          test_result_text: string | null;
          english_pass_fail: string | null;
        } | null;
      }> = {};
      
      // TEACHER-HW-ALERT-V2: Fetch recent lesson record with next_lesson_goal for "지난 목표"
      let prevGoalMap: Record<string, string | null> = {};
      
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
        
        // Fetch lesson records for today (휴강, attendance_status)
        const studentIds = [...new Set(allStudentClassPairs.map(p => p.studentId))];
        const classIdsForRecords = [...new Set(allStudentClassPairs.map(p => p.classId))];
        
        // TEST-CONTENT-DISPLAY-V2: Include test_content as primary field
        const { data: todayRecords } = await supabase
          .from('lesson_records')
          .select('id, student_id, class_id, subject, lesson_types, attendance_status, homework_check_note, test_content, test_title, test_result_text, english_pass_fail')
          .eq('lesson_date', today)
          .in('student_id', studentIds)
          .in('class_id', classIdsForRecords);
        
        if (todayRecords) {
          todayRecords.forEach((lr: any) => {
            const key = `${lr.student_id}:${lr.class_id}`;
            const isHyugang = lr.lesson_types && lr.lesson_types.includes('휴강');
            // TEST-CONTENT-DISPLAY-V2: Check for test data (content-first)
            const hasTestData = (lr.test_content && lr.test_content.trim() !== '') || (lr.test_title && lr.test_title.trim() !== '') || (lr.test_result_text && lr.test_result_text.trim() !== '');
            lessonRecordMap[key] = {
              hyugangRecordId: isHyugang ? lr.id : null,
              attendanceStatus: lr.attendance_status || ['정상등원'],
              lessonRecordId: lr.id,
              homeworkCheckNote: lr.homework_check_note || null,
              homeworkCheckLessonId: lr.homework_check_note ? lr.id : null,
              // TEST-CONTENT-DISPLAY-V2
              subject: lr.subject,
              todayTestData: hasTestData ? {
                test_content: lr.test_content || null,
                test_title: lr.test_title || null,
                test_result_text: lr.test_result_text || null,
                english_pass_fail: lr.english_pass_fail || null,
              } : null,
            };
          });
        }
        
        // TEACHER-HW-ALERT-V2: Fetch recent lesson records with next_lesson_goal for "지난 목표"
        // For each student/subject pair, find the most recent submitted lesson
        const subjects = [...new Set(allStudentClassPairs.map(p => p.subject))].filter(Boolean);
        
        if (studentIds.length > 0 && subjects.length > 0) {
          const { data: prevLessons } = await supabase
            .from('lesson_records')
            .select('student_id, subject, next_lesson_goal, lesson_date')
            .lt('lesson_date', today)
            .eq('submitted', true)
            .in('student_id', studentIds)
            .in('subject', subjects as any)
            .order('lesson_date', { ascending: false });
          
          if (prevLessons) {
            // Group by student_id:subject and take the first (most recent)
            const seen = new Set<string>();
            prevLessons.forEach((pl: any) => {
              const key = `${pl.student_id}:${pl.subject}`;
              if (!seen.has(key) && pl.next_lesson_goal) {
                prevGoalMap[key] = pl.next_lesson_goal;
                seen.add(key);
              }
            });
          }
        }
        
        // TEACHER-HW-ALERT-V2: Fetch acknowledged alerts to hide badges
        if (user && isTeacher(role)) {
          const { data: acks } = await supabase
            .from('homework_alert_ack')
            .select('source_lesson_id')
            .eq('teacher_id', user.id);
          
          if (acks) {
            const ackSet = new Set(acks.map(a => a.source_lesson_id));
            setAcknowledgedAlerts(ackSet);
          }
        }
      }

      // Update studentsMap with previousHomeworkStatus, debugReason, firstSubject, followup2wDue, hyugangRecordId, attendanceStatus, homeworkCheckNote, prevNextLessonGoal
      Object.keys(studentsMap).forEach(classId => {
        const subject = classSubjectMap[classId] || '';
        studentsMap[classId] = studentsMap[classId].map(student => {
          const key = `${student.id}:${classId}`;
          const mapped = previousHomeworkMap[key];
          const recordInfo = lessonRecordMap[key];
          const goalKey = `${student.id}:${subject}`;
          return {
            ...student,
            previousHomeworkStatus: mapped?.status || null,
            debugReason: mapped?.debugReason || null,
            firstSubject: mapped?.firstSubject || false,
            followup2wDue: mapped?.followup2wDue || false,
            hyugangRecordId: recordInfo?.hyugangRecordId || null,
            attendanceStatus: recordInfo?.attendanceStatus || ['정상등원'],
            lessonRecordId: recordInfo?.lessonRecordId || null,
            // TEACHER-HW-ALERT-V2: Add homework check note and previous goal
            homeworkCheckNote: recordInfo?.homeworkCheckNote || null,
            homeworkCheckLessonId: recordInfo?.homeworkCheckLessonId || null,
            prevNextLessonGoal: prevGoalMap[goalKey] || null,
            // DASH-ROW-TEST-SNIPPET-V1: Add today's test data
            todayTestData: recordInfo?.todayTestData || null,
          };
        });
      });

      // Build slots array from activeSchedules
      const slots: TodaySlot[] = (activeSchedules || []).map((s: any) => ({
        id: s.id,
        class_id: s.classes?.id || '',
        class_name: s.classes?.name || '알 수 없음',
        subject: s.classes?.subject || '-',
        start_time: s.start_time,
        end_time: s.end_time,
        students: studentsMap[s.classes?.id] || [],
      }));

      // DEBUG: Log attendance data fetched
      const attendanceCount = Object.keys(lessonRecordMap).length;
      console.log('[Dashboard] fetchTodaySlots complete - attendanceUpdated=true, rosterUpdated=true, attendanceRecords:', attendanceCount);

      setTodaySlots(slots);
    } catch (error: any) {
      console.error('Error fetching today slots:', error);
      toast({
        title: '데이터 로드 오류',
        description: '오늘 수업 정보를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }

  async function fetchTodayHolidays() {
    if (!user) return;
    
    try {
      const today = getTodayKST();
      
      // Fetch all holidays for today
      const { data: holidays, error } = await supabase
        .from('holidays')
        .select('*')
        .eq('holiday_date', today);
      
      if (error) {
        console.error('Error fetching holidays:', error);
        return;
      }
      
      // Store all holidays for admin/assistant banner
      setAllTodayHolidays((holidays || []) as Holiday[]);
      
      // Filter: scope='all' OR (scope='teacher' AND teacher_id=current user)
      // For teacher role, this determines if their roster should be hidden
      const relevantHolidays = (holidays || []).filter((h: any) => 
        h.scope === 'all' || (h.scope === 'teacher' && h.teacher_id === user.id)
      );
      
      setTodayHolidays(relevantHolidays as Holiday[]);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  }

  // Mark a subject as followup done for a student (admin only)
  async function markFollowupDone(studentId: string, subject: string) {
    try {
      // Get current done subjects
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('followup_2w_done_subjects')
        .eq('id', studentId)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      const currentDone = (student?.followup_2w_done_subjects as string[]) || [];
      if (currentDone.includes(subject)) return; // Already done
      
      const { error: updateError } = await supabase
        .from('students')
        .update({ followup_2w_done_subjects: [...currentDone, subject] })
        .eq('id', studentId);
      
      if (updateError) throw updateError;
      
      toast({
        title: '연락 완료',
        description: `${subject} 과목 첫등록 2주 연락이 완료 처리되었습니다.`,
      });
      
      // Refresh today's slots to update badges
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

  // Loading state
  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const totalOverdueDrafts = (overdueDrafts || []).reduce((sum, g) => sum + (g?.count || 0), 0);

  // Build attention items for summary bar
  const attentionItems: AttentionItem[] = [];
  
  if (isTeacher(role) && teacherOverdueLessons.length > 0) {
    attentionItems.push({
      icon: <AlertTriangle className="w-4 h-4" />,
      label: '미제출 수업일지',
      count: teacherOverdueLessons.length,
      color: 'bg-destructive/10 border-destructive/20 text-destructive',
      onClick: () => setOverdueOpen(prev => !prev),
    });
  }
  
  if (isAdmin(role) && totalOverdueDrafts > 0) {
    attentionItems.push({
      icon: <Clock className="w-4 h-4" />,
      label: '미제출 수업기록',
      count: totalOverdueDrafts,
      color: 'bg-warning/10 border-warning/20 text-warning',
      onClick: () => setAdminOverdueOpen(prev => !prev),
    });
  }
  
  if (pendingHomework.length > 0) {
    attentionItems.push({
      icon: <CheckSquare className="w-4 h-4" />,
      label: '숙제 확인 대기',
      count: pendingHomework.length,
      color: 'bg-primary/10 border-primary/20 text-primary',
      onClick: () => setHomeworkOpen(prev => !prev),
    });
  }
  
  if (isAdmin(role) && todayAttendance.filter(r => {
    const s = r.attendance_status ?? [];
    return s.includes('무단결석') || s.includes('인정결석') || s.includes('보충불가') || s.includes('지각');
  }).length > 0) {
    const issueCount = todayAttendance.filter(r => {
      const s = r.attendance_status ?? [];
      return s.includes('무단결석') || s.includes('인정결석') || s.includes('보충불가') || s.includes('지각');
    }).length;
    attentionItems.push({
      icon: <UserCheck className="w-4 h-4" />,
      label: '출결 이슈',
      count: issueCount,
      color: 'bg-destructive/10 border-destructive/20 text-destructive',
      onClick: () => setAttendanceOpen(prev => !prev),
    });
  }

  return (
    <div className="space-y-6">
      <DashboardHeader role={role || ''} />
      
      {/* Attention Summary Bar */}
      <AttentionSummaryBar items={attentionItems} />

      {/* Stats Grid - Visible for admin and teacher */}
      {!isAssistant(role) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isAdmin(role) && (
            <>
              <StatCard
                title="전체 학생"
                value={stats.totalStudents}
                icon={<Users className="w-5 h-5" />}
              />
              <StatCard
                title="활성 클래스"
                value={stats.totalClasses}
                icon={<BookOpen className="w-5 h-5" />}
              />
            </>
          )}
          <StatCard
            title="이번 주 수업"
            value={stats.lessonsThisWeek}
            icon={<ClipboardList className="w-5 h-5" />}
          />
          <StatCard
            title="평균 이해도"
            value={stats.avgUnderstanding || '-'}
            subtitle="5점 만점"
            icon={<TrendingUp className="w-5 h-5" />}
          />
          {isAdmin(role) && (
            <StatCard
              title="고위험 학생"
              value={stats.highRiskStudents}
              icon={<AlertTriangle className="w-5 h-5" />}
              className={stats.highRiskStudents > 0 ? 'border-destructive/30 bg-destructive/5' : ''}
            />
          )}
        </div>
      )}

      {/* TEACHER-OVERDUE-WARN-V1: Teacher's own overdue lessons warning */}
      {isTeacher(role) && teacherOverdueLessons.length > 0 && (
        <Collapsible open={overdueOpen} onOpenChange={setOverdueOpen}>
          <Card className="border-destructive/30 bg-destructive/5 animate-slide-up">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-destructive/5 transition-colors rounded-t-lg">
                <CardTitle className="flex items-center justify-between text-destructive">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    미제출 수업일지 {teacherOverdueLessons.length}건
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${overdueOpen ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">날짜</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">학생</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">과목</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">클래스(시간)</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">상태</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherOverdueLessons.map((lesson) => (
                        <tr key={lesson.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2 text-muted-foreground">
                            {format(new Date(lesson.lesson_date), 'MM/dd')}
                          </td>
                          <td className="py-2 px-2 font-medium">{lesson.student_name}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline">{lesson.subject}</Badge>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">
                            {lesson.class_name}
                            {lesson.start_time && <span className="ml-1">({lesson.start_time})</span>}
                          </td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-xs">
                              <FileEdit className="w-3 h-3 mr-1" />
                              임시저장
                            </Badge>
                          </td>
                          <td className="py-2 px-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => navigate(`/lessons?student_id=${lesson.student_id}&class_id=${lesson.class_id || ''}&subject=${encodeURIComponent(lesson.subject)}&lesson_date=${lesson.lesson_date}`)}
                            >
                              <FileEdit className="w-3 h-3 mr-1" />
                              지금 작성
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {isAdmin(role) && totalOverdueDrafts > 0 && (
        <Collapsible open={adminOverdueOpen} onOpenChange={setAdminOverdueOpen}>
          <Card className="border-amber-500/50 bg-amber-500/5 animate-slide-up">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-amber-500/5 transition-colors rounded-t-lg">
                <CardTitle className="flex items-center justify-between text-amber-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    24시간 이상 미제출 수업기록 ({totalOverdueDrafts}건)
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${adminOverdueOpen ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-4">
                  {(overdueDrafts || []).map((group) => (
                    <div key={group?.teacher_id || 'unknown'} className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-foreground">{group?.teacher_name || '알 수 없음'}</h4>
                        <span className="text-sm bg-amber-500/10 text-amber-600 px-2 py-1 rounded-full">
                          {group?.count || 0}건 미제출
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(group?.drafts || []).map((draft) => (
                          <div
                            key={draft?.id || Math.random()}
                            className="flex items-center justify-between p-2 bg-secondary/50 rounded-md text-sm"
                          >
                            <div className="flex items-center gap-3">
                              <FileEdit className="w-4 h-4 text-amber-500" />
                              <span className="font-medium">{draft?.student_name || '알 수 없음'}</span>
                              <span className="text-muted-foreground">{draft?.subject || '-'}</span>
                              <span className="text-muted-foreground">
                                {draft?.lesson_date ? format(new Date(draft.lesson_date), 'MM/dd') : '-'}
                              </span>
                            </div>
                            <span className="text-amber-600 font-medium">
                              {draft?.overdue_hours || 0}시간 경과
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* ADMIN-LESSON-MODAL-V1 + ADMIN-ROSTER-DEBUG-V1 - Admin Roster Section Grouped by Teacher */}
      {isAdmin(role) && adminRosterData && (
        <Card className="border-primary/20 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenLine className="w-5 h-5 text-primary" />
              오늘 수업(원장) - 선생님별 ({adminRosterData.roster_rows?.length ?? 0}명)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(adminRosterData.teachers?.length ?? 0) === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">오늘 배정된 수업이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(adminRosterData.teachers ?? []).map((teacher) => {
                  const teacherRows = (adminRosterData.roster_rows ?? []).filter(r => r.teacher_id === teacher.teacher_id);
                  if (teacherRows.length === 0) return null;
                  
                  return (
                    <div key={teacher.teacher_id} className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-foreground">{teacher.teacher_name}</h4>
                        <Badge variant="secondary">{teacherRows.length}명</Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">학생</th>
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">시간/클래스</th>
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">과목</th>
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">수업일지</th>
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">숙제확인</th>
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">다음숙제</th>
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teacherRows.map((row: any) => {
                              const statusKey = `${row.student_id}:${row.class_id}:${row.subject}`;
                              const lessonStatus = lessonStatusMap[statusKey];
                              
                              // Lesson badge logic
                              let lessonBadge;
                              if (lessonStatus?.recordId) {
                                if (lessonStatus.submitted) {
                                  lessonBadge = <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">제출</Badge>;
                                } else {
                                  lessonBadge = <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">임시저장</Badge>;
                                }
                              } else {
                                lessonBadge = <Badge variant="outline" className="text-muted-foreground text-xs">미작성</Badge>;
                              }
                              
                              // HOMEWORK-STATUS-DISPLAY-FIX-V1: Use actual homework_status from lesson record
                              const rawHwStatus = lessonStatus?.homeworkStatus || null;
                              const hwLabel = getHomeworkStatusLabel(rawHwStatus);
                              const hwBadgeClass = getHomeworkStatusBadgeClass(rawHwStatus);
                              const homeworkBadge = (
                                <div className="flex items-center gap-1">
                                  <Badge className={`${hwBadgeClass} text-xs`} title={isAdmin(role) ? `HW_STATUS_DEBUG: raw=${rawHwStatus} rendered=${hwLabel} recordId=${lessonStatus?.recordId || 'none'}` : undefined}>
                                    {hwLabel}
                                  </Badge>
                                  {lessonStatus?.hasPhotoSubmission && lessonStatus.photoData && (
                                    <Badge 
                                      className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs cursor-pointer hover:bg-blue-500/25"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPhotoViewHw({
                                          id: '', student_id: row.student_id, student_name: row.student_name,
                                          subject: row.subject, content: '', assigned_date: '',
                                          has_photo_submission: true,
                                          submission_image_url: lessonStatus.photoData!.url,
                                          submission_text: lessonStatus.photoData!.text,
                                          submitted_at: lessonStatus.photoData!.at,
                                        });
                                      }}
                                    >
                                      📷 사진보기
                                    </Badge>
                                  )}
                                </div>
                              );
                              
                              return (
                                <tr key={`${row.student_id}-${row.class_id}`} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="py-2 px-2 font-medium">{row.student_name}</td>
                                  <td className="py-2 px-2 text-muted-foreground">
                                    <span className="font-medium">{row.start_time?.slice(0, 5)}</span>
                                    <span className="mx-1">/</span>
                                    <span>{row.class_name}</span>
                                  </td>
                                  <td className="py-2 px-2">
                                    <Badge variant="outline">{row.subject}</Badge>
                                  </td>
                                  <td className="py-2 px-2">{lessonBadge}</td>
                                  <td className="py-2 px-2">{homeworkBadge}</td>
                                  <td className="py-2 px-2">
                                    {lessonStatus?.hasNextHomework ? (
                                      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">배정됨</Badge>
                                    ) : lessonStatus?.recordId ? (
                                      <Badge variant="outline" className="text-muted-foreground text-xs">미배정</Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setAdminLessonModalContext({
                                            student_id: row.student_id,
                                            class_id: row.class_id,
                                            subject: row.subject,
                                            lesson_date: getTodayKST(),
                                          });
                                          setAdminLessonModalRecordId(lessonStatus?.recordId || null);
                                          // PREFILL-FIX-V5: Force new record mode if no existing record
                                          setAdminLessonModalForceNew(!lessonStatus?.recordId);
                                          setAdminLessonModalOpen(true);
                                        }}
                                      >
                                        <FileEdit className="w-3 h-3 mr-1" />
                                        수업일지 작성
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setRosterActionContext({
                                            date: getTodayKST(),
                                            student_id: row.student_id,
                                            student_name: row.student_name,
                                            class_id: row.class_id,
                                            class_name: row.class_name,
                                            subject: row.subject,
                                            teacher_id: row.teacher_id,
                                            teacher_name: row.teacher_name,
                                            start_time: row.start_time,
                                            existingRecordId: lessonStatus?.recordId || null,
                                          });
                                          setRosterActionModalOpen(true);
                                        }}
                                      >
                                        <CheckSquare className="w-3 h-3 mr-1" />
                                        숙제/테스트
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ADMIN-ROSTER-DEBUG-V1: Fallback - Today's Lesson Records when roster is empty */}
      {isAdmin(role) && (adminRosterData?.teachers?.length ?? 0) === 0 && todayLessonRecordsFallback.length > 0 && (
        <Card className="border-warning/30 bg-warning/5 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <FileEdit className="w-5 h-5" />
              오늘 작성된 수업일지
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              정규 로스터가 비어 있어 오늘 날짜로 작성된 수업일지를 표시합니다.
            </p>
            <div className="space-y-4">
              {todayLessonRecordsFallback.map((group) => (
                <div key={group.teacher_id} className="border rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-foreground">{group.teacher_name}</h4>
                    <Badge variant="secondary">{group.records.length}건</Badge>
                  </div>
                  <div className="space-y-2">
                    {group.records.map((record) => (
                      <div 
                        key={record.id}
                        className="flex items-center justify-between p-2 bg-secondary/50 rounded-md text-sm cursor-pointer hover:bg-secondary/70"
                        onClick={() => {
                          setAdminLessonModalContext({
                            student_id: record.student_id,
                            class_id: record.class_id,
                            subject: record.subject,
                            lesson_date: getTodayKST(),
                          });
                          setAdminLessonModalRecordId(record.id);
                          // PREFILL-FIX-V5: This is opening an existing record, not forcing new
                          setAdminLessonModalForceNew(false);
                          setAdminLessonModalOpen(true);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{record.student_name}</span>
                          <Badge variant="outline">{record.subject}</Badge>
                          <span className="text-muted-foreground text-xs">{record.class_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {record.submitted ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">제출</Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">임시저장</Badge>
                          )}
                          <FileEdit className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Attendance Overview - Admin Only */}
      {isAdmin(role) && todayAttendance.length > 0 && (
        <Collapsible open={attendanceOpen} onOpenChange={setAttendanceOpen}>
          <Card className="animate-slide-up">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-primary" />
                    오늘 출결 현황 ({todayAttendance.length}건)
                    {todayAttendance.filter(r => {
                      const s = r.attendance_status ?? [];
                      return s.includes('무단결석') || s.includes('인정결석') || s.includes('보충불가') || s.includes('지각');
                    }).length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        이슈 {todayAttendance.filter(r => {
                          const s = r.attendance_status ?? [];
                          return s.includes('무단결석') || s.includes('인정결석') || s.includes('보충불가') || s.includes('지각');
                        }).length}건
                      </Badge>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${attendanceOpen ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">학생명</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">담당 선생님</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">수업 시간</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">출결 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayAttendance.map((record) => {
                        const getAttendanceBadge = (status: string[] | null | undefined) => {
                          const safeStatus = status ?? [];
                          const hasAbsent = safeStatus.includes('무단결석') || safeStatus.includes('인정결석');
                          const hasLateOrEarly = safeStatus.includes('지각') || safeStatus.includes('조퇴');
                          const hasNoShow = safeStatus.includes('보충불가');
                          
                          if (hasAbsent || hasNoShow) {
                            return (
                              <Badge className="bg-red-500/15 text-red-600 border-red-500/30">
                                {safeStatus.filter(s => s !== '정상등원').join(', ') || '정상등원'}
                              </Badge>
                            );
                          } else if (hasLateOrEarly) {
                            return (
                              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                                {safeStatus.filter(s => s !== '정상등원').join(', ') || '정상등원'}
                              </Badge>
                            );
                          } else {
                            return (
                              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                정상등원
                              </Badge>
                            );
                          }
                        };
                        
                        return (
                          <tr key={record.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 px-3 font-medium">{record.student_name}</td>
                            <td className="py-2 px-3 text-muted-foreground">{record.teacher_name}</td>
                            <td className="py-2 px-3 text-muted-foreground">{record.start_time}</td>
                            <td className="py-2 px-3">{getAttendanceBadge(record.attendance_status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {(isTeacher(role) || isAdmin(role) || isAssistant(role)) && (
        <>
          {/* Holiday Banner - show for all roles when there's a holiday */}
          {allTodayHolidays.length > 0 && (
            <Card className="border-amber-500/50 bg-amber-500/5 animate-slide-up">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-amber-600" />
                    <div>
                      <span className="font-medium text-amber-700">
                        {allTodayHolidays.some(h => h.scope === 'all') 
                          ? '오늘은 휴강일(전체)입니다' 
                          : '오늘은 휴강일입니다'}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {allTodayHolidays.map(h => h.name).join(', ')}
                      </span>
                    </div>
                  </div>
                  
                  {/* Admin toggle to show roster despite holiday */}
                  {isAdmin(role) && allTodayHolidays.some(h => h.scope === 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIgnoreHoliday(!ignoreHoliday)}
                      className="text-amber-700 hover:text-amber-800"
                    >
                      {ignoreHoliday ? (
                        <>
                          <EyeOff className="w-4 h-4 mr-1" />
                          휴강 적용
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-1" />
                          휴강 무시하고 보기
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Roster visibility logic:
              - Teacher: hide if scope='all' OR scope='teacher' for this teacher
              - Assistant: ALWAYS show roster (banner only)
              - Admin: show if ignoreHoliday is true, otherwise hide if scope='all' exists
          */}
          {(() => {
            const hasAllHoliday = allTodayHolidays.some(h => h.scope === 'all');
            const hasTeacherHoliday = todayHolidays.some(h => h.scope === 'teacher' && h.teacher_id === user?.id);
            
            // Determine if roster should be hidden
            let hideRoster = false;
            if (isTeacher(role)) {
              // Teachers: hide if any relevant holiday (all or their specific teacher holiday)
              hideRoster = hasAllHoliday || hasTeacherHoliday;
            } else if (isAdmin(role)) {
              // Admin: hide only if scope='all' holiday exists AND ignoreHoliday is false
              hideRoster = hasAllHoliday && !ignoreHoliday;
            }
            // Assistant: never hide roster (hideRoster stays false)
            
            if (hideRoster) return null;
            
            return (
              <Card className="border-primary/20 animate-slide-up">
                <CardHeader>
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
                      {(todaySlots || []).map((slot) => (
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
{(slot?.students || []).length > 0 ? (
                            <div className="space-y-2">
                              {(slot?.students || []).map((student) => {
                                const testState = latestTests.getStudentState(student.id);
                                const isTestExpanded = latestTests.isExpanded(student.id);
                                
                                return (
                                <div 
                                  key={student.id} 
                                  className={`rounded-md ${student.hyugangRecordId ? 'bg-muted/50' : 'bg-secondary/50'}`}
                                >
                                  <div className="flex items-center justify-between p-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`font-medium ${student.hyugangRecordId ? 'text-muted-foreground' : 'text-foreground'}`}>{student.name}</span>
                                      {student.hyugangRecordId ? (
                                        <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">휴강</Badge>
                                      ) : (
                                        <>
                                          {/* Attendance badge - show first for visibility */}
                                          {getAttendanceStatusBadge(student.attendanceStatus)}
                                          {getRosterBadges(
                                            student.previousHomeworkStatus,
                                            student.debugReason,
                                            student.firstSubject,
                                            student.followup2wDue,
                                            slot.subject,
                                            isAdmin(role),
                                            () => markFollowupDone(student.id, slot.subject)
                                          )}
                                          {/* TEACHER-HW-ALERT-V2: 별도 확인 badge */}
                                          {student.homeworkCheckNote && 
                                           student.homeworkCheckLessonId && 
                                           !acknowledgedAlerts.has(student.homeworkCheckLessonId) && (
                                            <Badge 
                                              className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-xs cursor-pointer hover:bg-amber-500/25"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setHwAlertContext({
                                                  studentName: student.name,
                                                  subject: slot.subject,
                                                  lessonId: student.homeworkCheckLessonId!,
                                                  noteText: student.homeworkCheckNote!,
                                                  studentId: student.id,
                                                });
                                                setHwAlertModalOpen(true);
                                              }}
                                            >
                                              <AlertTriangle className="w-3 h-3 mr-1" />
                                              별도 확인
                                            </Badge>
                                          )}
                                        </>
                                      )}
                                      
                                      {/* TEST-CONTENT-DISPLAY-V2: Show today's test snippet inline (content-first) */}
                                      {!student.hyugangRecordId && student.todayTestData && (student.todayTestData.test_content || student.todayTestData.test_title) && (() => {
                                        const testObj = {
                                          subject: slot.subject as '수학' | '과학' | '영어' | '국어',
                                          lesson_date: getTodayKST(),
                                          test_content: student.todayTestData.test_content,
                                          test_title: student.todayTestData.test_title,
                                          test_result_text: student.todayTestData.test_result_text,
                                          english_pass_fail: student.todayTestData.english_pass_fail,
                                        };
                                        const snippet = formatTestSnippet(testObj);
                                        const tooltip = formatTestTooltip(testObj);
                                        return snippet ? (
                                          <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={tooltip}>
                                            {snippet}
                                          </span>
                                        ) : null;
                                      })()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {/* DASH-LATEST-TEST-TOGGLE-V1: Latest test toggle button */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7 px-2"
                                        onClick={() => latestTests.toggleStudent(student.id)}
                                      >
                                        {testState?.loading ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <>
                                            <TestTube2 className="w-3.5 h-3.5 mr-1" />
                                            {isTestExpanded ? '접기' : '최근 테스트'}
                                          </>
                                        )}
                                      </Button>
                                      {student.hyugangRecordId ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => navigate(`/lessons?student_id=${student.id}&class_id=${slot.class_id}&subject=${encodeURIComponent(slot.subject)}&lesson_date=${getTodayKST()}`)}
                                        >
                                          <FileEdit className="w-3.5 h-3.5 mr-1" />
                                          휴강 기록 보기
                                        </Button>
                                      ) : (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => navigate(`/lessons?student_id=${student.id}&class_id=${slot.class_id}&subject=${encodeURIComponent(slot.subject)}&lesson_date=${getTodayKST()}`)}
                                          >
                                            <FileEdit className="w-3.5 h-3.5 mr-1" />
                                            수업기록
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => navigate(`/lessons?student_id=${student.id}&class_id=${slot.class_id}&subject=${encodeURIComponent(slot.subject)}&lesson_date=${getTodayKST()}&focus=test`)}
                                          >
                                            <CheckSquare className="w-3.5 h-3.5 mr-1" />
                                            숙제/테스트
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* DASH-LATEST-TEST-TOGGLE-V1: Latest test expanded section */}
                                  {isTestExpanded && testState && !testState.loading && (
                                    <div className="px-2 pb-2">
                                      {testState.error ? (
                                        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                                          {testState.error}
                                        </div>
                                      ) : testState.tests.length === 0 ? (
                                        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                          최근 테스트 기록이 없습니다.
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs bg-muted/30 p-2 rounded">
                                          {testState.tests.map((test) => (
                                            <div key={test.subject} className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{test.subject}</Badge>
                                              <span className="text-muted-foreground truncate">{formatTestLine(test)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* TEACHER-HW-ALERT-V2: E) 지난 목표 display */}
                                  {!student.hyugangRecordId && student.prevNextLessonGoal && (
                                    <div className="mt-1 mb-2 mx-2 text-xs text-muted-foreground pl-2 border-l-2 border-muted">
                                      <span className="font-medium">지난 목표:</span> {student.prevNextLessonGoal}
                                    </div>
                                  )}
                                </div>
                              );
                              })}
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
            );
          })()}
        </>
      )}

      {/* Assistant Requests Widget - Teacher & Admin */}
      {(isAdmin(role) || isTeacher(role)) && (
        <AssistantRequestsWidget />
      )}

      {/* DAILY-HOMEWORK-V1: Quick access to daily homework manager */}
      {(isAdmin(role) || isTeacher(role)) && (
        <div className="flex justify-end">
          <DailyHomeworkManager />
        </div>
      )}

      {/* Pending Homework Section */}
      {pendingHomework.length > 0 && (
        <Collapsible open={homeworkOpen} onOpenChange={setHomeworkOpen}>
          <Card className="border-primary/20 animate-slide-up">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-primary" />
                    숙제 확인 대기 ({pendingHomework.length}건)
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${homeworkOpen ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {(pendingHomework || []).map((hw) => (
                    <div
                      key={hw.id}
                      className="flex items-center justify-between p-3 bg-background rounded-lg border"
                    >
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{hw.student_name}</span>
                          <Badge variant="outline" className="text-xs">{hw.subject}</Badge>
                          {hw.has_photo_submission && (
                            <Badge 
                              className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs cursor-pointer hover:bg-blue-500/25"
                              onClick={() => setPhotoViewHw(hw)}
                            >
                              📷 사진보기
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(hw.assigned_date), 'MM/dd')}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{hw.content}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {hw.has_photo_submission && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPhotoViewHw(hw)}
                          >
                            📷
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/lessons?student_id=${hw.student_id}&subject=${encodeURIComponent(hw.subject)}`)}
                        >
                          확인하기
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* PHOTO-VIEW-V1: Photo viewer dialog for pending homework */}
      <Dialog open={!!photoViewHw} onOpenChange={(open) => !open && setPhotoViewHw(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📷 {photoViewHw?.student_name} - 숙제 제출 사진
            </DialogTitle>
          </DialogHeader>
          {photoViewHw?.submission_image_url && (
            <SubmissionImageCarousel
              images={photoViewHw.submission_image_url.split(',').map(u => u.trim()).filter(Boolean)}
              submittedAt={photoViewHw.submitted_at}
              note={photoViewHw.submission_text}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Management Section */}
      {isAdmin(role) && (
        <div className="space-y-4 pt-2">
          <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            학원 관리
          </h2>
          <AdminStatsSection />
          <HolidayManagement />
          <WeeklyScheduleVerification />
        </div>
      )}

      {/* LESSON-SHARED-FORM-V3: Unified Lesson Modal (Dashboard + Lessons use same form) */}
      <LessonModal
        open={adminLessonModalOpen}
        onOpenChange={(open) => {
          setAdminLessonModalOpen(open);
          if (!open) {
            setAdminLessonModalForceNew(false);
          }
        }}
        context={adminLessonModalContext}
        existingRecordId={adminLessonModalRecordId}
        onSaved={async () => {
          // Refresh roster data after save
          await fetchAdminRosterData();
        }}
        initialMode="edit"
        forceNewRecord={adminLessonModalForceNew}
      />

      {/* Roster Action Modal for homework/test */}
      <RosterActionModal
        open={rosterActionModalOpen}
        onOpenChange={setRosterActionModalOpen}
        context={rosterActionContext}
        mode="HOMEWORK_TEST"
        onSaved={async () => {
          await fetchAdminRosterData();
        }}
      />

      {/* TEACHER-HW-ALERT-V2: Homework Alert Modal */}
      {hwAlertContext && user && (
        <HomeworkAlertModal
          open={hwAlertModalOpen}
          onOpenChange={setHwAlertModalOpen}
          studentName={hwAlertContext.studentName}
          subject={hwAlertContext.subject}
          lessonId={hwAlertContext.lessonId}
          noteText={hwAlertContext.noteText}
          teacherId={user.id}
          studentId={hwAlertContext.studentId}
          onAcknowledged={() => {
            setAcknowledgedAlerts(prev => new Set([...prev, hwAlertContext.lessonId]));
            setHwAlertContext(null);
          }}
        />
      )}
    </div>
  );
}
