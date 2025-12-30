import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BookOpen, ClipboardList, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { format, subDays } from 'date-fns';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) return;

      try {
        const weekAgo = subDays(new Date(), 7);

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
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user, role]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'admin' 
            ? 'Overview of your academy performance' 
            : 'Your teaching overview'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {role === 'admin' && (
          <>
            <StatCard
              title="Total Students"
              value={stats.totalStudents}
              icon={<Users className="w-6 h-6" />}
            />
            <StatCard
              title="Active Classes"
              value={stats.totalClasses}
              icon={<BookOpen className="w-6 h-6" />}
            />
          </>
        )}
        <StatCard
          title="Lessons This Week"
          value={stats.lessonsThisWeek}
          icon={<ClipboardList className="w-6 h-6" />}
        />
        <StatCard
          title="Avg Understanding"
          value={stats.avgUnderstanding || '-'}
          subtitle="Out of 5"
          icon={<TrendingUp className="w-6 h-6" />}
        />
        {role === 'admin' && (
          <StatCard
            title="High Risk Students"
            value={stats.highRiskStudents}
            icon={<AlertTriangle className="w-6 h-6" />}
            className={stats.highRiskStudents > 0 ? 'border-risk-high/30' : ''}
          />
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Lessons */}
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Recent Lessons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLessons.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No recent lessons</p>
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
                        {lesson.subject} • {format(new Date(lesson.lesson_date), 'MMM d, yyyy')}
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
                <AlertTriangle className="w-5 h-5 text-warning" />
                Students Needing Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {atRiskStudents.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No at-risk students identified
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
                          Avg Score: {student.avg_score.toFixed(1)}
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
