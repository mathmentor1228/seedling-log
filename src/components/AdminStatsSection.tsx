import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart3, 
  FileCheck, 
  ClipboardList,
  AlertTriangle,
  Users,
  RefreshCw,
  FlaskConical
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

// ADMIN-STATS-V2 (with test stats)

interface TestStat {
  subject: string;
  test_count: number;
  pass_count: number;
  fail_count: number;
}

interface AdminKpis {
  lesson_stats: {
    total: number;
    submitted: number;
    draft: number;
    submission_rate: number;
  };
  homework_stats: {
    completed: number;
    partial: number;
    not_done: number;
    none_assigned: number;
    total: number;
    pending_verification: number;
  };
  attendance_stats: {
    지각: number;
    조퇴: number;
    인정결석: number;
    무단결석: number;
    보충불가: number;
    total: number;
  };
  test_stats: TestStat[];
  top_exception_students: {
    student_id: string;
    student_name: string;
    exception_count: number;
  }[];
  teacher_breakdown: {
    teacher_id: string;
    teacher_name: string;
    exception_count: number;
    total_lessons: number;
  }[];
}

interface Teacher {
  id: string;
  full_name: string;
}

export default function AdminStatsSection() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<AdminKpis | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // DEBUG-MARKER-ADMINSTATS-V1
  const [fetchError, setFetchError] = useState<{ page: string; status: number | string; message: string } | null>(null);

  // Filters
  const today = getTodayKST();
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(today);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  const subjects = ['수학', '과학', '영어', '국어'];

  useEffect(() => {
    fetchTeachers();
  }, []);

  useEffect(() => {
    fetchKpis();
  }, [startDate, endDate, selectedTeacher, selectedSubject]);

  async function fetchTeachers() {
    try {
      // Get teachers from classes table (teachers who have classes)
      const { data: classes, error } = await supabase
        .from('classes')
        .select('teacher_id')
        .not('teacher_id', 'is', null);

      if (error) {
        const errInfo = { page: 'AdminStats-Teachers', status: error.code || 'UNKNOWN', message: error.message };
        console.error('DEBUG_FETCH_ERROR: AdminStats-Teachers', errInfo);
        return;
      }

      const teacherIds = [...new Set((classes || []).map(c => c.teacher_id))] as string[];

      if (teacherIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);

        if (profileError) {
          const errInfo = { page: 'AdminStats-Profiles', status: profileError.code || 'UNKNOWN', message: profileError.message };
          console.error('DEBUG_FETCH_ERROR: AdminStats-Profiles', errInfo);
          return;
        }

        setTeachers((profiles || []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name || '알 수 없음',
        })));
      }
    } catch (error: any) {
      console.error('Error fetching teachers:', error);
    }
  }

  async function fetchKpis() {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.rpc('get_admin_kpis', {
        _start_date: startDate,
        _end_date: endDate,
        _teacher_id: selectedTeacher === 'all' ? null : selectedTeacher,
        _subject: selectedSubject === 'all' ? null : selectedSubject,
      });

      if (error) {
        const errInfo = { page: 'AdminStats', status: error.code || 'UNKNOWN', message: error.message };
        console.error('DEBUG_FETCH_ERROR: AdminStats', errInfo);
        setFetchError(errInfo);
        return;
      }

      setKpis(data as unknown as AdminKpis);
    } catch (error: any) {
      const errInfo = { page: 'AdminStats', status: error?.code || 'ERR', message: error?.message || 'Unknown error' };
      console.error('DEBUG_FETCH_ERROR: AdminStats', errInfo);
      setFetchError(errInfo);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchKpis();
    setRefreshing(false);
  }

  function getSubmissionRateColor(rate: number) {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 70) return 'text-amber-600';
    return 'text-red-600';
  }

  function getHomeworkStatusColor(status: string) {
    switch (status) {
      case 'completed': return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'partial': return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
      case 'not_done': return 'bg-red-500/15 text-red-600 border-red-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  }

  if (loading && !kpis) {
    return (
      <Card className="animate-slide-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            관리자 통계
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-up border-primary/20">
      {/* Fetch error banner */}
      {fetchError && (
        <div className="bg-destructive text-destructive-foreground text-xs py-2 px-4">
          오류: {fetchError.message}
        </div>
      )}
      
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            관리자 통계
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="space-y-1.5">
            <Label htmlFor="start-date" className="text-xs">시작일</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date" className="text-xs">종료일</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">선생님</Label>
            <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">과목</Label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {kpis && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Lesson Submission Rate */}
              <Card className="bg-background">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <FileCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">수업일지 제출률</p>
                      <p className={`text-2xl font-bold ${getSubmissionRateColor(kpis.lesson_stats.submission_rate)}`}>
                        {kpis.lesson_stats.submission_rate}%
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="text-muted-foreground">전체</p>
                      <p className="font-semibold">{kpis.lesson_stats.total}</p>
                    </div>
                    <div className="p-2 bg-green-500/10 rounded">
                      <p className="text-green-600">제출</p>
                      <p className="font-semibold text-green-600">{kpis.lesson_stats.submitted}</p>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded">
                      <p className="text-amber-600">임시저장</p>
                      <p className="font-semibold text-amber-600">{kpis.lesson_stats.draft}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Homework Status Distribution */}
              <Card className="bg-background">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">숙제 현황</p>
                      <p className="text-2xl font-bold">{kpis.homework_stats.total}건</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Badge className={getHomeworkStatusColor('completed')}>완료</Badge>
                      <span className="font-medium">{kpis.homework_stats.completed}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <Badge className={getHomeworkStatusColor('partial')}>일부완료</Badge>
                      <span className="font-medium">{kpis.homework_stats.partial}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <Badge className={getHomeworkStatusColor('not_done')}>미이행</Badge>
                      <span className="font-medium">{kpis.homework_stats.not_done}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <Badge className={getHomeworkStatusColor('')}>없음</Badge>
                      <span className="font-medium">{kpis.homework_stats.none_assigned}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Attendance Exceptions */}
              <Card className="bg-background">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">출결 예외</p>
                      <p className="text-2xl font-bold text-red-600">{kpis.attendance_stats.total}건</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="flex justify-between p-1.5 bg-muted/50 rounded">
                      <span>지각</span>
                      <span className="font-medium">{kpis.attendance_stats.지각}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-muted/50 rounded">
                      <span>조퇴</span>
                      <span className="font-medium">{kpis.attendance_stats.조퇴}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-muted/50 rounded">
                      <span>인정결석</span>
                      <span className="font-medium">{kpis.attendance_stats.인정결석}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-muted/50 rounded">
                      <span>무단결석</span>
                      <span className="font-medium">{kpis.attendance_stats.무단결석}</span>
                    </div>
                    <div className="flex justify-between p-1.5 bg-muted/50 rounded col-span-2">
                      <span>보충불가</span>
                      <span className="font-medium">{kpis.attendance_stats.보충불가}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Test Stats */}
              <Card className="bg-background">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                      <FlaskConical className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">테스트 현황</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {(kpis.test_stats || []).reduce((sum, t) => sum + t.test_count, 0)}건
                      </p>
                    </div>
                  </div>
                  {(kpis.test_stats || []).length > 0 ? (
                    <div className="space-y-1.5">
                      {kpis.test_stats.map((ts) => (
                        <div key={ts.subject} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{ts.subject}</span>
                          <div className="flex items-center gap-2">
                            <span>{ts.test_count}건</span>
                            {ts.subject === '영어' && (ts.pass_count > 0 || ts.fail_count > 0) && (
                              <span className="text-muted-foreground">
                                (통과 {ts.pass_count} / 불통과 {ts.fail_count})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">해당 기간 테스트 없음</p>
                  )}
                </CardContent>
              </Card>
            </div>


            {/* Tables Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Exception Students */}
              {kpis.top_exception_students.length > 0 && (
                <Card className="bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      출결 예외 다발 학생 (Top 5)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">학생</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">예외 건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpis.top_exception_students.map((student, idx) => (
                          <tr key={student.student_id} className="border-b last:border-0">
                            <td className="py-2">
                              <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                              {student.student_name}
                            </td>
                            <td className="py-2 text-right">
                              <Badge variant="destructive" className="text-xs">
                                {student.exception_count}건
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Teacher Breakdown */}
              {kpis.teacher_breakdown.length > 0 && (
                <Card className="bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      선생님별 현황
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">선생님</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">수업</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">출결예외</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpis.teacher_breakdown.map((teacher) => (
                          <tr key={teacher.teacher_id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{teacher.teacher_name}</td>
                            <td className="py-2 text-right text-muted-foreground">{teacher.total_lessons}</td>
                            <td className="py-2 text-right">
                              {teacher.exception_count > 0 ? (
                                <Badge variant="outline" className="text-xs border-red-500/30 text-red-600">
                                  {teacher.exception_count}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
