import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdmin, isTeacher, isAssistant } from '@/lib/auth';
import AssistantDashboard from '@/components/AssistantDashboard';
import AdminStatsSection from '@/components/AdminStatsSection';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { AttentionSummaryBar, type AttentionItem } from '@/components/dashboard/AttentionSummaryBar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { HomeworkCompletionChart } from '@/components/dashboard/HomeworkCompletionChart';
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
import StudentProgressWidget from '@/components/StudentProgressWidget';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WeeklyScheduleVerification } from '@/components/WeeklyScheduleVerification';
import { LessonFormContext } from '@/components/lessons/LessonRecordForm';
import { useStudentLatestTests, formatTestLine, formatTestSnippet, formatTestTooltip, LatestTest } from '@/hooks/useStudentLatestTests';
import { ExamDdayBanner } from '@/components/ExamDdayBanner';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
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
  ChevronDown,
  BarChart3,
  Settings2,
  Wrench,
  MessageSquare,
  ArrowLeftRight
} from 'lucide-react';
import { ScheduleOverrideModal } from '@/components/ScheduleOverrideModal';
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
  lessonSubmitted?: boolean;
  hasNextHomework?: boolean;
  hasPhotoSubmission?: boolean;
  photoData?: { urls: string[]; text: string | null; at: string | null } | null;
  // TEACHER-HW-ALERT-V2: Homework check note and previous goal
  homeworkCheckNote?: string | null;
  homeworkCheckLessonId?: string | null;
  prevNextLessonGoal?: string | null;
  // HOMEWORK-CHECK-STATUS-SYNC-V1: latest previous homework assignment check status
  latestAssignmentCheckStatus?: string | null;
  // HW-STATUS-SYNC-V1: homework_status from today's lesson_records (single source of truth)
  homeworkStatus?: string | null;
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
  isOverridden?: boolean; // SCHEDULE-OVERRIDE-V1: slot has been moved/cancelled
  overrideType?: 'moved' | 'cancelled';
  overrideReason?: string;
  isMovedIn?: boolean; // SCHEDULE-OVERRIDE-V1: this slot was moved here from another day
  movedFromDate?: string;
}

interface ScheduleOverride {
  id: string;
  schedule_id: string;
  class_id: string;
  teacher_id: string;
  original_date: string;
  override_type: 'moved' | 'cancelled';
  new_date: string | null;
  new_start_time: string | null;
  new_end_time: string | null;
  reason: string | null;
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
  if (!status) return '확인요망';
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return '미이행';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return '일부완료';
  if (['completed', '완료'].includes(normalized)) return '완료';
  if (['checked', '확인함', '확인됨'].includes(normalized)) return '확인함';
  if (['unchecked', '확인요망', '확인대기'].includes(normalized)) return '확인요망';
  if (['none_assigned', '없음'].includes(normalized)) return '미배정';
  return '확인요망';
}

