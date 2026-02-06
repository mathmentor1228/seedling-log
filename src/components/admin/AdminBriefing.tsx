import { useState, useEffect, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LessonModal } from '@/components/lessons/LessonModal';
import { 
  CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  RefreshCw, 
  Filter,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquare,
  ClipboardList
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LessonFormContext } from '@/components/lessons/LessonRecordForm';

// ADMIN_BRIEFING_V2

interface Teacher {
  id: string;
  full_name: string;
}

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
  test_content: string | null;
  test_result_text: string | null;
  homework_check_note: string | null;
  learning_issues_note: string | null;
  attendance_status: string[] | null;
  understanding_score: number | null;
  student_name?: string;
  teacher_name?: string;
}

interface DailyBriefing {
  id: string;
  briefing_date: string;
  totals: {
    total_lessons: number;
    submitted: number;
    draft: number;
    tests: number;
    comments: number;
    attendance_issues: number;
    homework_issues: number;
  };
  highlights: Array<{
    type: string;
    message: string;
    student_name?: string;
    teacher_name?: string;
  }>;
  generated_at: string;
}

interface Filters {
  subject: string;
  grade: string;
  teacherId: string;
  testsOnly: boolean;
  commentsOnly: boolean;
  attendanceIssuesOnly: boolean;
  homeworkIssuesOnly: boolean;
  unsubmittedOnly: boolean;
  includeAdminLessons: boolean;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];
const ATTENDANCE_ISSUES = ['지각', '조퇴', '인정결석', '무단결석', '보충불가'];

