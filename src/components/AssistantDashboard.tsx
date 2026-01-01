import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
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
  ChevronLeft
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

// Get KST date
function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset);
}

export default function AssistantDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [collapsedTeachers, setCollapsedTeachers] = useState<Set<string>>(new Set());
  
  // Date selection
  const [selectedDate, setSelectedDate] = useState<Date>(getKSTDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Filters
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNotDone, setFilterNotDone] = useState(false);
  const [filterHasTest, setFilterHasTest] = useState(false);
  const [filterFollowup, setFilterFollowup] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user, selectedDate]);

  async function fetchAllData() {
    try {
      setLoading(true);
      
      // Step 1: Fetch teachers first (independently)
      const teachers = await fetchAllTeachers();
      
      // Step 2: Fetch roster and holidays in parallel
      const [rosterData, holidaysData] = await Promise.all([
        fetchRosterForDate(teachers),
        fetchHolidaysForDate(),
      ]);
      
      // Step 3: Build teacher list with hasLessonsOnDate flag
      const teacherIdsWithLessons = new Set(rosterData.map(r => r.teacher_id));
      const updatedTeachers = teachers.map(t => ({
        ...t,
        hasLessonsOnDate: teacherIdsWithLessons.has(t.id),
      }));
      
      // Sort: teachers with lessons first
      updatedTeachers.sort((a, b) => {
        if (a.hasLessonsOnDate !== b.hasLessonsOnDate) {
          return a.hasLessonsOnDate ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      // Step 4: Set collapsed state for teachers with no lessons
      const noLessonsTeacherIds = updatedTeachers
        .filter(t => !t.hasLessonsOnDate)
        .map(t => t.id);
      
      setAllTeachers(updatedTeachers);
      setRoster(rosterData);
      setHolidays(holidaysData);
      setCollapsedTeachers(new Set(noLessonsTeacherIds));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: '데이터 로드 오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllTeachers(): Promise<Teacher[]> {
    try {
      // Get all users with teacher role
      const { data: teacherRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');

      if (rolesError) {
        console.error('Error fetching teacher roles:', rolesError);
        return [];
      }

      const teacherUserIds = (teacherRoles || []).map((r: any) => r.user_id);
      
      if (teacherUserIds.length === 0) return [];

      // Fetch profiles for teachers
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherUserIds);

      if (profilesError) {
        console.error('Error fetching teacher profiles:', profilesError);
        return [];
      }

      return (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || '알 수 없음',
        hasLessonsOnDate: false,
      }));
    } catch (error) {
      console.error('Error fetching all teachers:', error);
      return [];
    }
  }

  async function fetchHolidaysForDate(): Promise<Holiday[]> {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data: holidaysData } = await supabase
        .from('holidays')
        .select('*')
        .eq('holiday_date', dateStr);
      
      return (holidaysData || []) as Holiday[];
    } catch (error) {
      console.error('Error fetching holidays:', error);
      return [];
    }
  }

  async function fetchRosterForDate(teachers: Teacher[]): Promise<RosterStudent[]> {
    if (!user) return [];

    try {
      // Get day of week for selected date
      const dayOfWeek = selectedDate.getDay();
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // Build teacher map from provided teachers
      const teacherMap: Record<string, string> = {};
      teachers.forEach(t => {
        teacherMap[t.id] = t.name;
      });

      // Fetch ALL class schedules for the selected date across all teachers
      const { data: schedules, error: schedulesError } = await supabase
        .from('class_schedules')
        .select(`
          id,
          class_id,
          start_time,
          end_time,
          day_of_week,
          teacher_id,
          classes:class_id (
            id,
            name,
            subject,
            teacher_id
          )
        `)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time', { ascending: true });

      if (schedulesError) {
        console.error('Error fetching schedules:', schedulesError);
        return [];
      }

      if (!schedules || schedules.length === 0) {
        return [];
      }

      // Build class maps
      const classSubjectMap: Record<string, string> = {};
      const classNameMap: Record<string, string> = {};

      (schedules || []).forEach((s: any) => {
        if (s.classes?.id) {
          classSubjectMap[s.classes.id] = s.classes.subject;
          classNameMap[s.classes.id] = s.classes.name;
        }
      });

      // Build schedule by class map
      const scheduleByClass: Record<string, { start_time: string; end_time: string; teacher_id: string }> = {};
      (schedules || []).forEach((s: any) => {
        if (s.classes?.id) {
          scheduleByClass[s.classes.id] = {
            start_time: s.start_time,
            end_time: s.end_time,
            teacher_id: s.teacher_id,
          };
        }
      });

      // Get class IDs
      const classIds = (schedules || []).map((s: any) => s.classes?.id).filter(Boolean);

      // Fetch class students
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          class_id,
          students:student_id (id, name)
        `)
        .in('class_id', classIds);

      // Build pairs for RPC and roster
      const allPairs: { 
        studentId: string; 
        studentName: string;
        classId: string;
        className: string; 
        subject: string;
        teacherId: string;
        startTime: string;
        endTime: string;
      }[] = [];

      (classStudents || []).forEach((cs: any) => {
        if (cs.students && scheduleByClass[cs.class_id]) {
          allPairs.push({
            studentId: cs.students.id,
            studentName: cs.students.name,
            classId: cs.class_id,
            className: classNameMap[cs.class_id] || '알 수 없음',
            subject: classSubjectMap[cs.class_id] || '-',
            teacherId: scheduleByClass[cs.class_id].teacher_id,
            startTime: scheduleByClass[cs.class_id].start_time,
            endTime: scheduleByClass[cs.class_id].end_time,
          });
        }
      });

      if (allPairs.length === 0) {
        return [];
      }

      // Batch fetch previous homework status via RPC
      let previousHomeworkMap: Record<string, { 
        status: RosterStudent['previousHomeworkStatus']; 
        firstSubject: boolean;
        followup2wDue: boolean;
      }> = {};

      const rpcPairs = allPairs.map(p => ({
        student_id: p.studentId,
        class_id: p.classId,
        subject: p.subject,
      }));

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'get_prev_homework_status_for_roster',
        { _pairs: rpcPairs, _today: dateStr }
      );

      if (!rpcError && rpcResult) {
        (rpcResult as any[]).forEach((row: any) => {
          const key = `${row.student_id}:${row.class_id}`;
          previousHomeworkMap[key] = {
            status: normalizeHomeworkStatus(row.homework_status),
            firstSubject: row.first_subject === true,
            followup2wDue: row.followup_2w_due === true,
          };
        });
      }

      // Fetch lesson records for selected date to check for existing records and 휴강
      const studentIds = [...new Set(allPairs.map(p => p.studentId))];
      const { data: dateRecords } = await supabase
        .from('lesson_records')
        .select('id, student_id, class_id, lesson_types, test_result_text')
        .eq('lesson_date', dateStr)
        .in('student_id', studentIds)
        .in('class_id', classIds);

      const existingRecordMap: Record<string, string> = {};
      const hyugangMap: Record<string, string> = {};
      const hasTestMap: Record<string, boolean> = {};

      (dateRecords || []).forEach((lr: any) => {
        const key = `${lr.student_id}:${lr.class_id}`;
        existingRecordMap[key] = lr.id;
        if (lr.lesson_types && lr.lesson_types.includes('휴강')) {
          hyugangMap[key] = lr.id;
        }
        if (lr.test_result_text && lr.test_result_text.trim() !== '') {
          hasTestMap[key] = true;
        }
      });

      // Build roster
      const rosterData: RosterStudent[] = allPairs.map(p => {
        const key = `${p.studentId}:${p.classId}`;
        const mapped = previousHomeworkMap[key];
        return {
          student_id: p.studentId,
          student_name: p.studentName,
          class_id: p.classId,
          class_name: p.className,
          subject: p.subject,
          start_time: p.startTime,
          end_time: p.endTime,
          teacher_id: p.teacherId,
          teacher_name: teacherMap[p.teacherId] || '알 수 없음',
          previousHomeworkStatus: mapped?.status || null,
          firstSubject: mapped?.firstSubject || false,
          followup2wDue: mapped?.followup2wDue || false,
          existingRecordId: existingRecordMap[key] || null,
          hasTest: hasTestMap[key] || false,
          hyugangRecordId: hyugangMap[key] || null,
        };
      });

      // Sort by teacher name, then by start time
      rosterData.sort((a, b) => {
        if (a.teacher_name !== b.teacher_name) {
          return a.teacher_name.localeCompare(b.teacher_name);
        }
        return a.start_time.localeCompare(b.start_time);
      });

      return rosterData;
    } catch (error) {
      console.error('Error fetching roster:', error);
      return [];
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
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(getKSTDate(), 'yyyy-MM-dd');
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">조교 대시보드</h1>
          <p className="text-muted-foreground mt-1">
            {isToday ? '오늘' : format(selectedDate, 'M월 d일', { locale: ko })} 수업 전체 현황 및 숙제/테스트 관리
          </p>
          {/* Debug marker - remove after confirmed */}
          <p className="text-xs text-muted-foreground/60 mt-1">
            ROSTER_DEBUG: rows={roster.length}, teachers={allTeachers.length}, active={activeTeachers}
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
              variant={format(subDays(getKSTDate(), 1), 'yyyy-MM-dd') === dateStr ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedDate(subDays(getKSTDate(), 1))}
            >
              어제
            </Button>
            <Button
              variant={isToday ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedDate(getKSTDate())}
            >
              오늘
            </Button>
            <Button
              variant={format(addDays(getKSTDate(), 1), 'yyyy-MM-dd') === dateStr ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedDate(addDays(getKSTDate(), 1))}
            >
              내일
            </Button>
          </div>
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
                                  </>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/lessons?student_id=${student.student_id}&class_id=${student.class_id}&subject=${encodeURIComponent(student.subject)}&lesson_date=${dateStr}`)}
                                >
                                  <FileEdit className="w-3.5 h-3.5 mr-1" />
                                  {student.existingRecordId ? '수정' : '기록'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/lessons?student_id=${student.student_id}&class_id=${student.class_id}&subject=${encodeURIComponent(student.subject)}&lesson_date=${dateStr}&focus=test`)}
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
    </div>
  );
}
