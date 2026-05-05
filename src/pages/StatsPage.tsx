// ADMIN-STATS-PAGE-V1
import { useEffect, useState, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Users, BookOpen, GraduationCap, UserCheck, RefreshCw, BarChart3 } from 'lucide-react';
import HomeworkStatsSection from '@/components/admin/HomeworkStatsSection';
import StudentPointsStatsSection from '@/components/admin/StudentPointsStatsSection';
import MonthlyTeacherStudentStats from '@/components/admin/MonthlyTeacherStudentStats';
import TeacherRevenueSection from '@/components/admin/TeacherRevenueSection';
import HistoricalClassAttendance from '@/components/admin/HistoricalClassAttendance';

interface EnrollmentStats {
  totals: {
    total_students: number;
    students_with_classes: number;
    total_classes: number;
    total_teachers: number;
  };
  by_subject: Array<{
    subject: string;
    student_count: number;
  }>;
  by_grade: Array<{
    grade: string;
    student_count: number;
  }>;
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

function StatsContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // Filters
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');

  const fetchTeachers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name');
    
    if (!error && data) {
      setTeachers(data);
    }
  };

  const fetchStats = async () => {
    try {
      // Use type assertion for newly created RPC function
      const { data, error } = await (supabase.rpc as any)('get_admin_enrollment_stats', {
        _grade_filter: gradeFilter === 'all' ? null : gradeFilter,
        _subject_filter: subjectFilter === 'all' ? null : subjectFilter,
        _teacher_id_filter: teacherFilter === 'all' ? null : teacherFilter,
      });

      if (error) {
        console.error('Error fetching enrollment stats:', error);
        toast({
          title: '통계 로드 실패',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      setStats(data as unknown as EnrollmentStats);
    } catch (err) {
      console.error('Error:', err);
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
    if (!loading) {
      fetchStats();
    }
  }, [gradeFilter, subjectFilter, teacherFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    toast({ title: '통계가 새로고침되었습니다.' });
  };

  // Extract unique grades from stats for filter
  const grades = useMemo(() => {
    if (!stats) return [];
    return stats.by_grade.map(g => g.grade).filter(Boolean);
  }, [stats]);

  // Extract unique subjects
  const subjects = useMemo(() => {
    if (!stats) return [];
    return stats.by_subject.map(s => s.subject);
  }, [stats]);

  // Get subject badge color
  const getSubjectColor = (subject: string) => {
    switch (subject) {
      case '수학': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case '영어': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case '국어': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case '과학': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            통계
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            수강 현황 및 등록 통계
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">총 원생 수</span>
            </div>
            <p className="text-xl font-bold">{stats.totals.total_students}명</p>
            <p className="text-[11px] text-muted-foreground">수업 배정: {stats.totals.students_with_classes}명</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">총 반 수</span>
            </div>
            <p className="text-xl font-bold">{stats.totals.total_classes}개</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserCheck className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">담당 선생님</span>
            </div>
            <p className="text-xl font-bold">{stats.totals.total_teachers}명</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <GraduationCap className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">과목 수</span>
            </div>
            <p className="text-xl font-bold">{stats.by_subject.length}개</p>
          </div>
        </div>
      )}

      {/* Subject & Grade Breakdown */}
      {stats && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* By Subject */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">과목별 수강 인원</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.by_subject.map((item) => (
                  <div key={item.subject} className="flex items-center justify-between">
                    <Badge className={getSubjectColor(item.subject)}>
                      {item.subject}
                    </Badge>
                    <span className="font-medium">{item.student_count}명</span>
                  </div>
                ))}
                {stats.by_subject.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    수강 데이터가 없습니다
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* By Grade */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">학년별 원생 수</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.by_grade.map((item) => (
                  <div key={item.grade} className="flex items-center justify-between">
                    <span className="text-sm">{item.grade || '미지정'}</span>
                    <span className="font-medium">{item.student_count}명</span>
                  </div>
                ))}
                {stats.by_grade.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    학년 데이터가 없습니다
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Teacher-Student Stats */}
      <MonthlyTeacherStudentStats />

      {/* Teacher Breakdown */}
      {stats && stats.by_teacher.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">선생님별 담당 인원</CardTitle>
          </CardHeader>
          <CardContent>
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
                          <Badge key={subj} variant="outline" className="text-xs">
                            {subj}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{teacher.student_count}명</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">학생별 수강 현황</CardTitle>
          <div className="flex flex-wrap gap-3 mt-3">
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-32">
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
              <SelectTrigger className="w-32">
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
              <SelectTrigger className="w-40">
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생명</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead className="text-center">수강과목수</TableHead>
                  <TableHead>수강과목 목록</TableHead>
                  <TableHead>담당 선생님</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.students && stats.students.length > 0 ? (
                  stats.students.map((student) => (
                    <TableRow key={student.student_id}>
                      <TableCell className="font-medium">{student.student_name}</TableCell>
                      <TableCell>{student.grade || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={student.subject_count > 0 ? 'default' : 'secondary'}>
                          {student.subject_count}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {student.subjects.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {student.subjects.map((subj) => (
                              <Badge key={subj} className={`text-xs ${getSubjectColor(subj)}`}>
                                {subj}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.teacher_names.length > 0 ? (
                          <span className="text-sm">
                            {student.teacher_names.join(', ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
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
          {stats?.students && (
            <p className="text-sm text-muted-foreground mt-4">
              총 {stats.students.length}명
            </p>
          )}
        </CardContent>
      </Card>
      {/* Teacher Revenue Section */}
      <TeacherRevenueSection />
      {/* Homework Stats Section */}
      <HomeworkStatsSection />
      {/* Student Points Section */}
      <StudentPointsStatsSection />
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
