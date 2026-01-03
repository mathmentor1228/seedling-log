import { useState, useEffect, useMemo } from 'react';
import { useAuth, isAdmin, isAssistant } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Search, ChevronDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

// Subtle day color styles - very low saturation backgrounds
const DAY_COLORS: Record<number, string> = {
  0: 'bg-rose-50/50 dark:bg-rose-950/20',      // Sunday
  1: 'bg-amber-50/50 dark:bg-amber-950/20',    // Monday
  2: 'bg-emerald-50/50 dark:bg-emerald-950/20', // Tuesday
  3: 'bg-sky-50/50 dark:bg-sky-950/20',        // Wednesday
  4: 'bg-violet-50/50 dark:bg-violet-950/20',  // Thursday
  5: 'bg-orange-50/50 dark:bg-orange-950/20',  // Friday
  6: 'bg-slate-50/50 dark:bg-slate-950/20',    // Saturday
};

const STUDENT_PAGE_SIZE = 50;

interface ScheduleRow {
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherName: string;
  students: { id: string; name: string }[];
}

interface Teacher {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
}

interface StudentScheduleRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacherName: string;
  className: string;
}

export function Timetable() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdminUser = isAdmin(role);
  const isAssistantUser = isAssistant(role);
  const canViewAllStudents = isAdminUser || isAssistantUser;
  
  // DEBUG-MARKER-STUDENTS-V1
  const [fetchError, setFetchError] = useState<{ page: string; status: number | string; message: string } | null>(null);
  
  // Teacher schedule states
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);
  const [timetableCopied, setTimetableCopied] = useState(false);

  // Student lookup states with pagination
  const [students, setStudents] = useState<Student[]>([]);
  const [totalStudentCount, setTotalStudentCount] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [studentScheduleRows, setStudentScheduleRows] = useState<StudentScheduleRow[]>([]);
  const [studentScheduleLoading, setStudentScheduleLoading] = useState(false);
  const [studentCopied, setStudentCopied] = useState(false);

  useEffect(() => {
    fetchScheduleData();
  }, [user, isAdminUser]);

  // Fetch students with pagination when search changes or page changes
  useEffect(() => {
    if (canViewAllStudents) {
      fetchStudents();
    }
  }, [studentPage, studentSearchQuery, canViewAllStudents]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchStudentSchedule(selectedStudentId);
    } else {
      setStudentScheduleRows([]);
    }
  }, [selectedStudentId]);

  async function fetchScheduleData() {
    setLoading(true);
    try {
      // For teachers: fetch only their schedules
      // For admins: fetch all schedules
      let scheduleQuery = supabase
        .from('class_schedules')
        .select(`
          id, class_id, day_of_week, start_time, end_time, teacher_id, is_active,
          classes (id, name, subject, teacher_id)
        `)
        .eq('is_active', true);

      if (!isAdminUser && user) {
        scheduleQuery = scheduleQuery.eq('teacher_id', user.id);
      }

      const { data: schedulesData, error: schedError } = await scheduleQuery;
      if (schedError) throw schedError;

      // Collect all teacher IDs and class IDs
      const teacherIds = new Set<string>();
      const classIds = new Set<string>();

      (schedulesData || []).forEach((s: any) => {
        if (s.teacher_id) teacherIds.add(s.teacher_id);
        if (s.classes?.teacher_id) teacherIds.add(s.classes.teacher_id);
        if (s.class_id) classIds.add(s.class_id);
      });

      // Fetch teacher profiles
      let teacherMap: Record<string, string> = {};
      if (teacherIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(teacherIds));

        if (profiles) {
          teacherMap = profiles.reduce((acc: Record<string, string>, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {});
        }
      }

      // Batch fetch students for all classes
      let studentsByClass: Record<string, { id: string; name: string }[]> = {};
      if (classIds.size > 0) {
        const { data: classStudents } = await supabase
          .from('class_students')
          .select('class_id, student_id')
          .in('class_id', Array.from(classIds));

        if (classStudents && classStudents.length > 0) {
          const studentIds = [...new Set(classStudents.map((cs) => cs.student_id))];
          
          const { data: studentsData } = await supabase
            .from('students')
            .select('id, name')
            .in('id', studentIds);

          const studentMap: Record<string, string> = {};
          (studentsData || []).forEach((s) => {
            studentMap[s.id] = s.name;
          });

          classStudents.forEach((cs) => {
            if (!studentsByClass[cs.class_id]) {
              studentsByClass[cs.class_id] = [];
            }
            studentsByClass[cs.class_id].push({
              id: cs.student_id,
              name: studentMap[cs.student_id] || '이름없음',
            });
          });

          // Sort students by name
          Object.keys(studentsByClass).forEach((classId) => {
            studentsByClass[classId].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      }

      // Build schedule rows
      const rows: ScheduleRow[] = (schedulesData || []).map((s: any) => {
        const teacherId = s.teacher_id || s.classes?.teacher_id;
        return {
          classId: s.class_id,
          className: s.classes?.name || '',
          subject: s.classes?.subject || '',
          dayOfWeek: s.day_of_week,
          startTime: s.start_time,
          endTime: s.end_time,
          teacherId: teacherId || '',
          teacherName: teacherId ? teacherMap[teacherId] || '미배정' : '미배정',
          students: studentsByClass[s.class_id] || [],
        };
      });

      // Sort by day then time
      rows.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      });

      setScheduleRows(rows);

      // For admin: build teacher list
      if (isAdminUser) {
        const uniqueTeachers = new Map<string, string>();
        rows.forEach((r) => {
          if (r.teacherId) {
            uniqueTeachers.set(r.teacherId, r.teacherName);
          }
        });
        setTeachers(
          Array.from(uniqueTeachers.entries()).map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        // Expand all teachers by default
        setExpandedTeachers(new Set(uniqueTeachers.keys()));
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
      toast({
        title: '오류',
        description: '시간표를 불러오지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents() {
    setStudentsLoading(true);
    setFetchError(null);
    try {
      const offset = (studentPage - 1) * STUDENT_PAGE_SIZE;
      
      // Build query with optional search filter
      let query = supabase
        .from('students')
        .select('id, name', { count: 'exact' });
      
      // Apply search filter (partial match on name)
      if (studentSearchQuery.trim()) {
        query = query.ilike('name', `%${studentSearchQuery.trim()}%`);
      }
      
      // Apply stable ordering and pagination
      const { data, error, count } = await query
        .order('name', { ascending: true })
        .order('created_at', { ascending: true })
        .range(offset, offset + STUDENT_PAGE_SIZE - 1);

      if (error) {
        const errInfo = { page: 'Students', status: error.code || 'UNKNOWN', message: error.message };
        console.error('DEBUG_FETCH_ERROR: Students', errInfo);
        setFetchError(errInfo);
        throw error;
      }
      
      setStudents(data || []);
      setTotalStudentCount(count || 0);
    } catch (error: any) {
      console.error('Error fetching students:', error);
      if (!fetchError) {
        setFetchError({ page: 'Students', status: error?.code || 'ERR', message: error?.message || 'Unknown error' });
      }
      setStudents([]);
      setTotalStudentCount(0);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function fetchStudentSchedule(studentId: string) {
    setStudentScheduleLoading(true);
    try {
      const { data: classStudents, error: csError } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', studentId);

      if (csError) throw csError;

      if (!classStudents || classStudents.length === 0) {
        setStudentScheduleRows([]);
        return;
      }

      const classIds = classStudents.map((cs) => cs.class_id);

      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          id, name, subject, teacher_id,
          class_schedules (id, day_of_week, start_time, end_time, is_active, teacher_id)
        `)
        .in('id', classIds);

      if (classError) throw classError;

      const teacherIds = new Set<string>();
      (classData || []).forEach((c: any) => {
        if (c.teacher_id) teacherIds.add(c.teacher_id);
        (c.class_schedules || []).forEach((s: any) => {
          if (s.teacher_id) teacherIds.add(s.teacher_id);
        });
      });

      let teacherMap: Record<string, string> = {};
      if (teacherIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(teacherIds));

        if (profiles) {
          teacherMap = profiles.reduce((acc: Record<string, string>, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {});
        }
      }

      const rows: StudentScheduleRow[] = [];
      (classData || []).forEach((cls: any) => {
        (cls.class_schedules || []).filter((s: any) => s.is_active).forEach((sch: any) => {
          const teacherId = sch.teacher_id || cls.teacher_id;
          rows.push({
            dayOfWeek: sch.day_of_week,
            startTime: sch.start_time,
            endTime: sch.end_time,
            subject: cls.subject,
            teacherName: teacherId ? teacherMap[teacherId] || '미배정' : '미배정',
            className: cls.name,
          });
        });
      });

      rows.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      });

      setStudentScheduleRows(rows);
    } catch (error) {
      console.error('Error fetching student schedule:', error);
      toast({
        title: '오류',
        description: '학생 시간표를 불러오지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setStudentScheduleLoading(false);
    }
  }

  const formatTime = (time: string) => time.slice(0, 5);

  const handleCopySlotStudents = async (classId: string, students: { id: string; name: string }[]) => {
    if (students.length === 0) return;
    const names = students.map((s) => s.name).join(', ');
    try {
      await navigator.clipboard.writeText(names);
      setCopiedSlotId(classId);
      toast({ title: '복사됨', description: '학생 명단이 복사되었습니다' });
      setTimeout(() => setCopiedSlotId(null), 2000);
    } catch {
      toast({
        title: '복사 실패',
        description: '클립보드 복사에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  // Filter rows by selected teacher (admin)
  const filteredScheduleRows = useMemo(() => {
    if (!isAdminUser || selectedTeacherId === 'all') return scheduleRows;
    return scheduleRows.filter((r) => r.teacherId === selectedTeacherId);
  }, [scheduleRows, selectedTeacherId, isAdminUser]);

  // Group rows by teacher for "all" view
  const groupedByTeacher = useMemo(() => {
    if (!isAdminUser || selectedTeacherId !== 'all') return null;
    const grouped: Record<string, ScheduleRow[]> = {};
    scheduleRows.forEach((row) => {
      const key = row.teacherId || 'unassigned';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });
    return grouped;
  }, [scheduleRows, selectedTeacherId, isAdminUser]);

  // Generate copy text for whole timetable
  const timetableCopyText = useMemo(() => {
    const rows = filteredScheduleRows;
    if (rows.length === 0) return '';
    
    const teacherName = isAdminUser && selectedTeacherId !== 'all'
      ? teachers.find(t => t.id === selectedTeacherId)?.name || ''
      : '';
    
    const lines = [
      teacherName ? `[${teacherName} 선생님 시간표]` : '[주간 시간표]',
      ''
    ];
    
    rows.forEach((row) => {
      const dayLabel = DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label || '';
      const studentNames = row.students.map(s => s.name).join(', ');
      lines.push(
        `${dayLabel} ${formatTime(row.startTime)}-${formatTime(row.endTime)} ${row.subject} (${row.className}) - ${studentNames || '학생없음'}`
      );
    });
    
    return lines.join('\n');
  }, [filteredScheduleRows, selectedTeacherId, teachers, isAdminUser]);

  const handleCopyTimetable = async () => {
    if (!timetableCopyText) return;
    try {
      await navigator.clipboard.writeText(timetableCopyText);
      setTimetableCopied(true);
      toast({ title: '복사됨', description: '시간표가 클립보드에 복사되었습니다' });
      setTimeout(() => setTimetableCopied(false), 2000);
    } catch {
      toast({
        title: '복사 실패',
        description: '클립보드 복사에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  // Student timetable copy text
  const studentCopyText = useMemo(() => {
    if (!selectedStudentName || studentScheduleRows.length === 0) return '';
    const lines = [`[${selectedStudentName} 주간 시간표]`, ''];
    studentScheduleRows.forEach((row) => {
      const dayLabel = DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label || '';
      lines.push(
        `${dayLabel} ${formatTime(row.startTime)}-${formatTime(row.endTime)} ${row.subject}(${row.teacherName})`
      );
    });
    return lines.join('\n');
  }, [selectedStudentName, studentScheduleRows]);

  const handleCopyStudentTimetable = async () => {
    if (!studentCopyText) return;
    try {
      await navigator.clipboard.writeText(studentCopyText);
      setStudentCopied(true);
      toast({ title: '복사됨', description: '학생 시간표가 클립보드에 복사되었습니다' });
      setTimeout(() => setStudentCopied(false), 2000);
    } catch {
      toast({
        title: '복사 실패',
        description: '클립보드 복사에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const student = students.find((s) => s.id === studentId);
    setSelectedStudentName(student?.name || '');
  };

  const toggleTeacherExpand = (teacherId: string) => {
    setExpandedTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  };

  const renderScheduleTable = (rows: ScheduleRow[], showTeacherColumn = false) => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <TableRow className="text-xs">
            <TableHead className="py-2 px-3 w-[60px]">요일</TableHead>
            <TableHead className="py-2 px-3 w-[70px]">시간</TableHead>
            <TableHead className="py-2 px-3 w-[60px]">과목</TableHead>
            {showTeacherColumn && <TableHead className="py-2 px-3 w-[80px]">선생님</TableHead>}
            <TableHead className="py-2 px-3 w-[100px]">클래스명</TableHead>
            <TableHead className="py-2 px-3">학생명단</TableHead>
            <TableHead className="py-2 px-3 w-[60px] text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow
              key={`${row.classId}-${row.dayOfWeek}-${idx}`}
              className={cn('text-sm', DAY_COLORS[row.dayOfWeek])}
            >
              <TableCell className="py-2 px-3">
                <Badge variant="outline" className="text-xs font-medium">
                  {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                </Badge>
              </TableCell>
              <TableCell className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                {formatTime(row.startTime)}-{formatTime(row.endTime)}
              </TableCell>
              <TableCell className="py-2 px-3">
                <Badge variant="secondary" className="text-xs">
                  {row.subject}
                </Badge>
              </TableCell>
              {showTeacherColumn && (
                <TableCell className="py-2 px-3 text-xs">
                  {row.teacherName}
                </TableCell>
              )}
              <TableCell className="py-2 px-3 text-xs truncate max-w-[100px]">
                {row.className}
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="flex flex-wrap gap-1 items-center">
                  {row.students.length === 0 ? (
                    <span className="text-xs text-muted-foreground">-</span>
                  ) : (
                    <>
                      {row.students.map((student) => (
                        <Badge
                          key={student.id}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {student.name}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">
                        총 {row.students.length}명
                      </span>
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2 px-3 text-right">
                {row.students.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCopySlotStudents(row.classId + '-' + idx, row.students)}
                  >
                    {copiedSlotId === row.classId + '-' + idx ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderStudentScheduleTable = () => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <TableRow className="text-xs">
            <TableHead className="py-2 px-3">요일</TableHead>
            <TableHead className="py-2 px-3">시간</TableHead>
            <TableHead className="py-2 px-3">과목</TableHead>
            <TableHead className="py-2 px-3">선생님</TableHead>
            <TableHead className="py-2 px-3">클래스명</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {studentScheduleRows.map((row, idx) => (
            <TableRow key={idx} className={cn('text-sm', DAY_COLORS[row.dayOfWeek])}>
              <TableCell className="py-2 px-3">
                <Badge variant="outline" className="text-xs font-medium">
                  {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                </Badge>
              </TableCell>
              <TableCell className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                {formatTime(row.startTime)}-{formatTime(row.endTime)}
              </TableCell>
              <TableCell className="py-2 px-3">
                <Badge variant="secondary" className="text-xs">
                  {row.subject}
                </Badge>
              </TableCell>
              <TableCell className="py-2 px-3 text-xs">
                {row.teacherName}
              </TableCell>
              <TableCell className="py-2 px-3 text-xs truncate max-w-[120px]">
                {row.className}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  // Teacher view: simple table of their schedules
  if (!isAdminUser) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5" />
              내 시간표
            </CardTitle>
            {scheduleRows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyTimetable}
                className="text-xs"
              >
                {timetableCopied ? (
                  <>
                    <Check className="w-3 h-3 mr-1" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    시간표 복사
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {scheduleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              등록된 시간표가 없습니다
            </p>
          ) : (
            renderScheduleTable(scheduleRows, false)
          )}
        </CardContent>
      </Card>
    );
  }

  // Admin view: tabs for teacher/student timetables
  return (
    <Card>
      {/* DEBUG-MARKER-STUDENTS-V1 */}
      <div className="sticky top-0 z-50 bg-yellow-400 text-yellow-900 text-xs text-center py-1 font-mono">
        DEBUG-MARKER-STUDENTS-V1
      </div>
      
      {/* Fetch error banner */}
      {fetchError && (
        <div className="bg-red-500 text-white text-xs py-2 px-4 font-mono">
          DEBUG_FETCH_ERROR: {fetchError.page} status={fetchError.status} message={fetchError.message}
        </div>
      )}
      
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="w-5 h-5" />
          시간표 관리
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="teacher" className="space-y-4">
          <TabsList>
            <TabsTrigger value="teacher">선생님 시간표</TabsTrigger>
            <TabsTrigger value="student">학생 시간표</TabsTrigger>
          </TabsList>

          <TabsContent value="teacher" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="선생님 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 선생님</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTeacherId !== 'all' && filteredScheduleRows.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyTimetable}
                  className="text-xs"
                >
                  {timetableCopied ? (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      시간표 복사
                    </>
                  )}
                </Button>
              )}
            </div>

            {selectedTeacherId === 'all' && groupedByTeacher ? (
              <div className="space-y-3">
                {Object.entries(groupedByTeacher).map(([teacherId, rows]) => {
                  const teacherName = rows[0]?.teacherName || '미배정';
                  const isExpanded = expandedTeachers.has(teacherId);
                  return (
                    <Collapsible key={teacherId} open={isExpanded}>
                      <CollapsibleTrigger
                        className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                        onClick={() => toggleTeacherExpand(teacherId)}
                      >
                        <span className="font-medium text-sm">{teacherName}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {rows.length}개 수업
                          </Badge>
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 transition-transform',
                              isExpanded && 'rotate-180'
                            )}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        {renderScheduleTable(rows, false)}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            ) : (
              filteredScheduleRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  시간표가 없습니다
                </p>
              ) : (
                renderScheduleTable(filteredScheduleRows, false)
              )
            )}
          </TabsContent>

          <TabsContent value="student" className="space-y-4">
            {/* Debug line */}
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded font-mono">
              STUDENT_DEBUG: loaded={students.length}, total={totalStudentCount}, page={studentPage}/{Math.ceil(totalStudentCount / STUDENT_PAGE_SIZE) || 1}, q='{studentSearchQuery}', role={role}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">학생 검색</Label>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="학생 이름 검색..."
                    value={studentSearchQuery}
                    onChange={(e) => {
                      setStudentSearchQuery(e.target.value);
                      setStudentPage(1); // Reset to first page on search
                    }}
                    className="pl-9"
                  />
                </div>
                <Select value={selectedStudentId} onValueChange={handleStudentSelect}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={studentsLoading ? '로딩중...' : '학생 선택'} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>총 {totalStudentCount}명 · {studentPage}/{Math.ceil(totalStudentCount / STUDENT_PAGE_SIZE) || 1} 페이지</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                    disabled={studentPage <= 1 || studentsLoading}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStudentPage(p => p + 1)}
                    disabled={studentPage >= Math.ceil(totalStudentCount / STUDENT_PAGE_SIZE) || studentsLoading}
                    className="h-7 px-2"
                  >
                    다음
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {selectedStudentId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{selectedStudentName} 시간표</h4>
                  {studentScheduleRows.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyStudentTimetable}
                      className="text-xs"
                    >
                      {studentCopied ? (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" />
                          복사용 텍스트
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {studentScheduleLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : studentScheduleRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    배정된 수업이 없습니다
                  </p>
                ) : (
                  renderStudentScheduleTable()
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
