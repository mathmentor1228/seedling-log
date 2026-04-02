// MATH-QUESTION-ANALYTICS-V1: Analytics dashboard for 수학질문방
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  MessageCircle, Clock, Users, TrendingUp, BookOpen, CheckCircle2, AlertTriangle, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays, differenceInMinutes, differenceInHours } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface Question {
  id: string;
  student_id: string;
  grade: string;
  subject: string;
  status: string;
  created_at: string;
  date: string;
  view_count: number;
  is_shared: boolean;
  title: string;
}

interface Answer {
  id: string;
  question_id: string;
  teacher_id: string;
  answer_type: string;
  created_at: string;
}

interface StudentInfo {
  id: string;
  name: string;
}

interface TeacherInfo {
  id: string;
  full_name: string;
}

const SUBJECT_COLORS: Record<string, string> = {
  '수학I': 'hsl(220, 70%, 55%)',
  '수학II': 'hsl(180, 60%, 45%)',
  '미적분': 'hsl(340, 65%, 50%)',
  '확통': 'hsl(45, 80%, 50%)',
  '기하': 'hsl(130, 50%, 45%)',
};

const STATUS_COLORS: Record<string, string> = {
  '대기중': 'hsl(45, 90%, 55%)',
  '답변완료': 'hsl(145, 60%, 45%)',
  '힌트제공': 'hsl(210, 70%, 55%)',
  '공유됨': 'hsl(280, 60%, 55%)',
};

const GRADE_COLORS = ['hsl(220, 70%, 55%)', 'hsl(340, 65%, 50%)', 'hsl(130, 50%, 45%)', 'hsl(45, 80%, 50%)'];

