import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  BookOpen, 
  ClipboardList, 
  AlertTriangle, 
  TrendingUp, 
  Calendar,
  Clock,
  FileEdit,
  CheckSquare
} from 'lucide-react';
import { format, subDays } from 'date-fns';

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

export default function Dashboard() {
  const { role, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalClasses: 0,
    lessonsThisWeek: 0,
    avgUnderstanding: 0,
    highRiskStudents: 0,
  });
  const [recentLessons, setRecentLessons] = useState<RecentLesson[]>([]);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [overdueDrafts, setOverdueDrafts] = useState<GroupedOverdueDrafts[]>([]);
  const [pendingHomework, setPendingHomework] = useState<PendingHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) return;

      try {
        const weekAgo = subDays(new Date(), 7);
        const tenDaysAgo = subDays(new Date(), 10);

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

        if (role === 'teacher') {
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

        if (role === 'teacher') {
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

        // Fetch overdue drafts for admin
        if (role === 'admin') {
          await fetchOverdueDrafts();
        }

        // Fetch pending homework (unchecked within last 10 days)
        // RLS handles teacher filtering automatically
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
          .gte('assigned_date', format(tenDaysAgo, 'yyyy-MM-dd'))
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
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const totalOverdueDrafts = overdueDrafts.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">대시보드</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'admin' 
            ? '학원 전체 현황을 한눈에 확인하세요' 
            : '나의 수업 현황'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {role === 'admin' && (
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
        {role === 'admin' && (
          <StatCard
            title="고위험 학생"
            value={stats.highRiskStudents}
            icon={<AlertTriangle className="w-6 h-6" />}
            className={stats.highRiskStudents > 0 ? 'border-destructive/30' : ''}
          />
        )}
      </div>

      {/* Overdue Drafts Section - Admin Only */}
      {role === 'admin' && totalOverdueDrafts > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              24시간 이상 미제출 수업기록 ({totalOverdueDrafts}건)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {overdueDrafts.map((group) => (
                <div key={group.teacher_id} className="border rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-foreground">{group.teacher_name}</h4>
                    <span className="text-sm bg-amber-500/10 text-amber-600 px-2 py-1 rounded-full">
                      {group.count}건 미제출
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="flex items-center justify-between p-2 bg-secondary/50 rounded-md text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <FileEdit className="w-4 h-4 text-amber-500" />
                          <span className="font-medium">{draft.student_name}</span>
                          <span className="text-muted-foreground">{draft.subject || '-'}</span>
                          <span className="text-muted-foreground">
                            {draft.lesson_date ? format(new Date(draft.lesson_date), 'MM/dd') : '-'}
                          </span>
                        </div>
                        <span className="text-amber-600 font-medium">
                          {draft.overdue_hours}시간 경과
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
              {pendingHomework.map((hw) => (
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

      {/* Content Grid */}
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
                {recentLessons.map((lesson) => (
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
        {role === 'admin' && (
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
                  {atRiskStudents.map((student) => (
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
    </div>
  );
}
