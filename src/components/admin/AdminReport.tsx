import { useState, useEffect, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { LessonModal } from '@/components/lessons/LessonModal';
import { OpsChangelogSection } from './OpsChangelogSection';
import { AnalysisReportViewsSection } from './AnalysisReportViewsSection';
import { ActiveParentsSection } from './ActiveParentsSection';
import { 
  CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  ClipboardCheck,
  Users,
  BookOpen,
  History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LessonFormContext } from '@/components/lessons/LessonRecordForm';

// ADMIN_REPORT_TOOL_V1

// FIX-KPI-NULL-SAFETY-V1: Interface matches RPC return structure
interface KpiData {
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
  test_stats: Array<{
    subject: string;
    test_count: number;
    pass_count: number;
    fail_count: number;
  }>;
  top_exception_students: Array<{
    student_id: string;
    student_name: string;
    exception_count: number;
  }>;
  teacher_breakdown: Array<{
    teacher_id: string;
    teacher_name: string;
    total_lessons: number;
    submitted: number;
    draft: number;
    attendance_issues: number;
    homework_issues: number;
    tests_count: number;
  }>;
}

// FIX-KPI-NULL-SAFETY-V1: Default values for null-safe rendering
const defaultLessonStats = { total: 0, submitted: 0, draft: 0, submission_rate: 0 };
const defaultHomeworkStats = { completed: 0, partial: 0, not_done: 0, none_assigned: 0, total: 0, pending_verification: 0 };
const defaultAttendanceStats = { '지각': 0, '조퇴': 0, '인정결석': 0, '무단결석': 0, '보충불가': 0, total: 0 };

interface LessonRecord {
  id: string;
  lesson_date: string;
  student_id: string;
  class_id: string;
  subject: string;
  teacher_id: string;
  submitted: boolean;
  homework_status: string;
  test_title: string | null;
  test_result_text: string | null;
  english_pass_fail: string | null;
  homework_check_note: string | null;
  learning_issues_note: string | null;
  attendance_status: string[] | null;
  student_name?: string;
  teacher_name?: string;
}

const ATTENDANCE_ISSUES = ['지각', '조퇴', '인정결석', '무단결석', '보충불가'];

export function AdminReport() {
  const { toast } = useToast();
  
  // Date range
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = useMemo(() => addDays(weekStart, 5), [weekStart]); // Mon-Sat
  
  // Data
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [testRecords, setTestRecords] = useState<LessonRecord[]>([]);
  const [issueRecords, setIssueRecords] = useState<LessonRecord[]>([]);
  
  // Teacher filter for tables
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  
  // Modal - ADMIN_REPORT_VIEW_MODAL_V1
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<LessonFormContext | null>(null);
  const [modalRecordId, setModalRecordId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [weekStart]);

  async function fetchData() {
    setLoading(true);
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      // Fetch KPIs via RPC
      const { data: kpis, error: kpiError } = await supabase.rpc('get_admin_kpis', {
        _start_date: startStr,
        _end_date: endStr,
      });

      if (kpiError) throw kpiError;
      setKpiData(kpis as unknown as KpiData);

      // Fetch test records
      const { data: tests, error: testError } = await supabase
        .from('lesson_records')
        .select(`
          id,
          lesson_date,
          student_id,
          class_id,
          subject,
          teacher_id,
          submitted,
          homework_status,
          test_title,
          test_result_text,
          english_pass_fail,
          homework_check_note,
          learning_issues_note,
          attendance_status
        `)
        .gte('lesson_date', startStr)
        .lte('lesson_date', endStr)
        .or('test_title.neq.,test_result_text.neq.')
        .order('lesson_date', { ascending: false });

      if (testError) throw testError;

      // Fetch issue records (unsubmitted past records, homework issues, attendance issues, assistant notes)
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data: issues, error: issueError } = await supabase
        .from('lesson_records')
        .select(`
          id,
          lesson_date,
          student_id,
          class_id,
          subject,
          teacher_id,
          submitted,
          homework_status,
          test_title,
          test_result_text,
          english_pass_fail,
          homework_check_note,
          learning_issues_note,
          attendance_status
        `)
        .gte('lesson_date', startStr)
        .lte('lesson_date', endStr)
        .order('lesson_date', { ascending: false });

      if (issueError) throw issueError;

      // Enrich with student and teacher names
      const allRecords = [...(tests || []), ...(issues || [])];
      const studentIds = [...new Set(allRecords.map(r => r.student_id))];
      const teacherIds = [...new Set(allRecords.map(r => r.teacher_id))];

      const [studentsRes, teachersRes] = await Promise.all([
        supabase.from('students').select('id, name').in('id', studentIds),
        supabase.from('profiles').select('id, full_name').in('id', teacherIds),
      ]);

      const studentMap = new Map((studentsRes.data || []).map(s => [s.id, s.name]));
      const teacherMap = new Map((teachersRes.data || []).map(t => [t.id, t.full_name]));

      const enrichedTests: LessonRecord[] = (tests || [])
        .filter(r => r.test_title || r.test_result_text)
        .map(r => ({
          ...r,
          student_name: studentMap.get(r.student_id) || '알 수 없음',
          teacher_name: teacherMap.get(r.teacher_id) || '알 수 없음',
        }));

      // Filter issue records
      const enrichedIssues: LessonRecord[] = (issues || [])
        .filter(r => {
          const isUnsubmittedPast = !r.submitted && r.lesson_date < todayStr;
          const hasHomeworkIssue = ['not_done', 'partial'].includes(r.homework_status);
          const hasAttendanceIssue = r.attendance_status?.some(s => ATTENDANCE_ISSUES.includes(s));
          const hasAssistantNote = r.homework_check_note && r.homework_check_note.trim() !== '';
          return isUnsubmittedPast || hasHomeworkIssue || hasAttendanceIssue || hasAssistantNote;
        })
        .map(r => ({
          ...r,
          student_name: studentMap.get(r.student_id) || '알 수 없음',
          teacher_name: teacherMap.get(r.teacher_id) || '알 수 없음',
        }));

      setTestRecords(enrichedTests);
      setIssueRecords(enrichedIssues);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: '데이터 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function openViewModal(record: LessonRecord) {
    const ctx: LessonFormContext = {
      student_id: record.student_id,
      class_id: record.class_id,
      subject: record.subject,
      lesson_date: record.lesson_date,
    };
    setModalContext(ctx);
    setModalRecordId(record.id);
    setModalOpen(true);
  }

  function handleTeacherClick(teacherId: string) {
    setSelectedTeacherId(prev => prev === teacherId ? null : teacherId);
  }

  // Filter tables by selected teacher
  const filteredTestRecords = useMemo(() => {
    if (!selectedTeacherId) return testRecords;
    return testRecords.filter(r => r.teacher_id === selectedTeacherId);
  }, [testRecords, selectedTeacherId]);

  const filteredIssueRecords = useMemo(() => {
    if (!selectedTeacherId) return issueRecords;
    return issueRecords.filter(r => r.teacher_id === selectedTeacherId);
  }, [issueRecords, selectedTeacherId]);

  function getIssueReasons(record: LessonRecord): string[] {
    const reasons: string[] = [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    if (!record.submitted && record.lesson_date < todayStr) {
      reasons.push('미제출');
    }
    if (record.homework_status === 'not_done') {
      reasons.push('숙제미이행');
    }
    if (record.homework_status === 'partial') {
      reasons.push('숙제일부');
    }
    if (record.attendance_status?.some(s => ATTENDANCE_ISSUES.includes(s))) {
      const issues = record.attendance_status.filter(s => ATTENDANCE_ISSUES.includes(s));
      reasons.push(...issues);
    }
    if (record.homework_check_note && record.homework_check_note.trim()) {
      reasons.push('조교코멘트');
    }
    return reasons;
  }

  // FIX-KPI-NULL-SAFETY-V1: Use correct property names and null-safe access
  const lessonStats = kpiData?.lesson_stats ?? defaultLessonStats;
  const homeworkStats = kpiData?.homework_stats ?? defaultHomeworkStats;
  const attendanceStats = kpiData?.attendance_stats ?? defaultAttendanceStats;
  const testStats = kpiData?.test_stats ?? [];
  const totalTests = testStats.reduce((sum, t) => sum + t.test_count, 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* ADMIN_REPORT_TOOL_V1 marker */}
      <div className="text-xs text-center py-1 rounded bg-primary/20 text-primary">
        ADMIN_REPORT_TOOL_V1
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">원장 보고서</h1>
        
        {/* Week Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(prev => subWeeks(prev, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[200px]">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(weekStart, 'M월 d일', { locale: ko })} ~ {format(weekEnd, 'M월 d일', { locale: ko })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={weekStart}
                onSelect={(date) => date && setWeekStart(startOfWeek(date, { weekStartsOn: 1 }))}
                locale={ko}
              />
            </PopoverContent>
          </Popover>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(prev => addWeeks(prev, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Teacher Filter Badge */}
      {selectedTeacherId && kpiData?.teacher_breakdown && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            필터: {kpiData.teacher_breakdown.find(t => t.teacher_id === selectedTeacherId)?.teacher_name}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setSelectedTeacherId(null)}>
            필터 해제
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : kpiData && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* FIX-KPI-NULL-SAFETY-V1: Use extracted null-safe variables */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                총 수업
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lessonStats.total}</div>
              <div className="text-xs text-muted-foreground">
                제출 {lessonStats.submitted} / 미제출 {lessonStats.draft}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                제출률
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lessonStats.submission_rate}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <FileText className="h-4 w-4" />
                테스트
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTests}</div>
              <div className="text-xs text-muted-foreground">
                {testStats.map(t => `${t.subject}: ${t.test_count}`).join(', ') || '-'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <ClipboardCheck className="h-4 w-4" />
                숙제 이슈
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {homeworkStats.not_done + homeworkStats.partial}
              </div>
              <div className="text-xs text-muted-foreground">
                미이행 {homeworkStats.not_done} / 일부 {homeworkStats.partial}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                출결 이슈
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{attendanceStats.total}</div>
              <div className="text-xs text-muted-foreground">
                지각 {attendanceStats.지각} / 결석 {attendanceStats.인정결석 + attendanceStats.무단결석}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-4 w-4" />
                조교 확인대기
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{homeworkStats.pending_verification}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tables */}
      <Tabs defaultValue="tests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tests" className="gap-1">
            <FileText className="h-4 w-4" />
            테스트 결과 ({filteredTestRecords.length})
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-1">
            <AlertTriangle className="h-4 w-4" />
            주의 학생 ({filteredIssueRecords.length})
          </TabsTrigger>
          <TabsTrigger value="teachers" className="gap-1">
            <Users className="h-4 w-4" />
            교사별 현황
          </TabsTrigger>
          <TabsTrigger value="analysis-views" className="gap-1">
            <Eye className="h-4 w-4" />
            분석보고서 노출
          </TabsTrigger>
          <TabsTrigger value="changelog" className="gap-1">
            <History className="h-4 w-4" />
            운영 변경 이력
          </TabsTrigger>
        </TabsList>

        {/* Test Summary Table */}
        <TabsContent value="tests">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">테스트 결과 요약</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : filteredTestRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  해당 기간에 테스트 기록이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">날짜</TableHead>
                        <TableHead>학생</TableHead>
                        <TableHead>과목</TableHead>
                        <TableHead>테스트 내용</TableHead>
                        <TableHead>결과</TableHead>
                        <TableHead>교사</TableHead>
                        <TableHead className="w-[80px]">상태</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTestRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(record.lesson_date), 'M/d (E)', { locale: ko })}
                          </TableCell>
                          <TableCell className="font-medium">{record.student_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.subject}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {record.test_title || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="max-w-[150px] truncate">
                                {record.test_result_text || '-'}
                              </span>
                              {record.english_pass_fail && (
                                <Badge 
                                  variant={record.english_pass_fail === 'pass' ? 'default' : 'destructive'}
                                  className="text-xs"
                                >
                                  {record.english_pass_fail === 'pass' ? 'Pass' : 'Fail'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{record.teacher_name}</TableCell>
                          <TableCell>
                            <Badge variant={record.submitted ? 'default' : 'secondary'}>
                              {record.submitted ? '제출' : '임시'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewModal(record)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Issues Table */}
        <TabsContent value="issues">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">원장 주의 학생</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : filteredIssueRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  해당 기간에 주의가 필요한 학생이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>학생</TableHead>
                        <TableHead>과목</TableHead>
                        <TableHead>사유</TableHead>
                        <TableHead>교사</TableHead>
                        <TableHead className="w-[100px]">날짜</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIssueRecords.map(record => {
                        const reasons = getIssueReasons(record);
                        return (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">{record.student_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.subject}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {reasons.map((reason, i) => (
                                  <Badge 
                                    key={i} 
                                    variant={
                                      reason === '미제출' ? 'destructive' :
                                      reason.includes('결석') ? 'destructive' :
                                      reason === '조교코멘트' ? 'secondary' :
                                      'outline'
                                    }
                                    className="text-xs"
                                  >
                                    {reason}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{record.teacher_name}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(record.lesson_date), 'M/d (E)', { locale: ko })}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openViewModal(record)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teacher Summary Table */}
        <TabsContent value="teachers">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">교사별 현황</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : !kpiData?.teacher_breakdown?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  해당 기간에 교사 데이터가 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>교사</TableHead>
                        <TableHead className="text-right">총 수업</TableHead>
                        <TableHead className="text-right">제출</TableHead>
                        <TableHead className="text-right">미제출</TableHead>
                        <TableHead className="text-right">출결이슈</TableHead>
                        <TableHead className="text-right">숙제이슈</TableHead>
                        <TableHead className="text-right">테스트</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kpiData.teacher_breakdown.map(teacher => (
                        <TableRow 
                          key={teacher.teacher_id}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            selectedTeacherId === teacher.teacher_id && "bg-muted"
                          )}
                          onClick={() => handleTeacherClick(teacher.teacher_id)}
                        >
                          <TableCell className="font-medium">
                            {teacher.teacher_name}
                            {selectedTeacherId === teacher.teacher_id && (
                              <Badge variant="secondary" className="ml-2 text-xs">선택됨</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{teacher.total_lessons}</TableCell>
                          <TableCell className="text-right text-primary">{teacher.submitted}</TableCell>
                          <TableCell className="text-right">
                            {teacher.draft > 0 ? (
                              <span className="text-destructive">{teacher.draft}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {teacher.attendance_issues > 0 ? (
                              <span className="text-destructive">{teacher.attendance_issues}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {teacher.homework_issues > 0 ? (
                              <span className="text-destructive">{teacher.homework_issues}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{teacher.tests_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Report Views Tab - EXAM-ANALYSIS-PUBLIC-V1 */}
        <TabsContent value="analysis-views">
          <AnalysisReportViewsSection />
        </TabsContent>

        {/* Ops Changelog Tab - OPS_CHANGELOG_V1 */}
        <TabsContent value="changelog">
          <OpsChangelogSection />
        </TabsContent>
      </Tabs>

      {/* Lesson View Modal - ADMIN_REPORT_VIEW_MODAL_V1 */}
      <LessonModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        context={modalContext}
        existingRecordId={modalRecordId}
        initialMode="view"
      />
    </div>
  );
}
