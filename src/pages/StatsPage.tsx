// ADMIN-STATS-PAGE-V2 (Tabbed layout for clarity)
import { useEffect, useState, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  BookOpen,
  GraduationCap,
  UserCheck,
  RefreshCw,
  BarChart3,
  ClipboardCheck,
  Coins,
  Wallet,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import HomeworkStatsSection from '@/components/admin/HomeworkStatsSection';
import StudentPointsStatsSection from '@/components/admin/StudentPointsStatsSection';
import MonthlyTeacherStudentStats from '@/components/admin/MonthlyTeacherStudentStats';
import TeacherRevenueSection from '@/components/admin/TeacherRevenueSection';

interface EnrollmentStats {
  totals: {
    total_students: number;
    students_with_classes: number;
    total_classes: number;
    total_teachers: number;
  };
  by_subject: Array<{ subject: string; student_count: number }>;
  by_grade: Array<{ grade: string; student_count: number }>;
  by_teacher: Array<{
    teacher_id: string;
    teacher_name: string;
    student_count: number;
    subjects: string[];
  }>;
  students: Array<{
    student_id: string;
    student_name: string;
    grade: string | null;
    subject_count: number;
    subjects: string[];
    teacher_names: string[];
  }>;
}

interface Teacher {
  id: string;
  full_name: string;
}

const SUBJECT_COLOR: Record<string, string> = {
  수학: 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-300',
  영어: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-300',
  국어: 'bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-300',
  과학: 'bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-300',
};

function getSubjectColor(subject: string) {
  return SUBJECT_COLOR[subject] || 'bg-muted text-muted-foreground border-border';
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: any;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'primary' | 'emerald' | 'amber' | 'purple';
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1 tracking-tight">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function StatsContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [studentQuery, setStudentQuery] = useState('');

  const fetchTeachers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name');
    if (!error && data) setTeachers(data);
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_admin_enrollment_stats', {
        _grade_filter: gradeFilter === 'all' ? null : gradeFilter,
        _subject_filter: subjectFilter === 'all' ? null : subjectFilter,
        _teacher_id_filter: teacherFilter === 'all' ? null : teacherFilter,
      });
      if (error) {
        toast({ title: '통계 로드 실패', description: error.message, variant: 'destructive' });
        return;
      }
      setStats(data as unknown as EnrollmentStats);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchTeachers(), fetchStats()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading) fetchStats();
  }, [gradeFilter, subjectFilter, teacherFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    toast({ title: '통계가 새로고침되었습니다.' });
  };

  const grades = useMemo(
    () => (stats ? stats.by_grade.map((g) => g.grade).filter(Boolean) : []),
    [stats],
  );
  const subjects = useMemo(
    () => (stats ? stats.by_subject.map((s) => s.subject) : []),
    [stats],
  );

  const filteredStudents = useMemo(() => {
    if (!stats?.students) return [];
    const q = studentQuery.trim().toLowerCase();
    if (!q) return stats.students;
    return stats.students.filter((s) => s.student_name.toLowerCase().includes(q));
  }, [stats, studentQuery]);

  const maxSubjectCount = useMemo(
    () => Math.max(1, ...(stats?.by_subject.map((s) => s.student_count) ?? [1])),
    [stats],
  );
  const maxGradeCount = useMemo(
    () => Math.max(1, ...(stats?.by_grade.map((g) => g.student_count) ?? [1])),
    [stats],
  );

  if (loading) {
    return (
      <div className="space-y-5 p-1">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">통계</h1>
            <p className="text-xs text-muted-foreground">
              수강·숙제·포인트·매출 현황을 한 곳에서 확인합니다
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* Summary Cards (always visible) */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={Users}
            label="총 원생"
            value={`${stats.totals.total_students}명`}
            hint={`수업 배정 ${stats.totals.students_with_classes}명`}
            tone="primary"
          />
          <StatCard
            icon={BookOpen}
            label="총 반"
            value={`${stats.totals.total_classes}개`}
            tone="emerald"
          />
          <StatCard
            icon={UserCheck}
            label="담당 선생님"
            value={`${stats.totals.total_teachers}명`}
            tone="purple"
          />
          <StatCard
            icon={GraduationCap}
            label="과목"
            value={`${stats.by_subject.length}개`}
            tone="amber"
          />
        </div>
      )}

      {/* Tabbed sections */}
      <Tabs defaultValue="enrollment" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1">
          <TabsTrigger value="enrollment" className="gap-1.5 py-2">
            <Users className="w-4 h-4" />
            <span>수강 현황</span>
          </TabsTrigger>
          <TabsTrigger value="homework" className="gap-1.5 py-2">
            <ClipboardCheck className="w-4 h-4" />
            <span>숙제</span>
          </TabsTrigger>
          <TabsTrigger value="points" className="gap-1.5 py-2">
            <Coins className="w-4 h-4" />
            <span>포인트</span>
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5 py-2">
            <Wallet className="w-4 h-4" />
            <span>매출</span>
          </TabsTrigger>
        </TabsList>

        {/* Enrollment tab */}
        <TabsContent value="enrollment" className="space-y-5 mt-5">
          {/* Subject & Grade breakdown */}
          {stats && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    과목별 수강 인원
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.by_subject.map((item) => (
                      <div key={item.subject} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Badge className={getSubjectColor(item.subject)} variant="outline">
                            {item.subject}
                          </Badge>
                          <span className="text-sm font-semibold">{item.student_count}명</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all"
                            style={{ width: `${(item.student_count / maxSubjectCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {stats.by_subject.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-6">
                        수강 데이터가 없습니다
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    학년별 원생 수
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.by_grade.map((item) => (
                      <div key={item.grade} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{item.grade || '미지정'}</span>
                          <span className="text-sm font-semibold">{item.student_count}명</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/70 rounded-full transition-all"
                            style={{ width: `${(item.student_count / maxGradeCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {stats.by_grade.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-6">
                        학년 데이터가 없습니다
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Monthly teacher-student stats */}
          <MonthlyTeacherStudentStats />

          {/* Teacher breakdown */}
          {stats && stats.by_teacher.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  선생님별 담당 인원
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>선생님</TableHead>
                      <TableHead>담당 과목</TableHead>
                      <TableHead className="text-right">담당 학생 수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.by_teacher.map((teacher) => (
                      <TableRow key={teacher.teacher_id}>
                        <TableCell className="font-medium">{teacher.teacher_name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {teacher.subjects.map((subj) => (
                              <Badge
                                key={subj}
                                variant="outline"
                                className={`text-xs ${getSubjectColor(subj)}`}
                              >
                                {subj}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {teacher.student_count}명
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Student-level table with filters */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  학생별 수강 현황
                  {stats?.students && (
                    <Badge variant="secondary" className="ml-1">
                      {filteredStudents.length}명
                    </Badge>
                  )}
                </CardTitle>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="학생명 검색"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
                <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue placeholder="학년" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 학년</SelectItem>
                    {grades.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue placeholder="과목" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 과목</SelectItem>
                    {subjects.map((subj) => (
                      <SelectItem key={subj} value={subj}>
                        {subj}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="선생님" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 선생님</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>학생명</TableHead>
                      <TableHead>학년</TableHead>
                      <TableHead className="text-center">과목수</TableHead>
                      <TableHead>수강과목</TableHead>
                      <TableHead>담당 선생님</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <TableRow key={student.student_id}>
                          <TableCell className="font-medium">{student.student_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {student.grade || '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={student.subject_count > 0 ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {student.subject_count}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {student.subjects.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {student.subjects.map((subj) => (
                                  <Badge
                                    key={subj}
                                    variant="outline"
                                    className={`text-xs ${getSubjectColor(subj)}`}
                                  >
                                    {subj}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {student.teacher_names.length > 0
                              ? student.teacher_names.join(', ')
                              : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          조건에 맞는 학생이 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="homework" className="mt-5">
          <HomeworkStatsSection />
        </TabsContent>

        <TabsContent value="points" className="mt-5">
          <StudentPointsStatsSection />
        </TabsContent>

        <TabsContent value="revenue" className="mt-5">
          <TeacherRevenueSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StatsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <StatsContent />
    </ProtectedRoute>
  );
}
