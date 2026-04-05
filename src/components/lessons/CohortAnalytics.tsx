// COHORT-ANALYTICS-V1: Grade/subject level student trend analysis
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Users, BarChart3, BookOpen, TestTube } from 'lucide-react';
import { SUBJECTS } from './constants';

const SCHOOL_LEVELS = ['전체', '초등', '중등', '고등'];
const SCHOOL_LEVEL_MAP: Record<string, string> = { '초': '초등', '중': '중등', '고': '고등' };

interface StudentWithRecords {
  id: string;
  name: string;
  grade: string | null;
  school_level: string | null;
  grade_year: number | null;
}

export function CohortAnalytics() {
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const isTeacherRole = checkIsTeacher(role);

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentWithRecords[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [levelFilter, setLevelFilter] = useState('전체');
  const [subjectFilter, setSubjectFilter] = useState('전체');
  const [activeTab, setActiveTab] = useState('understanding');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const sixMonthsAgo = format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd');

      let studentQuery = supabase
        .from('students')
        .select('id, name, grade, school_level, grade_year')
        .neq('enrollment_status', '퇴원');

      if (isTeacherRole && !isAdmin) {
        const { data: links } = await supabase
          .from('class_students')
          .select('student_id, classes!inner(teacher_id)')
          .eq('classes.teacher_id', user.id);
        const ids = [...new Set((links || []).map((l: any) => l.student_id))];
        if (ids.length > 0) {
          studentQuery = studentQuery.in('id', ids);
        } else {
          setStudents([]);
          setLessons([]);
          setLoading(false);
          return;
        }
      }

      const { data: studentsData } = await studentQuery.order('name');
      setStudents(studentsData || []);

      const studentIds = (studentsData || []).map((s: any) => s.id);
      if (studentIds.length === 0) {
        setLessons([]);
        setLoading(false);
        return;
      }

      // Fetch lessons in batches of 50 students
      const allLessons: any[] = [];
      for (let i = 0; i < studentIds.length; i += 50) {
        const batch = studentIds.slice(i, i + 50);
        const { data } = await supabase
          .from('lesson_records')
          .select('student_id, lesson_date, subject, understanding_score, homework_status, test_result_text, english_pass_fail, test_result, test_content, lesson_range')
          .in('student_id', batch)
          .eq('submitted', true)
          .gte('lesson_date', sixMonthsAgo)
          .order('lesson_date', { ascending: false });
        if (data) allLessons.push(...data);
      }
      setLessons(allLessons);
      setLoading(false);
    })();
  }, [user, isAdmin, isTeacherRole]);

  // Filter students by level
  const filteredStudents = useMemo(() => {
    if (levelFilter === '전체') return students;
    return students.filter(s => {
      const mapped = s.school_level ? SCHOOL_LEVEL_MAP[s.school_level] : null;
      return mapped === levelFilter;
    });
  }, [students, levelFilter]);

  const filteredStudentIds = useMemo(() => new Set(filteredStudents.map(s => s.id)), [filteredStudents]);

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return lessons.filter(l => {
      if (!filteredStudentIds.has(l.student_id)) return false;
      if (subjectFilter !== '전체' && l.subject !== subjectFilter) return false;
      return true;
    });
  }, [lessons, filteredStudentIds, subjectFilter]);

  // Monthly understanding avg by grade group
  const monthlyUnderstanding = useMemo(() => {
    const map: Record<string, Record<string, { scores: number[]; count: number }>> = {};
    filteredLessons.forEach(l => {
      if (l.understanding_score == null) return;
      const month = l.lesson_date?.slice(0, 7);
      if (!month) return;
      if (!map[month]) map[month] = {};

      const student = filteredStudents.find(s => s.id === l.student_id);
      const group = student?.school_level ? (SCHOOL_LEVEL_MAP[student.school_level] || '기타') : '기타';

      if (!map[month][group]) map[month][group] = { scores: [], count: 0 };
      map[month][group].scores.push(l.understanding_score);
      map[month][group].count++;
    });

    return Object.entries(map)
      .map(([month, groups]) => {
        const row: any = { month };
        Object.entries(groups).forEach(([group, data]) => {
          row[group] = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length * 10) / 10;
        });
        return row;
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredLessons, filteredStudents]);

  // Monthly homework completion rate
  const monthlyHomework = useMemo(() => {
    const map: Record<string, { total: number; completed: number; partial: number; notDone: number }> = {};
    filteredLessons.forEach(l => {
      const m = l.lesson_date?.slice(0, 7);
      if (!m || !l.homework_status || l.homework_status === 'none_assigned' || l.homework_status === 'none') return;
      if (!map[m]) map[m] = { total: 0, completed: 0, partial: 0, notDone: 0 };
      map[m].total++;
      if (l.homework_status === 'completed') map[m].completed++;
      else if (l.homework_status === 'partial') map[m].partial++;
      else if (l.homework_status === 'not_done') map[m].notDone++;
    });
    return Object.entries(map)
      .map(([month, d]) => ({
        month,
        완료율: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
        일부: d.total > 0 ? Math.round((d.partial / d.total) * 100) : 0,
        미이행: d.total > 0 ? Math.round((d.notDone / d.total) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredLessons]);

  // Monthly test pass rate
  const monthlyTests = useMemo(() => {
    const map: Record<string, { total: number; passed: number }> = {};
    filteredLessons.forEach(l => {
      if (!l.test_content && !l.test_result_text) return;
      const m = l.lesson_date?.slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { total: 0, passed: 0 };
      map[m].total++;
      const epf = l.english_pass_fail;
      const tr = l.test_result;
      if (epf === 'pass' || tr === 'pass') map[m].passed++;
    });
    return Object.entries(map)
      .map(([month, d]) => ({
        month,
        통과율: d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0,
        총횟수: d.total,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredLessons]);

  // Per-student summary for ranking table
  const studentRankings = useMemo(() => {
    const map: Record<string, { scores: number[]; hwTotal: number; hwDone: number; testTotal: number; testPass: number; lessonCount: number }> = {};
    filteredLessons.forEach(l => {
      if (!map[l.student_id]) map[l.student_id] = { scores: [], hwTotal: 0, hwDone: 0, testTotal: 0, testPass: 0, lessonCount: 0 };
      const m = map[l.student_id];
      m.lessonCount++;
      if (l.understanding_score != null) m.scores.push(l.understanding_score);
      if (l.homework_status && !['none_assigned', 'none'].includes(l.homework_status)) {
        m.hwTotal++;
        if (l.homework_status === 'completed') m.hwDone++;
      }
      if (l.test_content || l.test_result_text) {
        m.testTotal++;
        if (l.english_pass_fail === 'pass' || l.test_result === 'pass') m.testPass++;
      }
    });

    return filteredStudents
      .map(s => {
        const d = map[s.id] || { scores: [], hwTotal: 0, hwDone: 0, testTotal: 0, testPass: 0, lessonCount: 0 };
        const avgScore = d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length * 10) / 10 : null;
        const hwRate = d.hwTotal > 0 ? Math.round((d.hwDone / d.hwTotal) * 100) : null;
        const testRate = d.testTotal > 0 ? Math.round((d.testPass / d.testTotal) * 100) : null;

        // Recent trend: last 5 vs previous 5
        let trend: 'up' | 'down' | 'stable' | null = null;
        if (d.scores.length >= 6) {
          const recent5 = d.scores.slice(0, 5);
          const prev5 = d.scores.slice(5, 10);
          const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
          const prevAvg = prev5.reduce((a, b) => a + b, 0) / prev5.length;
          if (recentAvg - prevAvg > 0.3) trend = 'up';
          else if (prevAvg - recentAvg > 0.3) trend = 'down';
          else trend = 'stable';
        }

        return {
          ...s,
          avgScore,
          hwRate,
          testRate,
          lessonCount: d.lessonCount,
          trend,
        };
      })
      .filter(s => s.lessonCount > 0)
      .sort((a, b) => {
        if (activeTab === 'understanding') return (b.avgScore ?? 0) - (a.avgScore ?? 0);
        if (activeTab === 'homework') return (b.hwRate ?? 0) - (a.hwRate ?? 0);
        return (b.testRate ?? 0) - (a.testRate ?? 0);
      });
  }, [filteredStudents, filteredLessons, activeTab]);

  // Grade group counts
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { '전체': students.length };
    students.forEach(s => {
      const g = s.school_level ? (SCHOOL_LEVEL_MAP[s.school_level] || '기타') : '기타';
      counts[g] = (counts[g] || 0) + 1;
    });
    return counts;
  }, [students]);

  if (loading) {
    return (
      <Card><CardContent className="p-8 space-y-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </CardContent></Card>
    );
  }

  const CHART_GROUPS = levelFilter === '전체' ? ['초등', '중등', '고등'] : [levelFilter];
  const GROUP_COLORS: Record<string, string> = {
    '초등': 'hsl(var(--success))',
    '중등': 'hsl(var(--primary))',
    '고등': 'hsl(var(--warning))',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">학년별</span>
          <div className="flex gap-1">
            {SCHOOL_LEVELS.map(level => (
              <Badge
                key={level}
                variant={levelFilter === level ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setLevelFilter(level)}
              >
                {level} {groupCounts[level] ? `(${groupCounts[level]})` : ''}
              </Badge>
            ))}
          </div>
        </div>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-24 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">전체 과목</SelectItem>
            {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredStudents.length}명 / 최근 6개월 데이터
        </span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="understanding" className="gap-1 text-xs">
            <BarChart3 className="w-3.5 h-3.5" /> 이해도 추이
          </TabsTrigger>
          <TabsTrigger value="homework" className="gap-1 text-xs">
            <BookOpen className="w-3.5 h-3.5" /> 숙제 이행률
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1 text-xs">
            <TestTube className="w-3.5 h-3.5" /> 테스트 통과율
          </TabsTrigger>
        </TabsList>

        {/* Understanding Tab */}
        <TabsContent value="understanding" className="space-y-4">
          {monthlyUnderstanding.length >= 2 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">📈 월별 평균 이해도 추이</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthlyUnderstanding}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                    <ReTooltip />
                    <Legend />
                    {CHART_GROUPS.map(g => (
                      <Line key={g} type="monotone" dataKey={g} stroke={GROUP_COLORS[g] || '#888'} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Homework Tab */}
        <TabsContent value="homework" className="space-y-4">
          {monthlyHomework.length >= 2 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">📊 월별 숙제 이행률 추이 (%)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyHomework}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <ReTooltip />
                    <Legend />
                    <Bar dataKey="완료율" stackId="a" fill="hsl(var(--success))" />
                    <Bar dataKey="일부" stackId="a" fill="hsl(var(--warning))" />
                    <Bar dataKey="미이행" stackId="a" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tests Tab */}
        <TabsContent value="tests" className="space-y-4">
          {monthlyTests.length >= 2 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">🔬 월별 테스트 통과율 추이 (%)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthlyTests}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <ReTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="통과율" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="총횟수" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="5 5" dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Student Rankings Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            🏅 학생별 현황 ({activeTab === 'understanding' ? '이해도' : activeTab === 'homework' ? '숙제이행률' : '테스트통과율'} 순)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead>수업수</TableHead>
                  <TableHead>평균이해도</TableHead>
                  <TableHead>숙제완료율</TableHead>
                  <TableHead>테스트통과율</TableHead>
                  <TableHead>추이</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentRankings.slice(0, 50).map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs">{s.grade || '-'}</TableCell>
                    <TableCell className="text-xs">{s.lessonCount}회</TableCell>
                    <TableCell>
                      {s.avgScore != null ? (
                        <span className={`text-sm font-mono font-semibold ${s.avgScore >= 4 ? 'text-success' : s.avgScore >= 3 ? 'text-warning' : 'text-destructive'}`}>
                          {s.avgScore}/5
                        </span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {s.hwRate != null ? (
                        <span className={`text-sm font-mono ${s.hwRate >= 80 ? 'text-success' : s.hwRate >= 50 ? 'text-warning' : 'text-destructive'}`}>
                          {s.hwRate}%
                        </span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {s.testRate != null ? (
                        <span className={`text-sm font-mono ${s.testRate >= 70 ? 'text-success' : s.testRate >= 40 ? 'text-warning' : 'text-destructive'}`}>
                          {s.testRate}%
                        </span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {s.trend === 'up' && <TrendingUp className="w-4 h-4 text-success" />}
                      {s.trend === 'down' && <TrendingDown className="w-4 h-4 text-destructive" />}
                      {s.trend === 'stable' && <Minus className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                  </TableRow>
                ))}
                {studentRankings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                      해당 조건의 수업 기록이 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