export function AdminBriefing() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // View mode
  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  // Data
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [lessonRecords, setLessonRecords] = useState<LessonRecord[]>([]);
  const [dailyBriefing, setDailyBriefing] = useState<DailyBriefing | null>(null);
  const [adminTeacherId, setAdminTeacherId] = useState<string | null>(null);
  
  // Filters
  const [filters, setFilters] = useState<Filters>({
    subject: 'all',
    grade: 'all',
    teacherId: 'all',
    testsOnly: false,
    commentsOnly: false,
    attendanceIssuesOnly: false,
    homeworkIssuesOnly: false,
    unsubmittedOnly: false,
    includeAdminLessons: false,
  });
  
  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<LessonFormContext | null>(null);
  const [modalRecordId, setModalRecordId] = useState<string | null>(null);
  
  // Generating
  const [generatingDaily, setGeneratingDaily] = useState(false);
  const [generatingWeekly, setGeneratingWeekly] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 5), [weekStart]); // Mon-Sat

  // Fetch teachers and grades on mount
  useEffect(() => {
    fetchMetadata();
  }, []);

  // Fetch lesson records when date/week changes
  useEffect(() => {
    fetchLessonRecords();
  }, [viewMode, selectedDate, weekStart]);

  // Fetch daily briefing when viewing daily mode
  useEffect(() => {
    if (viewMode === 'daily') {
      fetchDailyBriefing();
    }
  }, [viewMode, selectedDate]);

  async function fetchMetadata() {
    try {
      // Fetch teachers
      const { data: teacherData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      
      if (teacherData) {
        setTeachers(teacherData);
        // Find admin's teacher_id if they are also a teacher
        const adminProfile = teacherData.find(t => t.id === user?.id);
        if (adminProfile) {
          setAdminTeacherId(adminProfile.id);
        }
      }

      // Fetch distinct grades
      const { data: gradeData } = await supabase
        .from('students')
        .select('grade')
        .not('grade', 'is', null);
      
      if (gradeData) {
        const uniqueGrades = [...new Set(gradeData.map(s => s.grade).filter(Boolean))] as string[];
        setGrades(uniqueGrades.sort());
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    }
  }

  async function fetchLessonRecords() {
    setLoading(true);
    try {
      let dateFilter: { start: string; end: string };
      
      if (viewMode === 'daily') {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        dateFilter = { start: dateStr, end: dateStr };
      } else {
        dateFilter = {
          start: format(weekStart, 'yyyy-MM-dd'),
          end: format(weekEnd, 'yyyy-MM-dd'),
        };
      }

      // Fetch lesson records with student and teacher names
      const { data, error } = await supabase
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
          test_content,
          test_result_text,
          homework_check_note,
          learning_issues_note,
          attendance_status,
          understanding_score
        `)
        .gte('lesson_date', dateFilter.start)
        .lte('lesson_date', dateFilter.end)
        .order('lesson_date', { ascending: false });

      if (error) throw error;

      // Fetch student names
      const studentIds = [...new Set((data || []).map(r => r.student_id))];
      const { data: students } = await supabase
        .from('students')
        .select('id, name, grade')
        .in('id', studentIds);
      
      const studentMap = new Map((students || []).map(s => [s.id, s]));

      // Fetch teacher names
      const teacherIds = [...new Set((data || []).map(r => r.teacher_id))];
      const { data: teacherProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      
      const teacherMap = new Map((teacherProfiles || []).map(t => [t.id, t.full_name]));

      // Enrich records
      const enriched: LessonRecord[] = (data || []).map(r => ({
        ...r,
        student_name: studentMap.get(r.student_id)?.name || '알 수 없음',
        teacher_name: teacherMap.get(r.teacher_id) || '알 수 없음',
        student_grade: studentMap.get(r.student_id)?.grade || null,
      }));

      setLessonRecords(enriched);
    } catch (error) {
      console.error('Error fetching lesson records:', error);
      toast({ title: '데이터 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function fetchDailyBriefing() {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data } = await supabase
        .from('daily_briefings')
        .select('*')
        .eq('briefing_date', dateStr)
        .maybeSingle();
      
      if (data) {
        setDailyBriefing({
          id: data.id,
          briefing_date: data.briefing_date,
          totals: data.totals as DailyBriefing['totals'],
          highlights: data.highlights as DailyBriefing['highlights'],
          generated_at: data.generated_at,
        });
      } else {
        setDailyBriefing(null);
      }
    } catch (error) {
      console.error('Error fetching daily briefing:', error);
    }
  }

  // Apply filters to records
  const filteredRecords = useMemo(() => {
    return lessonRecords.filter(record => {
      // Exclude admin lessons unless toggled
      if (!filters.includeAdminLessons && adminTeacherId && record.teacher_id === adminTeacherId) {
        return false;
      }

      // Subject filter
      if (filters.subject !== 'all' && record.subject !== filters.subject) {
        return false;
      }

      // Teacher filter
      if (filters.teacherId !== 'all' && record.teacher_id !== filters.teacherId) {
        return false;
      }

      // Tests only
      if (filters.testsOnly) {
        const hasTest = record.test_content || record.test_title || record.test_result_text;
        if (!hasTest) return false;
      }

      // Comments only
      if (filters.commentsOnly) {
        const hasComment = record.homework_check_note || record.learning_issues_note;
        if (!hasComment) return false;
      }

      // Attendance issues only
      if (filters.attendanceIssuesOnly) {
        const hasAttendanceIssue = record.attendance_status?.some(s => 
          ATTENDANCE_ISSUES.includes(s)
        );
        if (!hasAttendanceIssue) return false;
      }

      // Homework issues only
      if (filters.homeworkIssuesOnly) {
        const hasHomeworkIssue = ['not_done', 'partial'].includes(record.homework_status);
        if (!hasHomeworkIssue) return false;
      }

      // Unsubmitted only
      if (filters.unsubmittedOnly) {
        if (record.submitted) return false;
      }

      return true;
    });
  }, [lessonRecords, filters, adminTeacherId]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const submitted = filteredRecords.filter(r => r.submitted).length;
    const draft = filteredRecords.filter(r => !r.submitted).length;
    const withTests = filteredRecords.filter(r => r.test_title || r.test_result_text).length;
    const withComments = filteredRecords.filter(r => r.homework_check_note || r.learning_issues_note).length;
    const attendanceIssues = filteredRecords.filter(r => 
      r.attendance_status?.some(s => ATTENDANCE_ISSUES.includes(s))
    ).length;
    const homeworkIssues = filteredRecords.filter(r => 
      ['not_done', 'partial'].includes(r.homework_status)
    ).length;

    return { total, submitted, draft, withTests, withComments, attendanceIssues, homeworkIssues };
  }, [filteredRecords]);

  async function generateDailySummary() {
    setGeneratingDaily(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Build totals from current filtered data
      const totals = {
        total_lessons: stats.total,
        submitted: stats.submitted,
        draft: stats.draft,
        tests: stats.withTests,
        comments: stats.withComments,
        attendance_issues: stats.attendanceIssues,
        homework_issues: stats.homeworkIssues,
      };

      // Build highlights
      const highlights: DailyBriefing['highlights'] = [];
      
      // Add attendance issues
      filteredRecords
        .filter(r => r.attendance_status?.some(s => ATTENDANCE_ISSUES.includes(s)))
        .slice(0, 5)
        .forEach(r => {
          const issues = r.attendance_status?.filter(s => ATTENDANCE_ISSUES.includes(s)).join(', ');
          highlights.push({
            type: 'attendance',
            message: `${r.student_name} - ${issues}`,
            student_name: r.student_name,
            teacher_name: r.teacher_name,
          });
        });

      // Add homework issues
      filteredRecords
        .filter(r => ['not_done', 'partial'].includes(r.homework_status))
        .slice(0, 5)
        .forEach(r => {
          highlights.push({
            type: 'homework',
            message: `${r.student_name} - ${r.homework_status === 'not_done' ? '미이행' : '일부완료'}`,
            student_name: r.student_name,
            teacher_name: r.teacher_name,
          });
        });

      // Upsert daily briefing
      const { error } = await supabase
        .from('daily_briefings')
        .upsert({
          briefing_date: dateStr,
          totals,
          highlights,
          generated_at: new Date().toISOString(),
          generated_by: user?.id,
        }, { onConflict: 'briefing_date' });

      if (error) throw error;

      toast({ title: '데일리 요약이 생성되었습니다' });
      fetchDailyBriefing();
    } catch (error) {
      console.error('Error generating daily summary:', error);
      toast({ title: '요약 생성 실패', variant: 'destructive' });
    } finally {
      setGeneratingDaily(false);
    }
  }

  async function generateWeeklySummary() {
    setGeneratingWeekly(true);
    try {
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      // Fetch daily briefings for this week
      const { data: dailyBriefings } = await supabase
        .from('daily_briefings')
        .select('*')
        .gte('briefing_date', weekStartStr)
        .lte('briefing_date', weekEndStr);

      // Aggregate totals
      const totals = {
        total_lessons: stats.total,
        submitted: stats.submitted,
        draft: stats.draft,
        tests: stats.withTests,
        comments: stats.withComments,
        attendance_issues: stats.attendanceIssues,
        homework_issues: stats.homeworkIssues,
      };

      // Teacher breakdown
      const teacherStats = new Map<string, { lessons: number; issues: number }>();
      filteredRecords.forEach(r => {
        const current = teacherStats.get(r.teacher_id) || { lessons: 0, issues: 0 };
        current.lessons++;
        if (!r.submitted || ['not_done', 'partial'].includes(r.homework_status)) {
          current.issues++;
        }
        teacherStats.set(r.teacher_id, current);
      });

      const teacherBreakdown = Array.from(teacherStats.entries()).map(([id, data]) => ({
        teacher_id: id,
        teacher_name: teachers.find(t => t.id === id)?.full_name || '알 수 없음',
        ...data,
      }));

      // Students needing attention (multiple issues)
      const studentIssueCount = new Map<string, number>();
      filteredRecords.forEach(r => {
        let issues = 0;
        if (!r.submitted) issues++;
        if (['not_done', 'partial'].includes(r.homework_status)) issues++;
        if (r.attendance_status?.some(s => ATTENDANCE_ISSUES.includes(s))) issues++;
        if (issues > 0) {
          studentIssueCount.set(r.student_name || '', (studentIssueCount.get(r.student_name || '') || 0) + issues);
        }
      });

      const attentionStudents = Array.from(studentIssueCount.entries())
        .filter(([, count]) => count >= 2)
        .map(([name, count]) => ({ student_name: name, issue_count: count }))
        .sort((a, b) => b.issue_count - a.issue_count)
        .slice(0, 10);

      // Recurring issues from daily highlights
      const recurringIssues: string[] = [];
      if (dailyBriefings && dailyBriefings.length > 0) {
        const allHighlights = dailyBriefings.flatMap(d => (d.highlights as DailyBriefing['highlights']) || []);
        const issueCounts = new Map<string, number>();
        allHighlights.forEach(h => {
          const key = `${h.type}:${h.student_name}`;
          issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
        });
        issueCounts.forEach((count, key) => {
          if (count >= 2) {
            recurringIssues.push(key);
          }
        });
      }

      // Build summary text
      const summaryLines = [
        `📊 주간 원장 보고 (${format(weekStart, 'M/d')}~${format(weekEnd, 'M/d')})`,
        '',
        `총 수업: ${totals.total_lessons}건 (제출: ${totals.submitted}, 미제출: ${totals.draft})`,
        `테스트 기록: ${totals.tests}건`,
        `코멘트 기록: ${totals.comments}건`,
        `출결 이슈: ${totals.attendance_issues}건`,
        `숙제 이슈: ${totals.homework_issues}건`,
        '',
      ];

      if (attentionStudents.length > 0) {
        summaryLines.push('⚠️ 주의 필요 학생:');
        attentionStudents.slice(0, 5).forEach(s => {
          summaryLines.push(`  - ${s.student_name} (이슈 ${s.issue_count}건)`);
        });
        summaryLines.push('');
      }

      if (teacherBreakdown.some(t => t.issues > 2)) {
        summaryLines.push('👨‍🏫 교사별 현황:');
        teacherBreakdown
          .filter(t => t.issues > 0)
          .sort((a, b) => b.issues - a.issues)
          .slice(0, 5)
          .forEach(t => {
            summaryLines.push(`  - ${t.teacher_name}: 수업 ${t.lessons}건, 이슈 ${t.issues}건`);
          });
      }

      const summaryText = summaryLines.join('\n');

      // Upsert weekly report
      const { error } = await supabase
        .from('weekly_principal_reports')
        .upsert({
          week_start: weekStartStr,
          week_end: weekEndStr,
          summary_text: summaryText,
          totals,
          teacher_breakdown: teacherBreakdown,
          attention_students: attentionStudents,
          recurring_issues: recurringIssues,
          generated_at: new Date().toISOString(),
          generated_by: user?.id,
        }, { onConflict: 'week_start' });

      if (error) throw error;

      toast({ title: '주간 원장 요약이 생성되었습니다' });
    } catch (error) {
      console.error('Error generating weekly summary:', error);
      toast({ title: '요약 생성 실패', variant: 'destructive' });
    } finally {
      setGeneratingWeekly(false);
    }
  }

  function openViewModal(record: LessonRecord) {
    setModalContext({
      student_id: record.student_id,
      class_id: record.class_id,
      subject: record.subject,
      lesson_date: record.lesson_date,
    });
    setModalRecordId(record.id);
    setModalOpen(true);
  }

  function getStatusBadge(submitted: boolean) {
    if (submitted) {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">제출</Badge>;
    }
    return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">임시저장</Badge>;
  }

  function getHomeworkBadge(status: string) {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">완료</Badge>;
      case 'partial':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">일부완료</Badge>;
      case 'not_done':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">미이행</Badge>;
      case 'none_assigned':
      case 'none':
      case '':
        return <Badge variant="outline" className="text-muted-foreground">없음</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">{status || '없음'}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">원장 보고</h1>
          <p className="text-muted-foreground text-sm">
            수업 현황 모니터링 및 요약 리포트 생성
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLessonRecords}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            새로고침
          </Button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'weekly' | 'daily')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="weekly">주간</TabsTrigger>
            <TabsTrigger value="daily">일간</TabsTrigger>
          </TabsList>

          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            {viewMode === 'weekly' ? (
              <>
                <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[140px] text-center">
                  {format(weekStart, 'M/d', { locale: ko })} ~ {format(weekEnd, 'M/d', { locale: ko })}
                </span>
                <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {format(selectedDate, 'yyyy-MM-dd (EEE)', { locale: ko })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card className="mt-4">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              필터
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">과목</Label>
                <Select value={filters.subject} onValueChange={(v) => setFilters(f => ({ ...f, subject: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {SUBJECTS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">학년</Label>
                <Select value={filters.grade} onValueChange={(v) => setFilters(f => ({ ...f, grade: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {grades.map(g => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">선생님</Label>
                <Select value={filters.teacherId} onValueChange={(v) => setFilters(f => ({ ...f, teacherId: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Toggle filters */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="testsOnly"
                  checked={filters.testsOnly}
                  onCheckedChange={(c) => setFilters(f => ({ ...f, testsOnly: !!c }))}
                />
                <Label htmlFor="testsOnly" className="text-xs cursor-pointer">테스트 있음</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="commentsOnly"
                  checked={filters.commentsOnly}
                  onCheckedChange={(c) => setFilters(f => ({ ...f, commentsOnly: !!c }))}
                />
                <Label htmlFor="commentsOnly" className="text-xs cursor-pointer">코멘트 있음</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="attendanceIssuesOnly"
                  checked={filters.attendanceIssuesOnly}
                  onCheckedChange={(c) => setFilters(f => ({ ...f, attendanceIssuesOnly: !!c }))}
                />
                <Label htmlFor="attendanceIssuesOnly" className="text-xs cursor-pointer">출결 이슈</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="homeworkIssuesOnly"
                  checked={filters.homeworkIssuesOnly}
                  onCheckedChange={(c) => setFilters(f => ({ ...f, homeworkIssuesOnly: !!c }))}
                />
                <Label htmlFor="homeworkIssuesOnly" className="text-xs cursor-pointer">숙제 이슈</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="unsubmittedOnly"
                  checked={filters.unsubmittedOnly}
                  onCheckedChange={(c) => setFilters(f => ({ ...f, unsubmittedOnly: !!c }))}
                />
                <Label htmlFor="unsubmittedOnly" className="text-xs cursor-pointer">미제출만</Label>
              </div>
              <div className="flex items-center gap-2 ml-auto border-l pl-4">
                <Checkbox
                  id="includeAdminLessons"
                  checked={filters.includeAdminLessons}
                  onCheckedChange={(c) => setFilters(f => ({ ...f, includeAdminLessons: !!c }))}
                />
                <Label htmlFor="includeAdminLessons" className="text-xs cursor-pointer">원장 수업 포함</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
          <Card className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">총 수업</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-600">{stats.submitted}</div>
            <div className="text-xs text-muted-foreground">제출</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-yellow-600">{stats.draft}</div>
            <div className="text-xs text-muted-foreground">미제출</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-blue-600">{stats.withTests}</div>
            <div className="text-xs text-muted-foreground">테스트</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-purple-600">{stats.withComments}</div>
            <div className="text-xs text-muted-foreground">코멘트</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-orange-600">{stats.attendanceIssues}</div>
            <div className="text-xs text-muted-foreground">출결 이슈</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-red-600">{stats.homeworkIssues}</div>
            <div className="text-xs text-muted-foreground">숙제 이슈</div>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          {viewMode === 'daily' && (
            <Button
              onClick={generateDailySummary}
              disabled={generatingDaily || loading}
              className="gap-2"
            >
              {generatingDaily ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              오늘 데일리 요약 생성/갱신
            </Button>
          )}
          {viewMode === 'weekly' && (
            <Button
              onClick={generateWeeklySummary}
              disabled={generatingWeekly || loading}
              className="gap-2"
            >
              {generatingWeekly ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              주간 원장 요약 리포트 생성
            </Button>
          )}
        </div>

        {/* Daily Briefing Preview */}
        {viewMode === 'daily' && dailyBriefing && (
          <Card className="mt-4 bg-muted/30">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                📋 저장된 데일리 요약 ({format(new Date(dailyBriefing.generated_at), 'HH:mm')} 생성)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>총 수업: <strong>{dailyBriefing.totals.total_lessons}</strong></div>
                <div>제출: <strong>{dailyBriefing.totals.submitted}</strong></div>
                <div>테스트: <strong>{dailyBriefing.totals.tests}</strong></div>
                <div>출결 이슈: <strong>{dailyBriefing.totals.attendance_issues}</strong></div>
              </div>
              {dailyBriefing.highlights.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="font-medium mb-1">주요 사항:</div>
                  <ul className="space-y-1">
                    {dailyBriefing.highlights.slice(0, 5).map((h, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {h.type === 'attendance' ? (
                          <AlertTriangle className="h-3 w-3 text-orange-500" />
                        ) : (
                          <Clock className="h-3 w-3 text-yellow-500" />
                        )}
                        <span>{h.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Records Table */}
        <TabsContent value={viewMode} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  조건에 맞는 수업 기록이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">날짜</TableHead>
                        <TableHead>학생</TableHead>
                        <TableHead className="w-[60px]">과목</TableHead>
                        <TableHead>선생님</TableHead>
                        <TableHead className="w-[70px]">상태</TableHead>
                        <TableHead className="w-[80px]">숙제</TableHead>
                        <TableHead>테스트</TableHead>
                        <TableHead>코멘트</TableHead>
                        <TableHead className="w-[60px]">보기</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell className="text-xs">
                            {format(new Date(record.lesson_date), 'M/d (EEE)', { locale: ko })}
                          </TableCell>
                          <TableCell className="font-medium">{record.student_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{record.subject}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{record.teacher_name}</TableCell>
                          <TableCell>{getStatusBadge(record.submitted)}</TableCell>
                          <TableCell>{getHomeworkBadge(record.homework_status)}</TableCell>
                          <TableCell className="text-xs max-w-[200px]">
                            {(() => {
                              const content = record.test_content || record.test_title;
                              const result = record.test_result_text;
                              if (!content && !result) return <span className="text-muted-foreground">-</span>;
                              const full = [content, result].filter(Boolean).join(' — ');
                              return (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-blue-600 truncate block cursor-default">
                                        {full.length > 30 ? full.slice(0, 30) + '…' : full}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-sm">
                                      {content && <div><strong>내용:</strong> {content}</div>}
                                      {result && <div><strong>결과:</strong> {result}</div>}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {record.homework_check_note && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 cursor-default">
                                        조교코멘트
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-sm">
                                      {record.homework_check_note}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {record.learning_issues_note && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 cursor-default">
                                        교사관찰
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-sm">
                                      {record.learning_issues_note}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {!record.homework_check_note && !record.learning_issues_note && (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
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
      </Tabs>

      {/* Lesson View Modal */}
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
