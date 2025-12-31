import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdmin, isTeacher, isAssistant } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
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
  GraduationCap
} from 'lucide-react';
import { format, subDays, startOfDay, getDay } from 'date-fns';

interface PendingHomework {
  id: string;
  student_id: string;
  student_name: string;
  subject: string;
  content: string;
  assigned_date: string;
}

interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  lessonsThisWeek: number;
  avgUnderstanding: number;
  highRiskStudents: number;
}

interface RecentLesson {
  id: string;
  student_name: string;
  subject: string;
  understanding_score: number;
  lesson_date: string;
}

interface AtRiskStudent {
  id: string;
  name: string;
  risk_level: 'low' | 'medium' | 'high';
  avg_score: number;
}

interface OverdueDraft {
  id: string;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  student_name: string;
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

interface TodaySlotStudent {
  id: string;
  name: string;
  previousHomeworkStatus?: 'completed' | 'partial' | 'not_done' | 'none_assigned' | null;
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

interface TodaySlotsDebug {
  dayOfWeek: number;
  slotsCount: number;
  classIdsCount: number;
  totalStudents: number;
  fetchError: string | null;
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

// Helper function to render previous homework status badge
function getPreviousHomeworkBadge(status: TodaySlotStudent['previousHomeworkStatus']) {
  if (!status || status === 'completed' || status === 'none_assigned') return null;
  
  if (status === 'not_done') {
    return (
      <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">
        지난 숙제 미이행
      </Badge>
    );
  }
  
  if (status === 'partial') {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
        지난 숙제 일부완료
      </Badge>
    );
  }
  