// HOMEWORK-STATUS-DISPLAY-FIX-V1: Get badge variant based on status
function getHomeworkStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-muted text-muted-foreground';
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return 'bg-red-500/15 text-red-600 border-red-500/30';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
  if (['completed', '완료', 'checked', '확인함', '확인됨'].includes(normalized)) return 'bg-green-500/15 text-green-600 border-green-500/30';
  if (['unchecked', '확인요망', '확인대기'].includes(normalized)) return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
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
  const [lessonStatusMap, setLessonStatusMap] = useState<Record<string, { submitted: boolean; recordId: string | null; homeworkStatus: string | null; latestAssignmentCheckStatus?: string | null; hasNextHomework: boolean; hasPhotoSubmission: boolean; photoData?: { urls: string[]; text: string | null; at: string | null; studentName: string }; prevNextLessonGoal?: string | null; todayTestData?: { test_content: string | null; test_title: string | null; test_result_text: string | null; english_pass_fail: string | null } | null }>>({});

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
  
  // TEAM-NOTE-REPLY-NOTIFICATION-V1: Unread reply count
  const [unreadReplyCount, setUnreadReplyCount] = useState(0);
  
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

  // SUPPLEMENT-LESSON-V1: Supplementary lessons for today
  interface SupplementaryLesson {
    id: string;
    student_id: string;
    student_name: string;
    class_id: string | null;
    class_name: string;
    subject: string;
    teacher_id: string;
    teacher_name: string;
    submitted: boolean;
    start_time?: string;
  }
  const [supplementaryLessons, setSupplementaryLessons] = useState<SupplementaryLesson[]>([]);

  // TEXTBOOK-ARRIVAL-ALERT-V1: Arrived textbook orders for teacher alert
  const [arrivedTextbookCount, setArrivedTextbookCount] = useState(0);

  // SCHEDULE-OVERRIDE-V1: Override modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideModalContext, setOverrideModalContext] = useState<{
    scheduleId: string;
    classId: string;
    className: string;
    subject: string;
    teacherId: string;
    originalDate: string;
    originalStartTime: string;
    originalEndTime: string;
  } | null>(null);

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
          await fetchSupplementaryLessons();
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
    
    // TEAM-NOTE-REPLY-NOTIFICATION-V1: Fetch unread reply count
    async function fetchUnreadReplies() {
      if (!user) return;
      try {
        // Get notes created by this user
        const { data: myNotes } = await supabase
          .from('team_notes')
          .select('id')
          .eq('created_by', user.id);
        if (!myNotes || myNotes.length === 0) { setUnreadReplyCount(0); return; }
        
        const noteIds = myNotes.map(n => n.id);
        
        // Get all replies on my notes (not by me)
        const { data: allReplies } = await supabase
          .from('team_note_replies')
          .select('id, note_id, created_at')
          .in('note_id', noteIds)
          .neq('created_by', user.id);
        if (!allReplies || allReplies.length === 0) { setUnreadReplyCount(0); return; }
        
        // Get my read records
        const { data: readRecords } = await supabase
          .from('team_note_reply_reads')
          .select('note_id, last_read_at')
          .eq('user_id', user.id)
          .in('note_id', noteIds);
        
        const readMap = new Map<string, string>();
        (readRecords || []).forEach((r: any) => readMap.set(r.note_id, r.last_read_at));
        
        let unread = 0;
        allReplies.forEach((reply: any) => {
          const lastRead = readMap.get(reply.note_id);
          if (!lastRead || new Date(reply.created_at) > new Date(lastRead)) {
            unread++;
          }
        });
        setUnreadReplyCount(unread);
      } catch (err) {
        console.error('Error fetching unread replies:', err);
      }
    }
    fetchUnreadReplies();

    // TEXTBOOK-ARRIVAL-ALERT-V1: Fetch arrived textbooks matching teacher's subject
    async function fetchArrivedTextbooks() {
      if (!user) return;
      try {
        if (isTeacher(role)) {
          // Get teacher's assigned subject
          const { data: profile } = await supabase
            .from('profiles')
            .select('assigned_subject')
            .eq('id', user.id)
            .single();
          const subject = (profile as any)?.assigned_subject;
          if (!subject) return;
          const { count } = await supabase
            .from('textbook_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', '입고완료')
            .eq('subject', subject);
          setArrivedTextbookCount(count || 0);
        } else if (isAdmin(role)) {
          const { count } = await supabase
            .from('textbook_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', '입고완료');
          setArrivedTextbookCount(count || 0);
        }
      } catch (err) {
        console.error('Error fetching arrived textbooks:', err);
      }
    }
    fetchArrivedTextbooks();
  }, [user, role]);

  // Refetch roster data when window regains focus (user returns from /lessons page)
  useEffect(() => {
    const handleFocus = () => {
      if (user && (isTeacher(role) || isAdmin(role))) {
        // refetch on focus
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
          .select('id, student_id, class_id, subject, submitted, homework_status, test_content, test_title, test_result_text, english_pass_fail')
          .eq('lesson_date', today)
          .in('student_id', studentIds)
          .in('class_id', classIds);
        
        const recordIds = (lessonRecords || []).map((lr: any) => lr.id).filter(Boolean);
        
        // NEXT-HW-BADGE-V1: Fetch homework_assignments for today's lesson records
        let hwAssignmentSet = new Set<string>();
        // Photo submission tracking moved to PHOTO-STABLE-V2 below
        if (recordIds.length > 0) {
          const { data: hwAssignments } = await supabase
            .from('homework_assignments')
            .select('lesson_record_id, student_id, submitted_at, submission_image_url')
            .in('lesson_record_id', recordIds)
            .not('content', 'eq', '');
          
          hwAssignmentSet = new Set((hwAssignments || []).map((ha: any) => ha.lesson_record_id));
        }

        // PHOTO-STABLE-V2: Fetch photo submissions from homework_submissions (stable, not affected by check_status)
        // Also fallback to homework_assignments.submission_image_url
        let photoDataMap: Record<string, { urls: string[]; text: string | null; at: string | null }> = {};
        // HOMEWORK-CHECK-STATUS-SYNC-V1: Track latest previous assignment check_status per student+subject
        let latestAssignmentCheckStatusMap: Record<string, string | null> = {};
        if (studentIds.length > 0) {
          // Primary source: homework_submissions table (joined via homework_assignments for subject)
          const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
          const { data: submissions } = await supabase
            .from('homework_submissions')
            .select('student_id, image_url, submission_note, submitted_at, homework_id, homework_assignments!inner(subject, student_id)')
            .in('student_id', studentIds)
            .not('image_url', 'is', null)
            .gte('submitted_at', sevenDaysAgo)
            .order('submitted_at', { ascending: false });
          
          (submissions || []).forEach((sub: any) => {
            if (sub.image_url) {
              const subject = (sub.homework_assignments as any)?.subject;
              if (!subject) return;
              const photoKey = `${sub.student_id}:${subject}`;
              if (!photoDataMap[photoKey]) {
                photoDataMap[photoKey] = { urls: [], text: sub.submission_note || null, at: sub.submitted_at };
              }
              // Collect all image URLs (support comma-separated)
              const imgUrls = sub.image_url.split(',').map((u: string) => u.trim()).filter(Boolean);
              photoDataMap[photoKey].urls.push(...imgUrls);
            }
          });

          // Fallback: homework_assignments.submission_image_url
          // PHOTO-MATCH-V3: Only show photo from the LATEST homework per student+subject.
          // If the latest homework has no photo, do NOT fall back to older homework photos.
          const { data: hwAll } = await supabase
            .from('homework_assignments')
            .select('student_id, subject, assigned_date, submitted_at, submission_image_url, submission_text, check_status')
            .in('student_id', studentIds)
            .gte('assigned_date', sevenDaysAgo)
            .order('assigned_date', { ascending: false });
          
          // Track which student+subject we've already seen (latest first)
          const seenLatest = new Set<string>();
          (hwAll || []).forEach((hw: any) => {
            const photoKey = `${hw.student_id}:${hw.subject}`;

            if (hw.assigned_date < today && latestAssignmentCheckStatusMap[photoKey] === undefined) {
              latestAssignmentCheckStatusMap[photoKey] = hw.check_status || null;
            }

            if (seenLatest.has(photoKey)) return; // skip older assignments
            seenLatest.add(photoKey);
            // Only populate photo if THIS (latest) assignment has a submission
            if (hw.submitted_at && hw.submission_image_url && !photoDataMap[photoKey]) {
              const imgUrls = hw.submission_image_url.split(',').map((u: string) => u.trim()).filter(Boolean);
              photoDataMap[photoKey] = { urls: imgUrls, text: hw.submission_text || null, at: hw.submitted_at };
            }
          });
        }

        // Build photo set from map
        const photoSubmissionSet = new Set(Object.keys(photoDataMap));
        
        // Build a student name lookup from roster rows
        const studentNameLookup: Record<string, string> = {};
        rosterRows.forEach((r: any) => { studentNameLookup[r.student_id] = r.student_name; });

        // Fetch previous lesson goals for admin view
        let adminPrevGoalMap: Record<string, string | null> = {};
        const subjects = [...new Set(rosterRows.map((r: any) => r.subject))].filter(Boolean);
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
            const seen = new Set<string>();
            prevLessons.forEach((pl: any) => {
              const key = `${pl.student_id}:${pl.subject}`;
              if (!seen.has(key) && pl.next_lesson_goal) {
                adminPrevGoalMap[key] = pl.next_lesson_goal;
                seen.add(key);
              }
            });
          }
        }

        // PHOTO-STABLE-V2: Build status map with stable photo data
        const statusMap: Record<string, typeof lessonStatusMap[string]> = {};
        (lessonRecords || []).forEach((lr: any) => {
          const key = `${lr.student_id}:${lr.class_id}:${lr.subject}`;
          const photoKey = `${lr.student_id}:${lr.subject}`;
          const goalKey = `${lr.student_id}:${lr.subject}`;
          const pd = photoDataMap[photoKey];
          const hasTestData = (lr.test_content && lr.test_content.trim() !== '') || (lr.test_title && lr.test_title.trim() !== '') || (lr.test_result_text && lr.test_result_text.trim() !== '');
          statusMap[key] = { 
            submitted: lr.submitted,
            recordId: lr.id,
            homeworkStatus: lr.homework_status || null,
            latestAssignmentCheckStatus: latestAssignmentCheckStatusMap[photoKey] || null,
            hasNextHomework: hwAssignmentSet.has(lr.id), 
            hasPhotoSubmission: photoSubmissionSet.has(photoKey),
            prevNextLessonGoal: adminPrevGoalMap[goalKey] || null,
            todayTestData: hasTestData ? { test_content: lr.test_content || null, test_title: lr.test_title || null, test_result_text: lr.test_result_text || null, english_pass_fail: lr.english_pass_fail || null } : null,
            ...(pd ? { photoData: { ...pd, studentName: studentNameLookup[lr.student_id] || '학생' } } : {})
          };
        });
        
        // TEST-SCHEDULES-DASH-V1: Fetch today's test_schedules results to supplement lesson_records test data
        if (studentIds.length > 0) {
          const { data: testScheds } = await supabase
            .from('test_schedules')
            .select('student_id, subject, content, result_score, result_passed, test_type')
            .eq('test_date', today)
            .in('student_id', studentIds)
            .or('result_score.neq.,result_passed.not.is.null');
          
          if (testScheds && testScheds.length > 0) {
            // Build a map by student_id:subject
            const testSchedMap: Record<string, typeof testScheds[0]> = {};
            testScheds.forEach((ts: any) => {
              const k = `${ts.student_id}:${ts.subject}`;
              testSchedMap[k] = ts; // latest wins
            });
            
            // Merge into statusMap where no lesson_records test data exists
            rosterRows.forEach((row: any) => {
              const key = `${row.student_id}:${row.class_id}:${row.subject}`;
              const tsKey = `${row.student_id}:${row.subject}`;
              const ts = testSchedMap[tsKey];
              if (!ts) return;
              
              const existing = statusMap[key];
              if (existing && !existing.todayTestData) {
                existing.todayTestData = {
                  test_content: ts.content || null,
                  test_title: `${ts.test_type === 'guerrilla' ? '게릴라' : '시험'}`,
                  test_result_text: ts.result_score || (ts.result_passed != null ? (ts.result_passed ? '통과' : '불통과') : null),
                  english_pass_fail: ts.subject === '영어' && ts.result_passed != null ? (ts.result_passed ? 'pass' : 'fail') : null,
                };
              } else if (!existing) {
                statusMap[key] = {
                  submitted: false,
                  recordId: null,
                  homeworkStatus: null,
                  latestAssignmentCheckStatus: latestAssignmentCheckStatusMap[tsKey] || null,
                  hasNextHomework: false,
                  hasPhotoSubmission: photoSubmissionSet.has(tsKey),
                  todayTestData: {
                    test_content: ts.content || null,
                    test_title: `${ts.test_type === 'guerrilla' ? '게릴라' : '시험'}`,
                    test_result_text: ts.result_score || (ts.result_passed != null ? (ts.result_passed ? '통과' : '불통과') : null),
                    english_pass_fail: ts.subject === '영어' && ts.result_passed != null ? (ts.result_passed ? 'pass' : 'fail') : null,
                  },
                };
              }
            });
          }
        }

        // Also populate statusMap for students with photo submissions but no lesson record
        rosterRows.forEach((row: any) => {
          const key = `${row.student_id}:${row.class_id}:${row.subject}`;
          const photoKey = `${row.student_id}:${row.subject}`;
          if (!statusMap[key] && photoSubmissionSet.has(photoKey)) {
            const pd = photoDataMap[photoKey];
            statusMap[key] = {
              submitted: false,
              recordId: null,
              homeworkStatus: null,
              latestAssignmentCheckStatus: latestAssignmentCheckStatusMap[photoKey] || null,
              hasNextHomework: false,
              hasPhotoSubmission: true,
              ...(pd ? { photoData: { ...pd, studentName: studentNameLookup[row.student_id] || '학생' } } : {})
            };
          }
        });
        
        setLessonStatusMap(statusMap);
      }
      
      // ADMIN-ROSTER-DEBUG-V1: Fetch fallback lesson records when roster is empty
      if (rosterRows.length === 0) {
        await fetchTodayLessonRecordsFallback();
      }
      
      
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
            students:student_id!inner (id, name, enrollment_status)
          `)
          .in('class_id', classIds)
          .neq('students.enrollment_status', '퇴원');

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
      
      // key: `${studentId}:${classId}` -> { hyugangRecordId, attendanceStatus, lessonRecordId, submitted, homeworkCheckNote, homeworkCheckLessonId, todayTestData }
      let lessonRecordMap: Record<string, { 
        hyugangRecordId: string | null; 
        attendanceStatus: string[]; 
        lessonRecordId: string | null;
        submitted: boolean;
        homeworkCheckNote: string | null;
        homeworkCheckLessonId: string | null;
        hasNextHomework: boolean;
        hasPhotoSubmission: boolean;
        photoData?: { urls: string[]; text: string | null; at: string | null } | null;
        // TEST-CONTENT-DISPLAY-V2
        subject?: string;
        // HW-STATUS-SYNC-V1: homework_status from lesson_records
        homeworkStatus?: string | null;
        // HOMEWORK-CHECK-STATUS-SYNC-V1: latest previous assignment check status
        latestAssignmentCheckStatus?: string | null;
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
        
        // TEST-CONTENT-DISPLAY-V2: Include test_content and submitted as primary fields
        const { data: todayRecords } = await supabase
          .from('lesson_records')
          .select('id, student_id, class_id, subject, submitted, lesson_types, attendance_status, homework_check_note, homework_status, test_content, test_title, test_result_text, english_pass_fail')
          .eq('lesson_date', today)
          .in('student_id', studentIds)
          .in('class_id', classIdsForRecords);
        
        // Fetch homework assignments for today's records (for hasNextHomework)
        const recordIds = (todayRecords || []).map((lr: any) => lr.id).filter(Boolean);
        let hwAssignmentSet = new Set<string>();
        if (recordIds.length > 0) {
          const { data: hwAssignments } = await supabase
            .from('homework_assignments')
            .select('lesson_record_id')
            .in('lesson_record_id', recordIds)
            .not('content', 'eq', '');
          hwAssignmentSet = new Set((hwAssignments || []).map((ha: any) => ha.lesson_record_id));
        }

        // Fetch photo submissions for teacher's students
        let teacherPhotoDataMap: Record<string, { urls: string[]; text: string | null; at: string | null }> = {};
        // HOMEWORK-CHECK-STATUS-SYNC-V1: Track latest previous assignment check_status per student+subject
        let latestAssignmentCheckStatusMap: Record<string, string | null> = {};
        if (studentIds.length > 0) {
          const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
          const { data: submissions } = await supabase
            .from('homework_submissions')
            .select('student_id, image_url, submission_note, submitted_at, homework_id, homework_assignments!inner(subject, student_id)')
            .in('student_id', studentIds)
            .not('image_url', 'is', null)
            .gte('submitted_at', sevenDaysAgo)
            .order('submitted_at', { ascending: false });
          
          (submissions || []).forEach((sub: any) => {
            if (sub.image_url) {
              const subject = (sub.homework_assignments as any)?.subject;
              if (!subject) return;
              const photoKey = `${sub.student_id}:${subject}`;
              if (!teacherPhotoDataMap[photoKey]) {
                teacherPhotoDataMap[photoKey] = { urls: [], text: sub.submission_note || null, at: sub.submitted_at };
              }
              const imgUrls = sub.image_url.split(',').map((u: string) => u.trim()).filter(Boolean);
              teacherPhotoDataMap[photoKey].urls.push(...imgUrls);
            }
          });

          // Fallback: homework_assignments.submission_image_url
          const { data: hwAll } = await supabase
            .from('homework_assignments')
            .select('student_id, subject, assigned_date, submitted_at, submission_image_url, submission_text, check_status')
            .in('student_id', studentIds)
            .gte('assigned_date', sevenDaysAgo)
            .order('assigned_date', { ascending: false });
          
          const seenLatest = new Set<string>();
          (hwAll || []).forEach((hw: any) => {
            const photoKey = `${hw.student_id}:${hw.subject}`;

            if (hw.assigned_date < today && latestAssignmentCheckStatusMap[photoKey] === undefined) {
              latestAssignmentCheckStatusMap[photoKey] = hw.check_status || null;
            }

            if (seenLatest.has(photoKey)) return;
            seenLatest.add(photoKey);
            if (hw.submitted_at && hw.submission_image_url && !teacherPhotoDataMap[photoKey]) {
              const imgUrls = hw.submission_image_url.split(',').map((u: string) => u.trim()).filter(Boolean);
              teacherPhotoDataMap[photoKey] = { urls: imgUrls, text: hw.submission_text || null, at: hw.submitted_at };
            }
          });
        }

        if (todayRecords) {
          todayRecords.forEach((lr: any) => {
            const key = `${lr.student_id}:${lr.class_id}`;
            const isHyugang = lr.lesson_types && lr.lesson_types.includes('휴강');
            // TEST-CONTENT-DISPLAY-V2: Check for test data (content-first)
            const hasTestData = (lr.test_content && lr.test_content.trim() !== '') || (lr.test_title && lr.test_title.trim() !== '') || (lr.test_result_text && lr.test_result_text.trim() !== '');
            const photoKey = `${lr.student_id}:${lr.subject}`;
            const pd = teacherPhotoDataMap[photoKey];
            lessonRecordMap[key] = {
              hyugangRecordId: isHyugang ? lr.id : null,
              attendanceStatus: lr.attendance_status || ['정상등원'],
              lessonRecordId: lr.id,
              submitted: lr.submitted || false,
              homeworkCheckNote: lr.homework_check_note || null,
              homeworkCheckLessonId: lr.homework_check_note ? lr.id : null,
              hasNextHomework: hwAssignmentSet.has(lr.id),
              hasPhotoSubmission: !!pd,
              photoData: pd || null,
              // HW-STATUS-SYNC-V1: Include homework_status from lesson_records
              homeworkStatus: lr.homework_status || null,
              // HOMEWORK-CHECK-STATUS-SYNC-V1: Include latest previous assignment check status
              latestAssignmentCheckStatus: latestAssignmentCheckStatusMap[photoKey] || null,
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
        
        // TEST-SCHEDULES-DASH-V1: Fetch today's test_schedules results for teacher view
        if (studentIds.length > 0) {
          const { data: testScheds } = await supabase
            .from('test_schedules')
            .select('student_id, subject, content, result_score, result_passed, test_type')
            .eq('test_date', today)
            .in('student_id', studentIds)
            .or('result_score.neq.,result_passed.not.is.null');
          
          if (testScheds && testScheds.length > 0) {
            // Build student_id:subject -> class_id lookup from roster
            const subjectClassMap: Record<string, string> = {};
            allStudentClassPairs.forEach(p => {
              subjectClassMap[`${p.studentId}:${p.subject}`] = p.classId;
            });
            
            testScheds.forEach((ts: any) => {
              const classId = subjectClassMap[`${ts.student_id}:${ts.subject}`];
              if (!classId) return;
              const key = `${ts.student_id}:${classId}`;
              const existing = lessonRecordMap[key];
              if (existing && !existing.todayTestData) {
                existing.todayTestData = {
                  test_content: ts.content || null,
                  test_title: `${ts.test_type === 'guerrilla' ? '게릴라' : '시험'}`,
                  test_result_text: ts.result_score || (ts.result_passed != null ? (ts.result_passed ? '통과' : '불통과') : null),
                  english_pass_fail: ts.subject === '영어' && ts.result_passed != null ? (ts.result_passed ? 'pass' : 'fail') : null,
                };
              } else if (!existing) {
                lessonRecordMap[key] = {
                  hyugangRecordId: null,
                  attendanceStatus: ['정상등원'],
                  lessonRecordId: null,
                  submitted: false,
                  homeworkCheckNote: null,
                  homeworkCheckLessonId: null,
                  hasNextHomework: false,
                  hasPhotoSubmission: false,
                  photoData: null,
                  homeworkStatus: null,
                  latestAssignmentCheckStatus: latestAssignmentCheckStatusMap[`${ts.student_id}:${ts.subject}`] || null,
                  subject: ts.subject,
                  todayTestData: {
                    test_content: ts.content || null,
                    test_title: `${ts.test_type === 'guerrilla' ? '게릴라' : '시험'}`,
                    test_result_text: ts.result_score || (ts.result_passed != null ? (ts.result_passed ? '통과' : '불통과') : null),
                    english_pass_fail: ts.subject === '영어' && ts.result_passed != null ? (ts.result_passed ? 'pass' : 'fail') : null,
                  },
                };
              }
            });
          }
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
            lessonSubmitted: recordInfo?.submitted || false,
            hasNextHomework: recordInfo?.hasNextHomework || false,
            hasPhotoSubmission: recordInfo?.hasPhotoSubmission || false,
            photoData: recordInfo?.photoData || null,
            // TEACHER-HW-ALERT-V2: Add homework check note and previous goal
            homeworkCheckNote: recordInfo?.homeworkCheckNote || null,
            homeworkCheckLessonId: recordInfo?.homeworkCheckLessonId || null,
            prevNextLessonGoal: prevGoalMap[goalKey] || null,
            // HOMEWORK-CHECK-STATUS-SYNC-V1: Add latest previous assignment check status
            latestAssignmentCheckStatus: recordInfo?.latestAssignmentCheckStatus || null,
            // DASH-ROW-TEST-SNIPPET-V1: Add today's test data
            todayTestData: recordInfo?.todayTestData || null,
            // HW-STATUS-SYNC-V1: Pass homework_status from lesson_records
            homeworkStatus: recordInfo?.homeworkStatus || null,
          };
        });
      });

      // SCHEDULE-OVERRIDE-V1: Fetch overrides for today and overrides targeting today
      const todayKST = getTodayKST();
      const scheduleIds = (activeSchedules || []).map((s: any) => s.id).filter(Boolean);
      
      let overridesForToday: ScheduleOverride[] = [];
      let overridesMovedToToday: ScheduleOverride[] = [];
      
      if (scheduleIds.length > 0) {
        // Overrides where original_date = today (these slots should be marked as changed)
        const { data: ov1 } = await (supabase.from('schedule_overrides' as any) as any)
          .select('*')
          .in('schedule_id', scheduleIds)
          .eq('original_date', todayKST);
        overridesForToday = (ov1 || []) as ScheduleOverride[];
      }
      
      // Overrides where new_date = today (these are moved-in slots) - for current teacher only
      const { data: ov2 } = await (supabase.from('schedule_overrides' as any) as any)
        .select('*')
        .eq('new_date', todayKST)
        .eq('override_type', 'moved')
        .eq('teacher_id', user.id);
      overridesMovedToToday = (ov2 || []) as ScheduleOverride[];

      // Build a set of overridden schedule_ids for today
      const overriddenScheduleIds = new Set(overridesForToday.map(o => o.schedule_id));
      const overrideMap = new Map(overridesForToday.map(o => [o.schedule_id, o]));

      // Build slots array from activeSchedules
      const slots: TodaySlot[] = (activeSchedules || []).map((s: any) => {
        const override = overrideMap.get(s.id);
        return {
          id: s.id,
          class_id: s.classes?.id || '',
          class_name: s.classes?.name || '알 수 없음',
          subject: s.classes?.subject || '-',
          start_time: s.start_time,
          end_time: s.end_time,
          students: studentsMap[s.classes?.id] || [],
          isOverridden: !!override,
          overrideType: override?.override_type as 'moved' | 'cancelled' | undefined,
          overrideReason: override?.reason || undefined,
        };
      });

      // Add moved-in slots (from other days moved to today)
      if (overridesMovedToToday.length > 0) {
        // Fetch schedule details for moved-in overrides
        const movedScheduleIds = overridesMovedToToday.map(o => o.schedule_id);
        const { data: movedSchedules } = await supabase
          .from('class_schedules')
          .select('id, class_id, start_time, end_time, teacher_id, classes!inner(id, name, subject)')
          .in('id', movedScheduleIds);
        
        const scheduleDetailMap = new Map((movedSchedules || []).map((s: any) => [s.id, s]));
        
        for (const ov of overridesMovedToToday) {
          const cs = scheduleDetailMap.get(ov.schedule_id) as any;
          if (!cs) continue;
          const cls = cs.classes;
          if (!cls) continue;
          
          slots.push({
            id: `override-${ov.id}`,
            class_id: cls.id,
            class_name: cls.name || '알 수 없음',
            subject: cls.subject || '-',
            start_time: ov.new_start_time || cs.start_time,
            end_time: ov.new_end_time || cs.end_time,
            students: studentsMap[cls.id] || [],
            isMovedIn: true,
            movedFromDate: ov.original_date,
          });
        }
      }

      // Sort slots by start_time
      slots.sort((a, b) => a.start_time.localeCompare(b.start_time));

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

  // SUPPLEMENT-LESSON-V2: Fetch supplementary lessons for today and merge into admin roster
  async function fetchSupplementaryLessons() {
    if (!user) return;
    try {
      const today = getTodayKST();
      const { data, error } = await supabase
        .from('lesson_records')
        .select('id, student_id, class_id, subject, teacher_id, submitted, notes, homework_status, test_content, test_title, test_result_text, english_pass_fail, students:student_id(name), classes:class_id(name)')
        .eq('lesson_date', today)
        .contains('lesson_types', ['보충수업']);

      if (error) {
        console.error('Error fetching supplementary lessons:', error);
        return;
      }

      if (!data || data.length === 0) {
        setSupplementaryLessons([]);
        return;
      }

      // Fetch teacher names
      const teacherIds = [...new Set(data.map((d: any) => d.teacher_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      const teacherNameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { teacherNameMap[p.id] = p.full_name; });

      const lessons: SupplementaryLesson[] = data.map((d: any) => {
        // Extract time from notes: [보충 시간: HH:MM]
        const timeMatch = (d.notes || '').match(/\[보충 시간:\s*(\d{1,2}:\d{2})\]/);
        const startTime = timeMatch ? timeMatch[1] : undefined;
        return {
          id: d.id,
          student_id: d.student_id,
          class_id: d.class_id,
          class_name: (d.classes as any)?.name || '',
          subject: d.subject,
          teacher_id: d.teacher_id,
          teacher_name: teacherNameMap[d.teacher_id] || '알 수 없음',
          student_name: (d.students as any)?.name || '알 수 없음',
          submitted: d.submitted || false,
          start_time: startTime,
        };
      });

      setSupplementaryLessons(lessons);

      // SUPPLEMENT-LESSON-V2: Merge into adminRosterData if admin
      if (isAdmin(role) && lessons.length > 0) {
        setAdminRosterData(prev => {
          if (!prev) return prev;
          // Filter out existing supplementary rows (to avoid duplicates on re-fetch)
          const existingRows = prev.roster_rows.filter((r: any) => !r.isSupplementary);
          const existingTeachers = [...prev.teachers];
          
          const newRows: any[] = [];
          lessons.forEach(sl => {
            // Check if this student+class combo already exists in roster (not a supplement)
            const alreadyInRoster = existingRows.some(r => r.student_id === sl.student_id && r.class_id === sl.class_id);
            if (alreadyInRoster) return; // skip if already in normal roster
            
            // Add teacher if not present
            if (!existingTeachers.some(t => t.teacher_id === sl.teacher_id)) {
              existingTeachers.push({ teacher_id: sl.teacher_id, teacher_name: sl.teacher_name });
            }
            
            newRows.push({
              teacher_id: sl.teacher_id,
              teacher_name: sl.teacher_name,
              student_id: sl.student_id,
              student_name: sl.student_name,
              class_id: sl.class_id || '',
              class_name: sl.class_name,
              subject: sl.subject,
              start_time: sl.start_time ? `${sl.start_time}:00` : '99:99:00', // Sort to end if no time
              end_time: sl.start_time ? `${sl.start_time}:00` : '99:99:00',
              isSupplementary: true,
              supplementaryRecordId: sl.id,
            });
          });
          
          return {
            ...prev,
            teachers: existingTeachers,
            roster_rows: [...existingRows, ...newRows],
          };
        });

        // Also update lessonStatusMap for supplementary students
        setLessonStatusMap(prev => {
          const updated = { ...prev };
          data.forEach((d: any) => {
            const key = `${d.student_id}:${d.class_id}:${d.subject}`;
            if (!updated[key]) {
              const hasTestData = (d.test_content && d.test_content.trim() !== '') || (d.test_title && d.test_title.trim() !== '') || (d.test_result_text && d.test_result_text.trim() !== '');
              updated[key] = {
                submitted: d.submitted || false,
                recordId: d.id,
                homeworkStatus: d.homework_status || null,
                latestAssignmentCheckStatus: null,
                hasNextHomework: false,
                hasPhotoSubmission: false,
                todayTestData: hasTestData ? { test_content: d.test_content || null, test_title: d.test_title || null, test_result_text: d.test_result_text || null, english_pass_fail: d.english_pass_fail || null } : null,
              };
            }
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Error fetching supplementary lessons:', error);
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
      <div className="space-y-6">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="flex gap-2.5">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-40 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
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

  // TEXTBOOK-ARRIVAL-ALERT-V1: Arrived textbook alert
  if (arrivedTextbookCount > 0) {
    attentionItems.push({
      icon: <BookOpen className="w-4 h-4" />,
      label: '교재 입고완료',
      count: arrivedTextbookCount,
      color: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
      onClick: () => navigate('/textbooks'),
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
  
  // TEAM-NOTE-REPLY-NOTIFICATION-V1: Unread reply notification
  if (unreadReplyCount > 0) {
    attentionItems.push({
      icon: <MessageSquare className="w-4 h-4" />,
      label: '새 답글',
      count: unreadReplyCount,
      color: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
      onClick: () => {
        // Scroll to team notes section (at top of dashboard)
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }

  return (
    <div className="space-y-4">
      <DashboardHeader role={role || ''} />
      
      {/* ━━━ 섹션 1: 주의사항 & 시험일정 (2단 배열) ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AttentionSummaryBar items={attentionItems} />
        <ExamDdayBanner />
      </div>

      {/* ━━━ 섹션 2: 핵심 지표 ━━━ */}
      {!isAssistant(role) && (
        <div className="space-y-2">
          <SectionHeader 
            icon={<BarChart3 className="w-4 h-4" />} 
            title="핵심 현황" 
            description="실시간 학원 운영 지표"
          />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {isAdmin(role) && (
              <>
                <StatCard
                  title="전체 학생"
                  value={stats.totalStudents}
                  icon={<Users className="w-4.5 h-4.5" />}
                  iconColor="primary"
                />
                <StatCard
                  title="활성 클래스"
                  value={stats.totalClasses}
                  icon={<BookOpen className="w-4.5 h-4.5" />}
                  iconColor="muted"
                />
              </>
            )}
            <StatCard
              title="이번 주 수업"
              value={stats.lessonsThisWeek}
              icon={<ClipboardList className="w-4.5 h-4.5" />}
              iconColor="success"
            />
            <StatCard
              title="평균 이해도"
              value={stats.avgUnderstanding || '-'}
              subtitle="5점 만점"
              icon={<TrendingUp className="w-4.5 h-4.5" />}
              iconColor="warning"
            />
            {isAdmin(role) && (
              <StatCard
                title="고위험 학생"
                value={stats.highRiskStudents}
                icon={<AlertTriangle className="w-4.5 h-4.5" />}
                iconColor="destructive"
                className={stats.highRiskStudents > 0 ? 'border-red-500/30' : ''}
              />
            )}
          </div>
        </div>
      )}

      {/* ━━━ 숙제 이행률 + 미제출 수업기록 (2단 배열) ━━━ */}
      {!isAssistant(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <HomeworkCompletionChart />
          {isAdmin(role) && totalOverdueDrafts > 0 ? (
            <Card className="border-amber-500/50 bg-amber-500/5 animate-slide-up">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-amber-600 text-sm">
                  <Clock className="w-4 h-4" />
                  미제출 수업기록 ({totalOverdueDrafts}건)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(overdueDrafts || []).map((group) => (
                    <div key={group?.teacher_id || 'unknown'}>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-sm font-semibold text-foreground">{group?.teacher_name || '알 수 없음'}</h4>
                        <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">
                          {group?.count || 0}건
                        </span>
                      </div>
                      <div className="space-y-1">
                        {(group?.drafts || []).map((draft) => (
                          <button
                            key={draft?.id || Math.random()}
                            className="flex items-center justify-between w-full p-2 bg-background hover:bg-accent/50 rounded-md text-sm transition-colors cursor-pointer text-left"
                            onClick={() => {
                              if (!draft) return;
                              setAdminLessonModalContext({
                                student_id: draft.student_id,
                                class_id: draft.class_id || '',
                                subject: draft.subject as any,
                                lesson_date: draft.lesson_date,
                              });
                              setAdminLessonModalRecordId(draft.id);
                              setAdminLessonModalForceNew(false);
                              setAdminLessonModalOpen(true);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <FileEdit className="w-3.5 h-3.5 text-amber-500" />
                              <span className="font-medium">{draft?.student_name || '알 수 없음'}</span>
                              <span className="text-muted-foreground">{draft?.subject || '-'}</span>
                              <span className="text-muted-foreground">
                                {draft?.lesson_date ? format(new Date(draft.lesson_date), 'MM/dd') : '-'}
                              </span>
                            </div>
                            <span className="text-amber-600 font-medium text-xs">
                              {draft?.overdue_hours || 0}시간 경과
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {/* ━━━ 섹션 3: 미제출/출결 이슈 ━━━ */}
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
                              onClick={() => {
                                setAdminLessonModalContext({
                                  student_id: lesson.student_id,
                                  class_id: lesson.class_id || '',
                                  subject: lesson.subject as any,
                                  lesson_date: lesson.lesson_date,
                                });
                                setAdminLessonModalRecordId(lesson.id);
                                setAdminLessonModalForceNew(false);
                                setAdminLessonModalOpen(true);
                              }}
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

      {/* Admin overdue drafts are now shown alongside homework chart above */}

      {/* Admin-only roster removed - consolidated into shared "오늘 수업" below */}

      {/* Fallback section removed - consolidated into shared "오늘 수업" */}

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

      {/* ━━━ 섹션 4: 오늘 수업 로스터 ━━━ */}
      {(isTeacher(role) || isAdmin(role) || isAssistant(role)) && (
        <div className="space-y-2">
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
              <Card className="border-primary/15 shadow-md animate-slide-up overflow-hidden">
                {/* Roster header with accent bar */}
                <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2.5 text-lg">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-primary" />
                    </div>
                    {isAdmin(role) 
                      ? `오늘 수업 — 선생님별`
                      : `오늘 수업`
                    }
                    <Badge variant="secondary" className="text-xs font-bold ml-1">
                      {isAdmin(role) 
                        ? `${adminRosterData?.roster_rows?.length ?? 0}명`
                        : `${todaySlots.length}개`
                      }
                    </Badge>
                    {/* SUPPLEMENT-LESSON-V1: Add supplementary lesson button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => {
                        setAdminLessonModalContext({
                          student_id: '',
                          class_id: '',
                          subject: '',
                          lesson_date: '',
                          lesson_types: ['보충수업'],
                        });
                        setAdminLessonModalRecordId(null);
                        setAdminLessonModalForceNew(true);
                        setAdminLessonModalOpen(true);
                      }}
                    >
                      + 보충수업
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* ===== ADMIN VIEW: grouped by teacher → time slot ===== */}
                  {isAdmin(role) ? (
                    (adminRosterData?.teachers?.length ?? 0) === 0 ? (
                      <div className="text-center py-8">
                        <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                        <p className="text-muted-foreground">오늘 배정된 수업이 없습니다.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {(adminRosterData?.teachers ?? []).map((teacher) => {
                          const teacherRows = (adminRosterData?.roster_rows ?? []).filter(r => r.teacher_id === teacher.teacher_id);
                          if (teacherRows.length === 0) return null;

                          // Group rows by time slot (start_time + class_name)
                          const slotGroups: { key: string; startTime: string; endTime: string; className: string; subject: string; rows: any[] }[] = [];
                          const slotMap = new Map<string, typeof slotGroups[0]>();
                          teacherRows.forEach((row: any) => {
                            const slotKey = `${row.start_time}:${row.class_id}`;
                            if (!slotMap.has(slotKey)) {
                              const group = { key: slotKey, startTime: row.start_time?.slice(0, 5) || '', endTime: row.end_time?.slice(0, 5) || '', className: row.class_name, subject: row.subject, rows: [] as any[] };
                              slotMap.set(slotKey, group);
                              slotGroups.push(group);
                            }
                            slotMap.get(slotKey)!.rows.push(row);
                          });
                          // Sort by start time
                          slotGroups.sort((a, b) => a.startTime.localeCompare(b.startTime));

                          return (
                            <div key={teacher.teacher_id} className="space-y-3">
                              {/* Teacher header */}
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-foreground text-base">{teacher.teacher_name}</h4>
                                <Badge variant="secondary" className="text-xs">{teacherRows.length}명</Badge>
                              </div>

                              {/* Time slot boxes */}
                              {slotGroups.map((slot) => (
                                <div key={slot.key} className="border rounded-lg bg-background overflow-hidden">
                                  {/* Slot header */}
                                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-muted-foreground" />
                                      <span className="font-semibold text-sm">{slot.className}</span>
                                      <Badge variant="outline" className="text-[11px]">{slot.subject}</Badge>
                                      {slot.rows.some((r: any) => r.isSupplementary) && !slot.rows.some((r: any) => !r.isSupplementary) && (
                                        <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-[10px] px-1.5 py-0">보충</Badge>
                                      )}
                                    </div>
                                    {slot.startTime !== '99:99' ? (
                                      <span className="text-sm text-muted-foreground font-medium">{slot.startTime}–{slot.endTime}</span>
                                    ) : (
                                      <span className="text-sm text-muted-foreground font-medium">시간 미정</span>
                                    )}
                                  </div>
                                  {/* Student rows */}
                                  <div className="divide-y divide-border/50">
                                    {slot.rows.map((row: any) => {
                                      const statusKey = `${row.student_id}:${row.class_id}:${row.subject}`;
                                      const ls = lessonStatusMap[statusKey];
                                      const rawHwStatus = (() => {
                                        const hwFromRecord = ls?.homeworkStatus;
                                        const isDefaultDraft = hwFromRecord === 'none_assigned' && !ls?.submitted;
                                        if (hwFromRecord && !isDefaultDraft) return hwFromRecord;
                                        if (ls?.latestAssignmentCheckStatus === 'checked') return 'checked';
                                        if (ls?.latestAssignmentCheckStatus === 'unchecked') return 'unchecked';
                                        return null;
                                      })();
                                      const testState = latestTests.getStudentState(row.student_id);
                                      const isTestExpanded = latestTests.isExpanded(row.student_id);

                                      return (
                                        <div key={`${row.student_id}-${row.class_id}`} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                                          {/* Row 1: Name + Action buttons */}
                                          <div className="flex items-center justify-between gap-3 mb-1.5">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-semibold text-sm text-foreground">{row.student_name}</span>
                                              {row.isSupplementary && (
                                                <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-[10px] px-1.5 py-0">보충</Badge>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                                                onClick={() => latestTests.toggleStudent(row.student_id)}
                                              >
                                                {testState?.loading ? (
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                  <>
                                                    <TestTube2 className="w-3.5 h-3.5" />
                                                    <span className="ml-1">{isTestExpanded ? '접기' : '최근테스트'}</span>
                                                  </>
                                                )}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs px-2.5"
                                                onClick={() => {
                                                  setAdminLessonModalContext({
                                                    student_id: row.student_id,
                                                    class_id: row.class_id,
                                                    subject: row.subject,
                                                    lesson_date: getTodayKST(),
                                                    ...(row.isSupplementary ? { lesson_types: ['보충수업'] } : {}),
                                                  });
                                                  setAdminLessonModalRecordId(row.isSupplementary ? (row.supplementaryRecordId || ls?.recordId || null) : (ls?.recordId || null));
                                                  setAdminLessonModalForceNew(row.isSupplementary ? false : !ls?.recordId);
                                                  setAdminLessonModalOpen(true);
                                                }}
                                              >
                                                <FileEdit className="w-3 h-3" />
                                                <span className="ml-1">일지</span>
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground"
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
                                                    existingRecordId: ls?.recordId || null,
                                                  });
                                                  setRosterActionModalOpen(true);
                                                }}
                                              >
                                                <CheckSquare className="w-3 h-3" />
                                                <span className="ml-1">숙제</span>
                                              </Button>
                                            </div>
                                          </div>

                                          {/* Row 2: Status badges - clean grid layout */}
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {/* 수업일지 상태 */}
                                            {ls?.recordId ? (
                                              ls.submitted ? (
                                                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-success">✓ 일지완료</span>
                                              ) : (
                                                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-warning">◐ 임시저장</span>
                                              )
                                            ) : (
                                              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground">✗ 일지미작성</span>
                                            )}

                                            <span className="text-border">│</span>

                                            {/* 숙제확인 상태 */}
                                            {ls?.recordId ? (
                                              <span className={`inline-flex items-center text-[11px] font-medium ${
                                                (() => {
                                                  const label = getHomeworkStatusLabel(rawHwStatus);
                                                  if (label === '완료') return 'text-success';
                                                  if (label === '확인함') return 'text-success';
                                                  if (label === '미이행') return 'text-destructive';
                                                  if (label === '일부완료') return 'text-warning';
                                                  if (label === '확인요망') return 'text-warning';
                                                  return 'text-muted-foreground';
                                                })()
                                              }`}>
                                                숙제: {getHomeworkStatusLabel(rawHwStatus)}
                                              </span>
                                            ) : (
                                              <span className="text-[11px] text-muted-foreground">숙제: —</span>
                                            )}

                                            <span className="text-border">│</span>

                                            {/* 다음숙제 배정 */}
                                            {ls?.hasNextHomework ? (
                                              <span className="inline-flex items-center text-[11px] font-medium text-success">다음숙제 ✓</span>
                                            ) : ls?.recordId ? (
                                              <span className="inline-flex items-center text-[11px] font-medium text-destructive">다음숙제 ✗</span>
                                            ) : (
                                              <span className="text-[11px] text-muted-foreground">다음숙제: —</span>
                                            )}

                                            {/* 사진보기 */}
                                            {ls?.hasPhotoSubmission && ls.photoData && (
                                              <>
                                                <span className="text-border">│</span>
                                                <button
                                                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPhotoViewHw({
                                                      id: '', student_id: row.student_id, student_name: row.student_name,
                                                      subject: row.subject, content: '', assigned_date: '',
                                                      has_photo_submission: true,
                                                      submission_image_url: ls.photoData!.urls.join(','),
                                                      submission_text: ls.photoData!.text,
                                                      submitted_at: ls.photoData!.at,
                                                    });
                                                  }}
                                                >
                                                  📷 {ls.photoData.urls.length > 1 ? `${ls.photoData.urls.length}장` : '보기'}
                                                </button>
                                              </>
                                            )}
                                          </div>

                                          {/* Row 3: Contextual info (test, goal) */}
                                          {(ls?.todayTestData || ls?.prevNextLessonGoal) && (
                                            <div className="mt-2 space-y-1 pl-3 border-l-2 border-primary/15">
                                              {ls?.todayTestData && (
                                                <div className="text-xs text-muted-foreground">
                                                  <span className="font-semibold text-primary/70">테스트</span>{' '}
                                                  <span>{ls.todayTestData.test_content || ls.todayTestData.test_title || ''}</span>
                                                  {ls.todayTestData.test_result_text && <span className="text-foreground font-medium"> → {ls.todayTestData.test_result_text}</span>}
                                                  {ls.todayTestData.english_pass_fail && (
                                                    <span className={`ml-1 font-semibold ${ls.todayTestData.english_pass_fail === 'pass' ? 'text-success' : 'text-destructive'}`}>
                                                      {ls.todayTestData.english_pass_fail === 'pass' ? '통과' : '불통과'}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                              {ls?.prevNextLessonGoal && (
                                                <div className="text-xs text-muted-foreground">
                                                  <span className="font-semibold text-primary/70">지난목표</span>{' '}
                                                  <span>{ls.prevNextLessonGoal}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Recent test toggle (expanded) */}
                                          {isTestExpanded && testState && !testState.loading && (
                                            <div className="mt-2">
                                              {testState.error ? (
                                                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                                                  {testState.error}
                                                </div>
                                              ) : testState.tests.length === 0 ? (
                                                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                                                  최근 테스트 기록이 없습니다.
                                                </div>
                                              ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs bg-muted/30 p-2.5 rounded-md">
                                                  {testState.tests.map((test) => (
                                                    <div key={test.subject} className="flex items-center gap-2">
                                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">{test.subject}</Badge>
                                                      <span className="text-muted-foreground truncate">{formatTestLine(test)}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    /* ===== TEACHER VIEW: slot-based ===== */
                    todaySlots.length === 0 ? (
                      <div className="text-center py-8">
                        <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                        <p className="text-muted-foreground">오늘 배정된 수업이 없습니다.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(todaySlots || []).map((slot) => (
                          <div key={slot.id} className={`border rounded-lg bg-background overflow-hidden ${slot.isOverridden ? 'opacity-60 border-amber-400/50' : ''} ${slot.isMovedIn ? 'border-blue-400/50 ring-1 ring-blue-400/20' : ''}`}>
                            {/* Slot header */}
                            <div className={`flex items-center justify-between px-4 py-2.5 border-b ${slot.isOverridden ? 'bg-amber-50 dark:bg-amber-900/10' : slot.isMovedIn ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-muted/40'}`}>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span className="font-semibold text-sm">{slot.class_name}</span>
                                <Badge variant="outline" className="text-[11px]">{slot.subject}</Badge>
                                {slot.isOverridden && (
                                  <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
                                    수업일자 변경
                                  </Badge>
                                )}
                                {slot.isMovedIn && (
                                  <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 text-[10px]">
                                    추가수업 ({slot.movedFromDate?.slice(5)}에서 이동)
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground font-medium">
                                  {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                                </span>
                                {!slot.isMovedIn && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
                                    title="수업 일정 변경"
                                    onClick={() => {
                                      setOverrideModalContext({
                                        scheduleId: slot.id,
                                        classId: slot.class_id,
                                        className: slot.class_name,
                                        subject: slot.subject,
                                        teacherId: user?.id || '',
                                        originalDate: getTodayKST(),
                                        originalStartTime: slot.start_time,
                                        originalEndTime: slot.end_time,
                                      });
                                      setOverrideModalOpen(true);
                                    }}
                                  >
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {/* SCHEDULE-OVERRIDE-V1: Show override message if slot is overridden */}
                            {slot.isOverridden && (
                              <div className="px-4 py-3 flex items-center justify-between bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-200/50">
                                <div className="flex items-center gap-2 text-sm text-amber-700">
                                  <ArrowLeftRight className="w-4 h-4 text-amber-500" />
                                  <span className="font-medium">수업일자 변경</span>
                                  {slot.overrideReason && (
                                    <span className="text-xs text-muted-foreground">({slot.overrideReason})</span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                  onClick={async () => {
                                    if (!confirm('일정 변경을 취소하시겠습니까?')) return;
                                    try {
                                      const schedId = slot.id;
                                      const todayKST = getTodayKST();
                                      await (supabase.from('schedule_overrides' as any) as any)
                                        .delete()
                                        .eq('schedule_id', schedId)
                                        .eq('original_date', todayKST);
                                      await fetchTodaySlots();
                                      toast({ title: '변경 취소됨', description: '원래 일정으로 복원되었습니다' });
                                    } catch (err) {
                                      console.error('Error reverting override:', err);
                                    }
                                  }}
                                >
                                  변경 취소
                                </Button>
                              </div>
                            )}
                            {(slot?.students || []).length > 0 ? (
                              <div className="divide-y divide-border/50">
                                {(slot?.students || []).map((student) => {
                                  const testState = latestTests.getStudentState(student.id);
                                  const isTestExpanded = latestTests.isExpanded(student.id);
                                  const rawHwStatus = (() => {
                                    // HW-STATUS-DRAFT-FIX-V1: If record is draft (not submitted) and homework_status is default 'none_assigned', skip to fallback
                                    const hwFromRecord = student.homeworkStatus;
                                    const isDefaultDraft = hwFromRecord === 'none_assigned' && !student.lessonSubmitted;
                                    if (hwFromRecord && !isDefaultDraft) return hwFromRecord;
                                    if (student.latestAssignmentCheckStatus === 'checked') return 'checked';
                                    if (student.latestAssignmentCheckStatus === 'unchecked') return 'unchecked';
                                    // Fallback to RPC result
                                    if (student.previousHomeworkStatus === 'completed') return '완료';
                                    if (student.previousHomeworkStatus === 'partial') return '일부완료';
                                    if (student.previousHomeworkStatus === 'not_done') return '미이행';
                                    if (student.previousHomeworkStatus === 'none_assigned') return '없음';
                                    return null;
                                  })();

                                  if (student.hyugangRecordId) {
                                    return (
                                      <div key={student.id} className="px-4 py-3 bg-muted/30">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-muted-foreground">{student.name}</span>
                                            <Badge variant="secondary" className="text-xs">휴강</Badge>
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs px-2.5"
                                            onClick={() => {
                                              setAdminLessonModalContext({
                                                student_id: student.id,
                                                class_id: slot.class_id,
                                                subject: slot.subject as any,
                                                lesson_date: getTodayKST(),
                                              });
                                              setAdminLessonModalRecordId(student.hyugangRecordId || null);
                                              setAdminLessonModalForceNew(!student.hyugangRecordId);
                                              setAdminLessonModalOpen(true);
                                            }}
                                          >
                                            <FileEdit className="w-3 h-3" />
                                            <span className="ml-1">휴강 기록</span>
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <div key={student.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                                      {/* Row 1: Name + alerts + action buttons */}
                                      <div className="flex items-center justify-between gap-3 mb-1.5">
                                        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                                          <span className="font-semibold text-sm text-foreground">{student.name}</span>
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
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                                            onClick={() => latestTests.toggleStudent(student.id)}
                                          >
                                            {testState?.loading ? (
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                              <>
                                                <TestTube2 className="w-3.5 h-3.5" />
                                                <span className="ml-1">{isTestExpanded ? '접기' : '최근테스트'}</span>
                                              </>
                                            )}
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs px-2.5"
                                            onClick={() => {
                                              const ls = lessonStatusMap[`${student.id}_${slot.class_id}`];
                                              setAdminLessonModalContext({
                                                student_id: student.id,
                                                class_id: slot.class_id,
                                                subject: slot.subject as any,
                                                lesson_date: getTodayKST(),
                                              });
                                              setAdminLessonModalRecordId(ls?.recordId || null);
                                              setAdminLessonModalForceNew(!ls?.recordId);
                                              setAdminLessonModalOpen(true);
                                            }}
                                          >
                                            <FileEdit className="w-3 h-3" />
                                            <span className="ml-1">일지</span>
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                              setRosterActionContext({
                                                date: getTodayKST(),
                                                student_id: student.id,
                                                student_name: student.name,
                                                class_id: slot.class_id,
                                                class_name: slot.class_name,
                                                subject: slot.subject,
                                                teacher_id: user?.id,
                                                teacher_name: '',
                                                start_time: slot.start_time,
                                                existingRecordId: student.lessonRecordId || null,
                                              });
                                              setRosterActionModalOpen(true);
                                            }}
                                          >
                                            <CheckSquare className="w-3 h-3" />
                                            <span className="ml-1">숙제</span>
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Row 2: Status indicators */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {/* 수업일지 상태 */}
                                        {student.lessonRecordId ? (
                                          student.lessonSubmitted ? (
                                            <span className="inline-flex items-center text-[11px] font-medium text-success">✓ 일지완료</span>
                                          ) : (
                                            <span className="inline-flex items-center text-[11px] font-medium text-warning">◐ 임시저장</span>
                                          )
                                        ) : (
                                          <span className="inline-flex items-center text-[11px] font-medium text-muted-foreground">✗ 일지미작성</span>
                                        )}

                                        <span className="text-border">│</span>

                                        {/* 숙제확인 상태 */}
                                        {student.lessonRecordId ? (
                                          <span className={`inline-flex items-center text-[11px] font-medium ${
                                            (() => {
                                              const label = getHomeworkStatusLabel(rawHwStatus);
                                              if (label === '완료') return 'text-success';
                                              if (label === '확인함') return 'text-success';
                                              if (label === '미이행') return 'text-destructive';
                                              if (label === '일부완료') return 'text-warning';
                                              if (label === '확인요망') return 'text-warning';
                                              return 'text-muted-foreground';
                                            })()
                                          }`}>
                                            숙제: {getHomeworkStatusLabel(rawHwStatus)}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground">숙제: —</span>
                                        )}

                                        <span className="text-border">│</span>

                                        {/* 다음숙제 배정 */}
                                        {student.hasNextHomework ? (
                                          <span className="inline-flex items-center text-[11px] font-medium text-success">다음숙제 ✓</span>
                                        ) : student.lessonRecordId ? (
                                          <span className="inline-flex items-center text-[11px] font-medium text-destructive">다음숙제 ✗</span>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground">다음숙제: —</span>
                                        )}

                                        {/* 사진보기 */}
                                        {student.hasPhotoSubmission && student.photoData && (
                                          <>
                                            <span className="text-border">│</span>
                                            <button
                                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setPhotoViewHw({
                                                  id: '', student_id: student.id, student_name: student.name,
                                                  subject: slot.subject, content: '', assigned_date: '',
                                                  has_photo_submission: true,
                                                  submission_image_url: student.photoData!.urls.join(','),
                                                  submission_text: student.photoData!.text,
                                                  submitted_at: student.photoData!.at,
                                                });
                                              }}
                                            >
                                              📷 {student.photoData.urls.length > 1 ? `${student.photoData.urls.length}장` : '보기'}
                                            </button>
                                          </>
                                        )}
                                      </div>

                                      {/* Row 3: Contextual info */}
                                      {(student.todayTestData || student.prevNextLessonGoal) && (
                                        <div className="mt-2 space-y-1 pl-3 border-l-2 border-primary/15">
                                          {student.todayTestData && (
                                            <div className="text-xs text-muted-foreground">
                                              <span className="font-semibold text-primary/70">테스트</span>{' '}
                                              <span>{student.todayTestData.test_content || student.todayTestData.test_title || ''}</span>
                                              {student.todayTestData.test_result_text && <span className="text-foreground font-medium"> → {student.todayTestData.test_result_text}</span>}
                                              {student.todayTestData.english_pass_fail && (
                                                <span className={`ml-1 font-semibold ${student.todayTestData.english_pass_fail === 'pass' ? 'text-success' : 'text-destructive'}`}>
                                                  {student.todayTestData.english_pass_fail === 'pass' ? '통과' : '불통과'}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                          {student.prevNextLessonGoal && (
                                            <div className="text-xs text-muted-foreground">
                                              <span className="font-semibold text-primary/70">지난목표</span>{' '}
                                              <span>{student.prevNextLessonGoal}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Recent test toggle (expanded) */}
                                      {isTestExpanded && testState && !testState.loading && (
                                        <div className="mt-2">
                                          {testState.error ? (
                                            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                                              {testState.error}
                                            </div>
                                          ) : testState.tests.length === 0 ? (
                                            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                                              최근 테스트 기록이 없습니다.
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs bg-muted/30 p-2.5 rounded-md">
                                              {testState.tests.map((test) => (
                                                <div key={test.subject} className="flex items-center gap-2">
                                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">{test.subject}</Badge>
                                                  <span className="text-muted-foreground truncate">{formatTestLine(test)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="px-4 py-4">
                                <p className="text-sm text-muted-foreground">배정된 학생이 없습니다</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {/* SUPPLEMENT-LESSON-V2: Supplementary lessons are now merged into roster slots above */}
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* ━━━ 섹션 5: 도구 & 분석 ━━━ */}
      {(isAdmin(role) || isTeacher(role)) && (
        <div className="space-y-3">
          <SectionHeader 
            icon={<Wrench className="w-4 h-4" />}
            title="도구 & 분석" 
            description="숙제 관리, 요청, 학습 분석"
          />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AssistantRequestsWidget />
            <div className="flex items-end">
              <DailyHomeworkManager />
            </div>
          </div>
          
          <StudentProgressWidget />
        </div>
      )}

      {/* ━━━ 섹션 6: 학원 관리 (Admin only) ━━━ */}
      {isAdmin(role) && (
        <div className="space-y-3 pt-1">
          <SectionHeader 
            icon={<Settings2 className="w-4 h-4" />}
            title="학원 관리" 
            description="통계, 휴강, 시간표 관리"
          />
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
          await Promise.all([
            fetchAdminRosterData(),
            fetchTodaySlots(),
            fetchSupplementaryLessons(),
          ]);
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
          await Promise.all([
            fetchAdminRosterData(),
            fetchTodaySlots(),
            fetchSupplementaryLessons(),
          ]);
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

      {/* Photo Viewer Dialog */}
      {photoViewHw && (
        <Dialog open={!!photoViewHw} onOpenChange={(open) => { if (!open) setPhotoViewHw(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {photoViewHw.student_name} - {photoViewHw.subject} 숙제 사진
              </DialogTitle>
            </DialogHeader>
            <SubmissionImageCarousel
              images={photoViewHw.submission_image_url?.split(',').map(u => u.trim()).filter(Boolean) || []}
              submittedAt={photoViewHw.submitted_at}
              note={photoViewHw.submission_text}
            />
          </DialogContent>
        </Dialog>
      )}
      {/* SCHEDULE-OVERRIDE-V1: Schedule Override Modal */}
      {overrideModalContext && (
        <ScheduleOverrideModal
          open={overrideModalOpen}
          onOpenChange={setOverrideModalOpen}
          scheduleId={overrideModalContext.scheduleId}
          classId={overrideModalContext.classId}
          className={overrideModalContext.className}
          subject={overrideModalContext.subject}
          teacherId={overrideModalContext.teacherId}
          originalDate={overrideModalContext.originalDate}
          originalStartTime={overrideModalContext.originalStartTime}
          originalEndTime={overrideModalContext.originalEndTime}
          onSuccess={async () => {
            await fetchTodaySlots();
            if (isAdmin(role)) await fetchAdminRosterData();
          }}
        />
      )}
    </div>
  );
}
