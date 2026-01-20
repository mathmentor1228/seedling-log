import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getKSTDateObject, getTodayKST } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  ClipboardCheck, 
  Calendar as CalendarIcon,
  FileEdit,
  CheckSquare,
  GraduationCap,
  Search,
  AlertCircle,
  Clock,
  Phone,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FlaskConical
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RosterActionModal } from '@/components/RosterActionModal';
import AssistantChecklist from '@/components/AssistantChecklist';
import { TestVisitModal } from '@/components/TestVisitModal';
import { TestVisitsList } from '@/components/TestVisitsList';

interface Teacher {
  id: string;
  name: string;
  hasLessonsOnDate: boolean;
}

interface RosterStudent {
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  subject: string;
  start_time: string;
  end_time: string;
  teacher_id: string;
  teacher_name: string;
  previousHomeworkStatus: 'completed' | 'partial' | 'not_done' | 'none_assigned' | null;
  firstSubject: boolean;
  followup2wDue: boolean;
  existingRecordId: string | null;
  hasTest: boolean;
  hyugangRecordId: string | null;
  attendanceStatus: string[];
  // HW-ISSUE-BADGE-TODAY-V1: Track if homework_check_note exists for today
  hasHomeworkIssue: boolean;
  homeworkCheckNote: string | null;
}

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  scope: 'all' | 'teacher';
  teacher_id: string | null;
}

// Normalize homework status values from DB
function normalizeHomeworkStatus(status: string | null | undefined): RosterStudent['previousHomeworkStatus'] {
  if (!status) return null;
  const normalized = status.toLowerCase().trim();
  if (['not_done', '미이행', '미완료'].includes(normalized)) return 'not_done';
  if (['partial', '일부완료', '부분 완료', '부분완료'].includes(normalized)) return 'partial';
  if (['completed', '완료'].includes(normalized)) return 'completed';
  if (['none_assigned', '없음', '미배정'].includes(normalized)) return 'none_assigned';
  return null;
}

// Helper function to render attendance badge with high visibility
// 미등원: red, 지각: amber, 등원: neutral gray
function getAttendanceStatusBadge(attendanceStatus: string[] | undefined) {
  if (!attendanceStatus || attendanceStatus.length === 0) return null;
  
  // Check for various non-normal statuses
  const hasAbsent = attendanceStatus.includes('무단결석') || attendanceStatus.includes('인정결석');
  const hasNoShow = attendanceStatus.includes('보충불가') || attendanceStatus.includes('미등원');
  const hasLateOrEarly = attendanceStatus.includes('지각') || attendanceStatus.includes('조퇴');
  
  // Filter out '정상등원' and '등원' for display
  const displayStatus = attendanceStatus.filter(s => s !== '정상등원' && s !== '등원');
  
  // If only normal status, show neutral badge
  if (displayStatus.length === 0) {
    // Check if it's explicitly marked as '등원'
    if (attendanceStatus.includes('등원')) {
      return (
        <Badge variant="secondary" className="bg-muted/50 text-muted-foreground border-muted text-xs">
          등원
        </Badge>
      );
    }
    // All normal (정상등원) - don't show badge
    return null;
  }
  
  // 미등원 or absent - RED (high visibility)
  if (hasAbsent || hasNoShow) {
    return (
      <Badge className="bg-red-500 text-white border-red-600 text-xs font-medium shadow-sm">
        {displayStatus.join(', ')}
      </Badge>
    );
  }
  
  // 지각 or early leave - AMBER
  if (hasLateOrEarly) {
    return (
      <Badge className="bg-amber-500 text-white border-amber-600 text-xs font-medium shadow-sm">
        {displayStatus.join(', ')}
      </Badge>
    );
  }
  
  // Other status - show as-is
  return (
    <Badge variant="outline" className="text-xs">
      {displayStatus.join(', ')}
    </Badge>
  );
}