  return null;
}

interface HwBadgeDebug {
  pairsCount: number;
  rpcRowsCount: number;
  firstRow: any;
}

export default function Dashboard() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalClasses: 0,
    lessonsThisWeek: 0,
    avgUnderstanding: 0,
    highRiskStudents: 0,
  });
  const [recentLessons, setRecentLessons] = useState<RecentLesson[]>([]);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [todaySlots, setTodaySlots] = useState<TodaySlot[]>([]);
  const [todaySlotsDebug, setTodaySlotsDebug] = useState<TodaySlotsDebug | null>(null);
  const [hwBadgeDebug, setHwBadgeDebug] = useState<HwBadgeDebug | null>(null);
  const [overdueDrafts, setOverdueDrafts] = useState<GroupedOverdueDrafts[]>([]);
  const [pendingHomework, setPendingHomework] = useState<PendingHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

          // Fetch recent lessons with student names
          let recentQuery = supabase
            .from('lesson_records')
            .select(`
              id,
              subject,
              understanding_score,
              lesson_date,
              students:student_id (name)
            `)
            .order('lesson_date', { ascending: false })
            .limit(5);

          // Teachers only see their own recent lessons
          if (isTeacher(role)) {
            recentQuery = recentQuery.eq('teacher_id', user.id);
          }

          const { data: recentData } = await recentQuery;

          // Fetch weekly reports for at-risk students
          const { data: reportsData } = await supabase
            .from('weekly_reports')
            .select(`
              id,
              risk_level,
              avg_understanding,
              students:student_id (id, name)
            `)
            .in('risk_level', ['medium', 'high'])
            .order('generated_at', { ascending: false })
            .limit(5);

          const highRisk = reportsData?.filter(r => r.risk_level === 'high').length || 0;

          setStats({
            totalStudents: studentsCount || 0,
            totalClasses: classesCount || 0,
            lessonsThisWeek: lessonsCount || 0,
            avgUnderstanding: Math.round(avgScore * 10) / 10,
            highRiskStudents: highRisk,
          });

          setRecentLessons(
            (recentData || []).map((l: any) => ({
              id: l.id,
              student_name: l.students?.name || 'Unknown',
              subject: l.subject,
              understanding_score: l.understanding_score,
              lesson_date: l.lesson_date,
            }))
          );

          setAtRiskStudents(
            (reportsData || []).map((r: any) => ({
              id: r.students?.id || r.id,
              name: r.students?.name || 'Unknown',
              risk_level: r.risk_level as 'low' | 'medium' | 'high',
              avg_score: Number(r.avg_understanding) || 0,
            }))
          );

          // Fetch overdue drafts for admin only
          if (isAdmin(role)) {
            await fetchOverdueDrafts();
          }
        }

        // Fetch today's slots for teacher - ALWAYS run for teachers regardless of isAssistant check
        if (isTeacher(role)) {
          await fetchTodaySlots();
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

  async function fetchTodaySlots() {
    if (!user) {
      console.error('fetchTodaySlots: No user found');
      setTodaySlotsDebug({
        dayOfWeek: -1,
        slotsCount: 0,
        classIdsCount: 0,
        totalStudents: 0,
        fetchError: 'No user',
      });
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

      // Fetch class schedules for today for this teacher
      const { data: schedules, error: schedulesError } = await supabase
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
        .eq('teacher_id', user.id)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time', { ascending: true });

      if (schedulesError) {
        console.error('Error fetching today slots:', schedulesError);
        toast({
          title: '데이터 로드 오류',
          description: '오늘 수업 정보를 불러오는 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        setTodaySlotsDebug({
          dayOfWeek,
          slotsCount: 0,
          classIdsCount: 0,
          totalStudents: 0,
          fetchError: schedulesError.message,
        });
        return;
      }

      console.log('fetchTodaySlots: schedules returned =', schedules?.length || 0, schedules);

      // Get students for each class
      const classIds = schedules?.map(s => (s.classes as any)?.id).filter(Boolean) || [];
      
      let studentsMap: Record<string, TodaySlotStudent[]> = {};
      let allStudentClassPairs: { studentId: string; classId: string }[] = [];
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
              allStudentClassPairs.push({ studentId: cs.students.id, classId: cs.class_id });
              totalStudentsCount++;
            }
          });
        }
      }

      // Batch fetch previous homework status via RPC
      const today = format(new Date(), 'yyyy-MM-dd');
      
      let previousHomeworkMap: Record<string, TodaySlotStudent['previousHomeworkStatus']> = {}; // key: `${studentId}:${classId}`
      let hwBadgeDebug = { pairsCount: 0, rpcRowsCount: 0, firstRow: null as any };
      
      if (allStudentClassPairs.length > 0) {
        const pairs = allStudentClassPairs.map(p => ({
          student_id: p.studentId,
          class_id: p.classId,
        }));
        
        hwBadgeDebug.pairsCount = pairs.length;
        console.log('[HW_BADGE] pairs count', pairs.length);
        console.log('[HW_BADGE] pairs sample', pairs.slice(0, 3));
        
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'get_prev_homework_status_for_roster',
          { _pairs: pairs, _today: today }
        );

        console.log('[HW_BADGE] rpc error', rpcError);
        console.log('[HW_BADGE] rpc rows', rpcResult?.length, (rpcResult as any[])?.slice(0, 5));

        if (!rpcError && rpcResult) {
          hwBadgeDebug.rpcRowsCount = (rpcResult as any[]).length;
          if ((rpcResult as any[]).length > 0) {
            hwBadgeDebug.firstRow = (rpcResult as any[])[0];
          }
          (rpcResult as any[]).forEach((row: any) => {
            const key = `${row.student_id}:${row.class_id}`;
            previousHomeworkMap[key] = normalizeHomeworkStatus(row.homework_status);
            console.log('[HW_BADGE] mapped', key, row.homework_status, '->', previousHomeworkMap[key]);
          });
        }
      }

      // Update studentsMap with previousHomeworkStatus
      Object.keys(studentsMap).forEach(classId => {
        studentsMap[classId] = studentsMap[classId].map(student => {
          const key = `${student.id}:${classId}`;
          const status = previousHomeworkMap[key] || null;
          return {
            ...student,
            previousHomeworkStatus: status,
          };
        });
      });
      
      // Store debug info for display
      setHwBadgeDebug(hwBadgeDebug);

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
      setTodaySlotsDebug({
        dayOfWeek,
        slotsCount: slots.length,
        classIdsCount: classIds.length,
        totalStudents: totalStudentsCount,
        fetchError: null,
      });
    } catch (error: any) {
      console.error('Error fetching today slots:', error);
      toast({
        title: '데이터 로드 오류',
        description: '오늘 수업 정보를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      setTodaySlotsDebug({
        dayOfWeek: -1,
        slotsCount: 0,
        classIdsCount: 0,
        totalStudents: 0,
        fetchError: error?.message || 'Unknown error',
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

  return (
    <div className="space-y-8">
      {/* UNCONDITIONAL LOGIN REDIRECT VERIFICATION - renders for ALL roles */}
      <div className="text-xs text-white bg-destructive p-2 rounded border border-destructive font-bold">
        LOGIN-REDIRECT-CHECK-V2
      </div>
      
      {/* Role-specific debug markers */}
      {isAdmin(role) && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border border-border">
          DASHBOARD-MARKER-ADMIN-V3
        </div>
      )}
      {isTeacher(role) && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border border-border">
          DASHBOARD-MARKER-TEACHER-V3
        </div>
      )}
      
      <div>
        <h1 className="text-2xl font-bold text-foreground">대시보드</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin(role) 
            ? '학원 전체 현황을 한눈에 확인하세요' 
            : isAssistant(role)
            ? '숙제 확인 현황'
            : '나의 수업 현황'}
        </p>
        {/* Debug info for teacher */}
        {isTeacher(role) && (
          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
            <p>role: {role}, uid: {user?.id}</p>
          </div>
        )}
      </div>

      {/* Stats Grid - Visible for admin and teacher */}
      {!isAssistant(role) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {isAdmin(role) && (
            <>
              <StatCard
                title="전체 학생"
                value={stats.totalStudents}
                icon={<Users className="w-6 h-6" />}
              />
              <StatCard
                title="활성 클래스"
                value={stats.totalClasses}
                icon={<BookOpen className="w-6 h-6" />}
              />
            </>
          )}
          <StatCard
            title="이번 주 수업"
            value={stats.lessonsThisWeek}
            icon={<ClipboardList className="w-6 h-6" />}
          />
          <StatCard
            title="평균 이해도"
            value={stats.avgUnderstanding || '-'}
            subtitle="5점 만점"
            icon={<TrendingUp className="w-6 h-6" />}
          />
          {isAdmin(role) && (
            <StatCard
              title="고위험 학생"
              value={stats.highRiskStudents}
              icon={<AlertTriangle className="w-6 h-6" />}
              className={stats.highRiskStudents > 0 ? 'border-destructive/30' : ''}
            />
          )}
        </div>
      )}

      {/* Overdue Drafts Section - Admin Only */}
      {isAdmin(role) && totalOverdueDrafts > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              24시간 이상 미제출 수업기록 ({totalOverdueDrafts}건)
            </CardTitle>
          </CardHeader>
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
        </Card>
      )}

      {/* Today's Classes Section - Teacher Only (PRIMARY SECTION) - ALWAYS RENDER */}
      {isTeacher(role) && (
        <Card className="border-primary/30 bg-primary/5 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              오늘 수업 ({todaySlots.length}개)
            </CardTitle>
            {/* Debug info for teacher - temporary */}
            {todaySlotsDebug && (
              <p className="text-xs text-muted-foreground mt-1">
                [DEBUG] dayOfWeek(KST): {todaySlotsDebug.dayOfWeek}, slots: {todaySlotsDebug.slotsCount}, class_ids: {todaySlotsDebug.classIdsCount}, roster_students: {todaySlotsDebug.totalStudents}
                {todaySlotsDebug.fetchError && <span className="text-destructive"> | error: {todaySlotsDebug.fetchError}</span>}
              </p>
            )}
            {/* HW Badge Debug Line */}
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-1 rounded mt-1">
              HW_BADGE_DEBUG: pairs={hwBadgeDebug?.pairsCount ?? 'N/A'}, rpcRows={hwBadgeDebug?.rpcRowsCount ?? 'N/A'}
              {hwBadgeDebug?.firstRow && (
                <span> | first={hwBadgeDebug.firstRow.student_id?.slice(0,8)}:{hwBadgeDebug.firstRow.class_id?.slice(0,8)} status={hwBadgeDebug.firstRow.homework_status}</span>
              )}
            </p>
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
                        {(slot?.students || []).map((student) => (
                          <div 
                            key={student.id} 
                            className="flex items-center justify-between p-2 bg-secondary/50 rounded-md"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{student.name}</span>
                              {getPreviousHomeworkBadge(student.previousHomeworkStatus)}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/lessons?student_id=${student.id}&class_id=${slot.class_id}&subject=${encodeURIComponent(slot.subject)}&lesson_date=${format(new Date(), 'yyyy-MM-dd')}`)}
                              >
                                <FileEdit className="w-3.5 h-3.5 mr-1" />
                                수업기록
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/lessons?student_id=${student.id}&class_id=${slot.class_id}&subject=${encodeURIComponent(slot.subject)}&lesson_date=${format(new Date(), 'yyyy-MM-dd')}&focus=test`)}
                              >
                                <CheckSquare className="w-3.5 h-3.5 mr-1" />
                                숙제/테스트
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

      {/* Pending Homework Section */}
      {pendingHomework.length > 0 && (
        <Card className="border-blue-500/50 bg-blue-500/5 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <CheckSquare className="w-5 h-5" />
              숙제 확인 대기 ({pendingHomework.length}건)
            </CardTitle>
          </CardHeader>
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
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(hw.assigned_date), 'MM/dd')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{hw.content}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-3 shrink-0"
                    onClick={() => navigate(`/lessons?student_id=${hw.student_id}&subject=${encodeURIComponent(hw.subject)}`)}
                  >
                    확인하기
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Grid - Visible for admin and teacher */}
      {!isAssistant(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Lessons */}
          <Card className="animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                최근 수업
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentLessons.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">최근 수업이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {(recentLessons || []).map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-foreground">{lesson.student_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {lesson.subject} • {format(new Date(lesson.lesson_date), 'MM/dd')}
                        </p>
                      </div>
                      <ScoreBadge score={lesson.understanding_score} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* At Risk Students - Admin Only */}
          {isAdmin(role) && (
            <Card className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  주의가 필요한 학생
                </CardTitle>
              </CardHeader>
              <CardContent>
                {atRiskStudents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    위험 학생이 없습니다
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(atRiskStudents || []).map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-foreground">{student.name}</p>
                          <p className="text-sm text-muted-foreground">
                            평균 점수: {student.avg_score.toFixed(1)}
                          </p>
                        </div>
                        <RiskBadge level={student.risk_level} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