export default function MathQuestionAnalytics() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '14' | '30'>('14');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    const since = format(subDays(new Date(), parseInt(period)), 'yyyy-MM-dd');

    const [qRes, aRes, sRes, tRes] = await Promise.all([
      supabase.from('math_questions').select('id, student_id, grade, subject, status, created_at, date, view_count, is_shared, title').gte('date', since).order('created_at', { ascending: false }),
      supabase.from('math_answers').select('id, question_id, teacher_id, answer_type, created_at').gte('created_at', since + 'T00:00:00'),
      supabase.from('students').select('id, name').eq('enrollment_status', '재학'),
      supabase.from('profiles').select('id, full_name'),
    ]);

    setQuestions((qRes.data as Question[]) || []);
    setAnswers((aRes.data as Answer[]) || []);
    setStudents((sRes.data as StudentInfo[]) || []);
    setTeachers((tRes.data as TeacherInfo[]) || []);
    setLoading(false);
  };

  // --- Computed analytics ---
  const stats = useMemo(() => {
    const totalQ = questions.length;
    const pending = questions.filter(q => q.status === '대기중').length;
    const answered = questions.filter(q => q.status === '답변완료').length;
    const hinted = questions.filter(q => q.status === '힌트제공').length;
    const shared = questions.filter(q => q.is_shared).length;
    const totalViews = questions.reduce((s, q) => s + (q.view_count || 0), 0);

    // Unique students who asked
    const uniqueStudents = new Set(questions.map(q => q.student_id)).size;

    // Response time: for answered questions, find earliest answer
    const responseTimes: number[] = [];
    const answeredQuestions = questions.filter(q => q.status !== '대기중');
    for (const q of answeredQuestions) {
      const firstAnswer = answers
        .filter(a => a.question_id === q.id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
      if (firstAnswer) {
        const mins = differenceInMinutes(new Date(firstAnswer.created_at), new Date(q.created_at));
        if (mins >= 0) responseTimes.push(mins);
      }
    }
    const avgResponseMin = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
      : 0;
    const responseRate = totalQ > 0 ? Math.round(((answered + hinted + shared) / totalQ) * 100) : 0;

    return { totalQ, pending, answered, hinted, shared, totalViews, uniqueStudents, avgResponseMin, responseRate };
  }, [questions, answers]);

  // Subject distribution (pie)
  const subjectData = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach(q => { map[q.subject] = (map[q.subject] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [questions]);

  // Grade distribution (pie)
  const gradeData = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach(q => { map[q.grade] = (map[q.grade] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [questions]);

  // Daily question count (line chart)
  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; questions: number; answers: number }> = {};
    const days = parseInt(period);
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      map[d] = { date: d, questions: 0, answers: 0 };
    }
    questions.forEach(q => { if (map[q.date]) map[q.date].questions++; });
    answers.forEach(a => {
      const d = format(new Date(a.created_at), 'yyyy-MM-dd');
      if (map[d]) map[d].answers++;
    });
    return Object.values(map).map(v => ({
      ...v,
      label: format(new Date(v.date), 'M/d', { locale: ko }),
    }));
  }, [questions, answers, period]);

  // Top students by question count
  const topStudents = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach(q => { map[q.student_id] = (map[q.student_id] || 0) + 1; });
    return Object.entries(map)
      .map(([id, count]) => ({
        name: students.find(s => s.id === id)?.name || '알 수 없음',
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [questions, students]);

  // Teacher response stats
  const teacherStats = useMemo(() => {
    const map: Record<string, { count: number; totalTime: number; timeEntries: number }> = {};
    answers.forEach(a => {
      if (!map[a.teacher_id]) map[a.teacher_id] = { count: 0, totalTime: 0, timeEntries: 0 };
      map[a.teacher_id].count++;
      const q = questions.find(q2 => q2.id === a.question_id);
      if (q) {
        const mins = differenceInMinutes(new Date(a.created_at), new Date(q.created_at));
        if (mins >= 0) {
          map[a.teacher_id].totalTime += mins;
          map[a.teacher_id].timeEntries++;
        }
      }
    });
    return Object.entries(map).map(([id, data]) => ({
      name: teachers.find(t => t.id === id)?.full_name || '알 수 없음',
      answers: data.count,
      avgMinutes: data.timeEntries > 0 ? Math.round(data.totalTime / data.timeEntries) : 0,
    })).sort((a, b) => b.answers - a.answers);
  }, [answers, questions, teachers]);

  // Answer type distribution
  const answerTypeData = useMemo(() => {
    const map: Record<string, number> = {};
    answers.forEach(a => { map[a.answer_type] = (map[a.answer_type] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [answers]);

  const formatResponseTime = (mins: number) => {
    if (mins < 60) return `${mins}분`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          수학질문방 분석
        </h3>
        <Select value={period} onValueChange={(v) => setPeriod(v as '7' | '14' | '30')}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">최근 7일</SelectItem>
            <SelectItem value="14">최근 14일</SelectItem>
            <SelectItem value="30">최근 30일</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="총 질문"
          value={stats.totalQ}
          icon={<MessageCircle className="w-5 h-5" />}
          iconColor="primary"
          subtitle={`대기중 ${stats.pending}건`}
        />
        <StatCard
          title="답변율"
          value={`${stats.responseRate}%`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconColor="success"
          subtitle={`${stats.answered + stats.hinted}건 답변`}
        />
        <StatCard
          title="평균 응답시간"
          value={formatResponseTime(stats.avgResponseMin)}
          icon={<Clock className="w-5 h-5" />}
          iconColor="warning"
          subtitle="첫 답변까지"
        />
        <StatCard
          title="참여 학생"
          value={stats.uniqueStudents}
          icon={<Users className="w-5 h-5" />}
          iconColor="muted"
          subtitle={`조회 ${stats.totalViews}회`}
        />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            일별 질문·답변 추이
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={28} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="questions" name="질문" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="answers" name="답변" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Subject distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">📐 과목별 질문 분포</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            {subjectData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={subjectData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {subjectData.map((entry) => (
                      <Cell key={entry.name} fill={SUBJECT_COLORS[entry.name] || 'hsl(var(--muted))'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-8">데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* Grade distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">🎓 학년별 분포</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            {gradeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={gradeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {gradeData.map((_, i) => (
                      <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-8">데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* Answer type distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">💬 답변 유형 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {answerTypeData.length > 0 ? (
              <div className="space-y-2 pt-2">
                {answerTypeData.map(d => {
                  const total = answerTypeData.reduce((s, v) => s + v.value, 0);
                  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="text-xs w-16 text-muted-foreground shrink-0">{d.name}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-10 text-right">{d.value}건</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8">데이터 없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Top students & Teacher stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Student engagement */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">🏆 학생별 질문 수 TOP 8</CardTitle>
          </CardHeader>
          <CardContent>
            {topStudents.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topStudents} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" name="질문 수" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-8">데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* Teacher response stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">👩‍🏫 선생님 응답 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {teacherStats.length > 0 ? (
              <div className="space-y-3 pt-1">
                {teacherStats.map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/50 border border-border">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">답변 {t.answers}건</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-[10px]">
                        평균 {formatResponseTime(t.avgMinutes)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8">답변 데이터 없음</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