export default function AssistantDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [collapsedTeachers, setCollapsedTeachers] = useState<Set<string>>(new Set());
  
  // ASSISTANT-ROSTER-RESTORE-V1
  const [fetchError, setFetchError] = useState<{ page: string; status: number | string; message: string } | null>(null);
  const [debugCounts, setDebugCounts] = useState<{ scheduledSlots: number; rosterStudents: number; extraSessions: number }>({
    scheduledSlots: 0,
    rosterStudents: 0,
    extraSessions: 0,
  });
  
  // Date selection
  const [selectedDate, setSelectedDate] = useState<Date>(getKSTDateObject());
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Filters
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNotDone, setFilterNotDone] = useState(false);
  const [filterHasTest, setFilterHasTest] = useState(false);
  const [filterFollowup, setFilterFollowup] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<{
    date: string;
    student_id: string;
    student_name: string;
    class_id: string;
    class_name: string;
    subject: string;
    teacher_id: string;
    teacher_name: string;
    start_time: string;
    existingRecordId: string | null;
  } | null>(null);

  // Test visit modal state
  const [testVisitModalOpen, setTestVisitModalOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user, selectedDate]);

  async function fetchAllData() {
    try {
      setLoading(true);
      setFetchError(null);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      console.log('[AssistantDashboard] fetchAllData started, date:', dateStr);
      
      // ASSISTANT-ROSTER-RESTORE-V1: Call the RPC which returns flat array of roster rows
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_teacher_roster_sheet',
        { _date: dateStr }
      );

      if (rpcError) {
        const errInfo = { page: 'Assistant', status: rpcError.code || 'UNKNOWN', message: rpcError.message };
        console.error('ASSISTANT_ROSTER_ERROR:', errInfo);
        setFetchError(errInfo);
        setDebugCounts({ scheduledSlots: 0, rosterStudents: 0, extraSessions: 0 });
        toast({
          title: '데이터 로드 오류',
          description: '로스터 데이터를 불러오는 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        setAllTeachers([]);
        setRoster([]);
        setLoading(false);
        return;
      }

      // ASSISTANT-ROSTER-RESTORE-V1: RPC returns flat array, NOT { teachers, roster_rows }
      // Transform flat array into the structure we need
      const rosterRowsRaw = (Array.isArray(rpcData) ? rpcData : []) as {
        teacher_id: string;
        teacher_name: string;
        student_id: string;
        student_name: string;
        class_id: string;
        class_name: string;
        subject: string;
        start_time: string;
        end_time: string;
      }[];

      console.log('[AssistantDashboard] RPC returned', rosterRowsRaw.length, 'roster rows');

      // Extract unique teachers from roster rows
      const teacherMap = new Map<string, string>();
      rosterRowsRaw.forEach(r => {
        if (r.teacher_id && r.teacher_name) {
          teacherMap.set(r.teacher_id, r.teacher_name);
        }
      });

      // Determine which teachers have lessons
      const teacherIdsWithLessons = new Set(rosterRowsRaw.map(r => r.teacher_id));

      // Build teacher list from extracted data
      const teachersList: Teacher[] = Array.from(teacherMap.entries()).map(([id, name]) => ({
        id,
        name,
        hasLessonsOnDate: teacherIdsWithLessons.has(id),
      }));

      // Sort: teachers with lessons first
      teachersList.sort((a, b) => {
        if (a.hasLessonsOnDate !== b.hasLessonsOnDate) {
          return a.hasLessonsOnDate ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Fetch homework status / first subject / followup using existing RPC
      let previousHomeworkMap: Record<string, { 
        status: RosterStudent['previousHomeworkStatus']; 
        firstSubject: boolean;
        followup2wDue: boolean;
      }> = {};

      if (rosterRowsRaw.length > 0) {
        const rpcPairs = rosterRowsRaw.map(r => ({
          student_id: r.student_id,
          class_id: r.class_id,
          subject: r.subject,
        }));

        const { data: hwResult, error: hwError } = await supabase.rpc(
          'get_prev_homework_status_for_roster',
          { _pairs: rpcPairs, _today: dateStr }
        );

        if (!hwError && hwResult) {
          (hwResult as any[]).forEach((row: any) => {
            const key = `${row.student_id}:${row.class_id}`;
            previousHomeworkMap[key] = {
              status: normalizeHomeworkStatus(row.homework_status),
              firstSubject: row.first_subject === true,
              followup2wDue: row.followup_2w_due === true,
            };
          });
        }
      }

      // Fetch lesson records for selected date (existing + 휴강 + hasTest + attendance_status)
      const studentIds = [...new Set(rosterRowsRaw.map(r => r.student_id))];
      const classIds = [...new Set(rosterRowsRaw.map(r => r.class_id))];

      let existingRecordMap: Record<string, string> = {};
      let hyugangMap: Record<string, string> = {};
      let hasTestMap: Record<string, boolean> = {};
      let attendanceMap: Record<string, string[]> = {};
      // HW-ISSUE-BADGE-TODAY-V1: Track homework_check_note for today
      let homeworkIssueMap: Record<string, string | null> = {};

      if (studentIds.length > 0 && classIds.length > 0) {
        const { data: dateRecords } = await supabase
          .from('lesson_records')
          .select('id, student_id, class_id, lesson_types, test_result_text, attendance_status, homework_check_note')
          .eq('lesson_date', dateStr)
          .in('student_id', studentIds)
          .in('class_id', classIds);

        (dateRecords || []).forEach((lr: any) => {
          const key = `${lr.student_id}:${lr.class_id}`;
          existingRecordMap[key] = lr.id;
          if (lr.lesson_types && lr.lesson_types.includes('휴강')) {
            hyugangMap[key] = lr.id;
          }
          if (lr.test_result_text && lr.test_result_text.trim() !== '') {
            hasTestMap[key] = true;
          }
          attendanceMap[key] = lr.attendance_status || ['정상등원'];
          // HW-ISSUE-BADGE-TODAY-V1: Check for homework_check_note
          if (lr.homework_check_note && lr.homework_check_note.trim() !== '') {
            homeworkIssueMap[key] = lr.homework_check_note;
          }
        });
      }

      // Build final roster
      const rosterData: RosterStudent[] = rosterRowsRaw.map(r => {
        const key = `${r.student_id}:${r.class_id}`;
        const mapped = previousHomeworkMap[key];
        return {
          student_id: r.student_id,
          student_name: r.student_name,
          class_id: r.class_id,
          class_name: r.class_name,
          subject: r.subject,
          start_time: r.start_time,
          end_time: r.end_time,
          teacher_id: r.teacher_id,
          teacher_name: r.teacher_name,
          previousHomeworkStatus: mapped?.status || null,
          firstSubject: mapped?.firstSubject || false,
          followup2wDue: mapped?.followup2wDue || false,
          existingRecordId: existingRecordMap[key] || null,
          hasTest: hasTestMap[key] || false,
          hyugangRecordId: hyugangMap[key] || null,
          attendanceStatus: attendanceMap[key] || ['정상등원'],
          // HW-ISSUE-BADGE-TODAY-V1
          hasHomeworkIssue: !!homeworkIssueMap[key],
          homeworkCheckNote: homeworkIssueMap[key] || null,
        };
      });

      // Sort roster by teacher name, then start time
      rosterData.sort((a, b) => {
        if (a.teacher_name !== b.teacher_name) {
          return a.teacher_name.localeCompare(b.teacher_name);
        }
        return a.start_time.localeCompare(b.start_time);
      });

      // Fetch holidays
      const { data: holidaysData } = await supabase
        .from('holidays')
        .select('*')
        .eq('holiday_date', dateStr);

      // Set collapsed state for teachers with no lessons
      const noLessonsTeacherIds = teachersList
        .filter(t => !t.hasLessonsOnDate)
        .map(t => t.id);

      // ASSISTANT-ROSTER-RESTORE-V1: Update debug counts
      const uniqueClassIds = new Set(rosterRowsRaw.map(r => r.class_id));
      setDebugCounts({
        scheduledSlots: uniqueClassIds.size,
        rosterStudents: rosterRowsRaw.length,
        extraSessions: 0, // Not implemented yet
      });

      setAllTeachers(teachersList);
      setRoster(rosterData);
      setHolidays((holidaysData || []) as Holiday[]);
      setCollapsedTeachers(new Set(noLessonsTeacherIds));
      
      // DEBUG: Log attendance data fetched
      const attendanceCount = Object.keys(attendanceMap).length;
      console.log('[AssistantDashboard] fetchAllData complete - attendanceUpdated=true, rosterUpdated=true, attendanceRecords:', attendanceCount, 'teachersFound:', teachersList.length);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      const errInfo = { page: 'Assistant', status: error?.code || 'ERR', message: error?.message || 'Unknown error' };
      console.error('DEBUG_FETCH_ERROR: Assistant', errInfo);
      if (!fetchError) {
        setFetchError(errInfo);
      }
      toast({
        title: '데이터 로드 오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Apply filters
  const filteredRoster = roster.filter(item => {
    if (selectedTeacher !== 'all' && item.teacher_id !== selectedTeacher) return false;
    if (searchQuery && !item.student_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterNotDone && item.previousHomeworkStatus !== 'not_done' && item.previousHomeworkStatus !== 'partial') return false;
    if (filterHasTest && !item.hasTest) return false;
    if (filterFollowup && !item.followup2wDue) return false;
    return true;
  });

  // Group by teacher (for roster)
  const rosterByTeacher = filteredRoster.reduce((acc, item) => {
    if (!acc[item.teacher_id]) {
      acc[item.teacher_id] = [];
    }
    acc[item.teacher_id].push(item);
    return acc;
  }, {} as Record<string, RosterStudent[]>);

  // Build complete teacher groups (including teachers with no lessons)
  const teacherGroups = allTeachers.map(teacher => ({
    teacher_id: teacher.id,
    teacher_name: teacher.name,
    hasLessonsOnDate: teacher.hasLessonsOnDate,
    students: rosterByTeacher[teacher.id] || [],
  }));

  // Filter teacher groups based on selectedTeacher
  const filteredTeacherGroups = selectedTeacher === 'all' 
    ? teacherGroups 
    : teacherGroups.filter(g => g.teacher_id === selectedTeacher);

  // Toggle collapsed state
  const toggleCollapsed = (teacherId: string) => {
    setCollapsedTeachers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teacherId)) {
        newSet.delete(teacherId);
      } else {
        newSet.add(teacherId);
      }
      return newSet;
    });
  };

  // Stats
  const totalStudents = roster.length;
  const overdueHomeworkCount = roster.filter(r => r.previousHomeworkStatus === 'not_done' || r.previousHomeworkStatus === 'partial').length;
  const testsCount = roster.filter(r => r.hasTest).length;
  const followup2wCount = roster.filter(r => r.followup2wDue).length;
  const totalTeachers = allTeachers.length;
  const activeTeachers = allTeachers.filter(t => t.hasLessonsOnDate).length;

  // Date helpers
  const isToday = format(selectedDate, 'yyyy-MM-dd') === getTodayKST();
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

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

  return (
    <div className="space-y-6">
      {/* ASSISTANT-ROSTER-RESTORE-V1 */}
      <div className="sticky top-0 z-50 bg-green-400 text-green-900 text-xs text-center py-1 font-mono">
        ASSISTANT-ROSTER-RESTORE-V1
      </div>
      
      {/* Debug counts banner */}
      <div className="bg-muted/50 text-muted-foreground text-xs py-2 px-4 font-mono rounded text-center">
        ROSTER_DEBUG: scheduledSlots={debugCounts.scheduledSlots} rosterStudents={debugCounts.rosterStudents} extraSessions={debugCounts.extraSessions}
      </div>
      
      {/* Fetch error banner */}
      {fetchError && (
        <div className="bg-red-500 text-white text-xs py-2 px-4 font-mono rounded">
          ASSISTANT_ROSTER_ERROR: status={fetchError.status} message={fetchError.message}
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">오늘 수업(조교)</h1>
          <p className="text-muted-foreground mt-1">
            {isToday ? '오늘' : format(selectedDate, 'M월 d일', { locale: ko })} 수업 전체 현황 및 숙제/테스트 관리
          </p>
        </div>
        
        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[140px]">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(selectedDate, 'M월 d일 (EEE)', { locale: ko })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }
                }}
                locale={ko}
              />
            </PopoverContent>
          </Popover>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          <div className="flex gap-1 ml-2">
            <Button
              variant={format(subDays(getKSTDateObject(), 1), 'yyyy-MM-dd') === dateStr ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedDate(subDays(getKSTDateObject(), 1))}
            >
              어제
            </Button>
            <Button
              variant={isToday ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedDate(getKSTDateObject())}
            >
              오늘
            </Button>
            <Button
              variant={format(addDays(getKSTDateObject(), 1), 'yyyy-MM-dd') === dateStr ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedDate(addDays(getKSTDateObject(), 1))}
            >
              내일
            </Button>
          </div>

          {/* Test Visit Button - ASSISTANT-TEST-ENTRYPOINT-V1 */}
          <Button
            variant="default"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
            onClick={() => setTestVisitModalOpen(true)}
          >
            <FlaskConical className="w-4 h-4 mr-2" />
            테스트만 등록
          </Button>
          {/* ASSISTANT-TEST-ENTRYPOINT-V1 */}
        </div>
      </div>

      {/* Holiday Banner */}
      {holidays.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CalendarIcon className="w-5 h-5 text-amber-600" />
              <div>
                <span className="font-medium text-amber-700">
                  {holidays.some(h => h.scope === 'all') 
                    ? `${isToday ? '오늘' : format(selectedDate, 'M월 d일', { locale: ko })}은 휴강일(전체)입니다` 
                    : `${isToday ? '오늘' : format(selectedDate, 'M월 d일', { locale: ko })}은 일부 휴강일입니다`}
                </span>
                <span className="text-muted-foreground ml-2">
                  {holidays.map(h => h.name).join(', ')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assistant Checklist Section - ASSISTANT-TEST-ENTRYPOINT-V1 */}
      <AssistantChecklist onTestOnlyVisit={() => setTestVisitModalOpen(true)} />

      {/* Test Visits List for the day */}
      <TestVisitsList date={dateStr} />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title={isToday ? '오늘 수업 학생' : '해당일 수업 학생'}
          value={totalStudents}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="미이행 숙제"
          value={overdueHomeworkCount}
          icon={<AlertCircle className="w-5 h-5" />}
          className={overdueHomeworkCount > 0 ? 'border-red-500/30' : ''}
        />
        <StatCard
          title="테스트 예정"
          value={testsCount}
          icon={<ClipboardCheck className="w-5 h-5" />}
        />
        <StatCard
          title="2주후 연락"
          value={followup2wCount}
          icon={<Phone className="w-5 h-5" />}
          className={followup2wCount > 0 ? 'border-purple-500/30' : ''}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Teacher Filter */}
            <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="선생님 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선생님 ({totalTeachers}명)</SelectItem>
                {allTeachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {!t.hasLessonsOnDate && '(수업 없음)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생 이름 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Quick Toggles */}
            <div className="flex items-center gap-2">
              <Button
                variant={filterNotDone ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterNotDone(!filterNotDone)}
                className={filterNotDone ? 'bg-red-500 hover:bg-red-600' : ''}
              >
                <AlertCircle className="w-4 h-4 mr-1" />
                미이행만
              </Button>
              <Button
                variant={filterHasTest ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterHasTest(!filterHasTest)}
                className={filterHasTest ? 'bg-blue-500 hover:bg-blue-600' : ''}
              >
                <ClipboardCheck className="w-4 h-4 mr-1" />
                테스트
              </Button>
              <Button
                variant={filterFollowup ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterFollowup(!filterFollowup)}
                className={filterFollowup ? 'bg-purple-500 hover:bg-purple-600' : ''}
              >
                <Phone className="w-4 h-4 mr-1" />
                2주후 연락
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grouped Roster by Teacher */}
      {filteredTeacherGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                선생님 정보가 없습니다.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Summary of teachers */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="w-4 h-4" />
            <span>전체 {totalTeachers}명 중 {activeTeachers}명 수업 진행</span>
          </div>

          {filteredTeacherGroups.map((group) => {
            const isCollapsed = collapsedTeachers.has(group.teacher_id);
            const hasStudents = group.students.length > 0;

            // If filtering and no matching students, skip this teacher
            if (selectedTeacher === 'all' && (searchQuery || filterNotDone || filterHasTest || filterFollowup) && !hasStudents && group.hasLessonsOnDate) {
              return null;
            }

            return (
              <Collapsible
                key={group.teacher_id}
                open={!isCollapsed}
                onOpenChange={() => toggleCollapsed(group.teacher_id)}
              >
                <Card className={`${group.hasLessonsOnDate ? 'border-primary/20' : 'border-muted'}`}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                          <GraduationCap className={`w-5 h-5 ${group.hasLessonsOnDate ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className={group.hasLessonsOnDate ? '' : 'text-muted-foreground'}>
                            {group.teacher_name} 선생님
                          </span>
                        </div>
                        <Badge variant={group.hasLessonsOnDate ? 'secondary' : 'outline'}>
                          {group.hasLessonsOnDate ? `${group.students.length}명` : '0명'}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {!group.hasLessonsOnDate ? (
                        <div className="py-4 text-center text-muted-foreground">
                          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>{isToday ? '오늘' : '해당일'} 수업 없음</p>
                        </div>
                      ) : group.students.length === 0 ? (
                        <div className="py-4 text-center text-muted-foreground">
                          <p>검색 결과가 없습니다.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {group.students.map((student) => (
                            <div
                              key={`${student.student_id}-${student.class_id}`}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                student.hyugangRecordId ? 'bg-muted/50' : 'bg-secondary/50'
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
                                <span className={`font-medium ${student.hyugangRecordId ? 'text-muted-foreground' : 'text-foreground'}`}>
                                  {student.student_name}
                                </span>
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <span>{student.class_name}</span>
                                  <span className="text-xs">({student.start_time.slice(0, 5)})</span>
                                </div>
                                <Badge variant="outline" className="text-xs">{student.subject}</Badge>
                                
                                {/* Badges */}
                                {student.hyugangRecordId ? (
                                  <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">휴강</Badge>
                                ) : (
                                  <>
                                    {/* Attendance badge - show first for visibility */}
                                    {getAttendanceStatusBadge(student.attendanceStatus)}
                                    {student.previousHomeworkStatus === 'not_done' && (
                                      <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">
                                        지난 숙제 미이행
                                      </Badge>
                                    )}
                                    {student.previousHomeworkStatus === 'partial' && (
                                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                                        지난 숙제 일부완료
                                      </Badge>
                                    )}
                                    {student.firstSubject && student.previousHomeworkStatus !== 'not_done' && student.previousHomeworkStatus !== 'partial' && (
                                      <Badge variant="outline" className="text-muted-foreground border-muted text-xs">
                                        첫 {student.subject} 수업
                                      </Badge>
                                    )}
                                    {student.followup2wDue && (
                                      <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 text-xs">
                                        첫등록 2주후(연락)
                                      </Badge>
                                    )}
                                    {student.hasTest && (
                                      <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">
                                        테스트
                                      </Badge>
                                    )}
                                    {/* HW-ISSUE-BADGE-TODAY-V1: Show issue badge when homework_check_note exists */}
                                    {student.hasHomeworkIssue && (
                                      <Badge 
                                        className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-xs cursor-pointer hover:bg-orange-500/25"
                                        onClick={() => {
                                          setModalContext({
                                            date: dateStr,
                                            student_id: student.student_id,
                                            student_name: student.student_name,
                                            class_id: student.class_id,
                                            class_name: student.class_name,
                                            subject: student.subject,
                                            teacher_id: student.teacher_id,
                                            teacher_name: student.teacher_name,
                                            start_time: student.start_time,
                                            existingRecordId: student.existingRecordId,
                                          });
                                          setModalOpen(true);
                                        }}
                                        title={student.homeworkCheckNote || '이슈 있음'}
                                      >
                                        이슈
                                      </Badge>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* Actions - Open Modal instead of navigating */}
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setModalContext({
                                      date: dateStr,
                                      student_id: student.student_id,
                                      student_name: student.student_name,
                                      class_id: student.class_id,
                                      class_name: student.class_name,
                                      subject: student.subject,
                                      teacher_id: student.teacher_id,
                                      teacher_name: student.teacher_name,
                                      start_time: student.start_time,
                                      existingRecordId: student.existingRecordId,
                                    });
                                    setModalOpen(true);
                                  }}
                                >
                                  <CheckSquare className="w-3.5 h-3.5 mr-1" />
                                  숙제/테스트
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Roster Action Modal */}
      <RosterActionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        context={modalContext}
        mode="HOMEWORK_TEST"
        onSaved={() => {
          console.log('[AssistantDashboard] Modal onSaved triggered - refetching roster data');
          fetchAllData();
        }}
      />

      {/* Test Visit Modal */}
      <TestVisitModal
        open={testVisitModalOpen}
        onOpenChange={setTestVisitModalOpen}
        onSaved={() => {
          console.log('[AssistantDashboard] TestVisit onSaved triggered - refetching data');
          fetchAllData();
        }}
      />
    </div>
  );
}
