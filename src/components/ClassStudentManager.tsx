import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, Users, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth, isAdmin } from '@/lib/auth';

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

interface ScheduleInfo {
  scheduleId: string;
  classId: string;
  className: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ConflictInfo {
  studentId: string;
  conflictingSlots: ScheduleInfo[];
}

interface ClassStudentManagerProps {
  classId: string;
  scheduleId?: string;
  onStudentCountChange?: (count: number) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

export function ClassStudentManager({ classId, scheduleId, onStudentCountChange }: ClassStudentManagerProps) {
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [assignedStudentIds, setAssignedStudentIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<ScheduleInfo | null>(null);
  const [studentConflicts, setStudentConflicts] = useState<Map<string, ScheduleInfo[]>>(new Map());
  const [adminOverride, setAdminOverride] = useState(false);
  const [activeTab, setActiveTab] = useState('available');
  const { toast } = useToast();
  const { role } = useAuth();

  useEffect(() => {
    fetchData();
  }, [classId, scheduleId]);

  async function ensureCurrentScheduleOwnClass(schedule: ScheduleInfo): Promise<ScheduleInfo> {
    const { data: siblingSchedules, error: siblingErr } = await supabase
      .from('class_schedules')
      .select('id')
      .eq('class_id', schedule.classId)
      .eq('is_active', true);
    if (siblingErr) throw siblingErr;
    if (!siblingSchedules || siblingSchedules.length <= 1) return schedule;

    const { data: sourceClass, error: sourceErr } = await supabase
      .from('classes')
      .select('name, subject, teacher_id')
      .eq('id', schedule.classId)
      .single();
    if (sourceErr) throw sourceErr;

    const { data: newClass, error: classErr } = await supabase
      .from('classes')
      .insert(sourceClass)
      .select('id')
      .single();
    if (classErr) throw classErr;

    const { data: existingStudents, error: studentsErr } = await supabase
      .from('class_students')
      .select('student_id')
      .eq('class_id', schedule.classId);
    if (studentsErr) throw studentsErr;

    if (existingStudents && existingStudents.length > 0) {
      const copied = existingStudents.map((row) => ({ class_id: newClass.id, student_id: row.student_id }));
      const { error: copyErr } = await supabase
        .from('class_students')
        .upsert(copied, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
      if (copyErr) throw copyErr;
    }

    const { error: scheduleErr } = await supabase
      .from('class_schedules')
      .update({ class_id: newClass.id })
      .eq('id', schedule.scheduleId);
    if (scheduleErr) throw scheduleErr;

    const nextSchedule = { ...schedule, classId: newClass.id };
    setCurrentSchedule(nextSchedule);
    return nextSchedule;
  }

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch the current class schedule info
      let scheduleQuery = supabase
        .from('class_schedules')
        .select(`
          id,
          class_id,
          day_of_week,
          start_time,
          end_time,
          classes!inner (
            id,
            name
          )
        `)
        .eq('is_active', true);

      scheduleQuery = scheduleId ? scheduleQuery.eq('id', scheduleId) : scheduleQuery.eq('class_id', classId).limit(1);

      const { data: currentClassSchedule, error: scheduleError } = await scheduleQuery.single();

      if (scheduleError && scheduleError.code !== 'PGRST116') {
        console.error('Error fetching schedule:', scheduleError);
      }

      if (currentClassSchedule) {
        setCurrentSchedule({
          scheduleId: currentClassSchedule.id,
          classId: currentClassSchedule.class_id,
          className: (currentClassSchedule.classes as any).name,
          dayOfWeek: currentClassSchedule.day_of_week,
          startTime: currentClassSchedule.start_time.slice(0, 5),
          endTime: currentClassSchedule.end_time.slice(0, 5),
        });
      } else {
        setCurrentSchedule(null);
      }

      // Fetch all students
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, name, grade, school')
        .neq('enrollment_status', '퇴원')
        .order('name');

      if (studentsError) throw studentsError;

      // Fetch assigned students for this class
      const { data: assignedData, error: assignedError } = await supabase
        .from('class_students')
        .select('student_id')
        .eq('class_id', currentClassSchedule?.class_id || classId);

      if (assignedError) throw assignedError;

      setAllStudents(studentsData || []);
      const assignedIds = new Set((assignedData || []).map((a) => a.student_id));
      setAssignedStudentIds(assignedIds);

      // Batch fetch all existing assignments for all students with schedule info
      // This avoids N+1 queries
      if (currentClassSchedule && studentsData && studentsData.length > 0) {
        const studentIds = studentsData.map(s => s.id);
        
        const { data: allAssignments, error: assignmentsError } = await supabase
          .from('class_students')
          .select(`
            student_id,
            class_id,
            classes!inner (
              id,
              name
            )
          `)
          .in('student_id', studentIds)
          .neq('class_id', currentClassSchedule.class_id); // Exclude current slot's class

        if (assignmentsError) {
          console.error('Error fetching assignments:', assignmentsError);
        }

        // Fetch schedules for all these classes
        if (allAssignments && allAssignments.length > 0) {
          const otherClassIds = [...new Set(allAssignments.map(a => a.class_id))];
          
          const { data: otherSchedules, error: otherSchedulesError } = await supabase
            .from('class_schedules')
            .select(`
              id,
              class_id,
              day_of_week,
              start_time,
              end_time,
              classes!inner (
                id,
                name
              )
            `)
            .in('class_id', otherClassIds)
            .eq('is_active', true);

          if (otherSchedulesError) {
            console.error('Error fetching other schedules:', otherSchedulesError);
          }

          // Build a map of classId -> schedule info
          const scheduleMap = new Map<string, ScheduleInfo>();
          (otherSchedules || []).forEach((s: any) => {
            scheduleMap.set(s.class_id, {
              scheduleId: s.id,
              classId: s.class_id,
              className: s.classes.name,
              dayOfWeek: s.day_of_week,
              startTime: s.start_time.slice(0, 5),
              endTime: s.end_time.slice(0, 5),
            });
          });

          // Compute conflicts for each student
          const conflicts = new Map<string, ScheduleInfo[]>();
          const currentDayOfWeek = currentClassSchedule.day_of_week;
          const currentStart = currentClassSchedule.start_time.slice(0, 5);
          const currentEnd = currentClassSchedule.end_time.slice(0, 5);

          allAssignments.forEach((assignment: any) => {
            const schedule = scheduleMap.get(assignment.class_id);
            if (!schedule) return;

            // Check for time overlap on same day
            // Overlap: same day AND (startA < endB) AND (startB < endA)
            if (
              schedule.dayOfWeek === currentDayOfWeek &&
              currentStart < schedule.endTime &&
              schedule.startTime < currentEnd
            ) {
              const existing = conflicts.get(assignment.student_id) || [];
              existing.push(schedule);
              conflicts.set(assignment.student_id, existing);
            }
          });

          setStudentConflicts(conflicts);
        } else {
          setStudentConflicts(new Map());
        }
      } else {
        setStudentConflicts(new Map());
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: '데이터 로딩 오류',
        description: error.message || '학생 목록을 불러오지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStudent(studentId: string, isCurrentlyAssigned: boolean, forceOverride: boolean = false) {
    const ownedSchedule = currentSchedule ? await ensureCurrentScheduleOwnClass(currentSchedule) : null;
    const targetClassId = ownedSchedule?.classId || classId;
    const hasConflict = studentConflicts.has(studentId);

    // Block assignment if conflict exists and not admin override
    if (!isCurrentlyAssigned && hasConflict && !forceOverride && !adminOverride) {
      const conflicts = studentConflicts.get(studentId) || [];
      const conflictInfo = conflicts.map(c => {
        const dayLabel = DAYS_OF_WEEK.find(d => d.value === c.dayOfWeek)?.label || '';
        return `${c.className} (${dayLabel} ${c.startTime}-${c.endTime})`;
      }).join(', ');

      toast({
        title: '시간표 충돌',
        description: `이미 같은 요일/시간에 다른 수업이 배정되어 있습니다: ${conflictInfo}`,
        variant: 'destructive',
      });
      return;
    }

    setUpdating(studentId);
    try {
      if (isCurrentlyAssigned) {
        // Remove student from class
        const { error } = await supabase
          .from('class_students')
          .delete()
          .eq('class_id', targetClassId)
          .eq('student_id', studentId);

        if (error) throw error;

        setAssignedStudentIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(studentId);
          onStudentCountChange?.(newSet.size);
          return newSet;
        });

        toast({
          title: '학생 배정 해제',
          description: '학생이 클래스에서 제외되었습니다',
        });
      } else {
        // Add student to class
        const { error } = await supabase
          .from('class_students')
          .insert({ class_id: targetClassId, student_id: studentId });

        if (error) {
          if (error.code === '23505') {
            toast({
              title: '이미 배정됨',
              description: '이 학생은 이미 이 클래스에 배정되어 있습니다',
              variant: 'destructive',
            });
            return;
          }
          throw error;
        }

        setAssignedStudentIds((prev) => {
          const newSet = new Set(prev);
          newSet.add(studentId);
          onStudentCountChange?.(newSet.size);
          return newSet;
        });

        toast({
          title: hasConflict ? '충돌 무시 배정 완료' : '학생 배정 완료',
          description: hasConflict 
            ? '시간표 충돌이 있지만 관리자 권한으로 배정되었습니다' 
            : '학생이 클래스에 배정되었습니다',
        });
      }
    } catch (error: any) {
      console.error('Error toggling student:', error);
      toast({
        title: '오류',
        description: error.message || '학생 배정을 변경하지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  }

  const filteredStudents = allStudents.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.grade?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.school?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Split students into available and conflicting
  const { availableStudents, conflictingStudents } = useMemo(() => {
    const available: Student[] = [];
    const conflicting: Student[] = [];

    filteredStudents.forEach(student => {
      const isAssigned = assignedStudentIds.has(student.id);
      const hasConflict = studentConflicts.has(student.id);

      // Already assigned students go to available list
      if (isAssigned) {
        available.push(student);
      } else if (hasConflict) {
        conflicting.push(student);
      } else {
        available.push(student);
      }
    });

    // Sort: assigned students first, then alphabetically
    available.sort((a, b) => {
      const aAssigned = assignedStudentIds.has(a.id);
      const bAssigned = assignedStudentIds.has(b.id);
      if (aAssigned && !bAssigned) return -1;
      if (!aAssigned && bAssigned) return 1;
      return a.name.localeCompare(b.name);
    });

    conflicting.sort((a, b) => a.name.localeCompare(b.name));

    return { availableStudents: available, conflictingStudents: conflicting };
  }, [filteredStudents, assignedStudentIds, studentConflicts]);

  const renderStudentRow = (student: Student, showConflictInfo: boolean = false) => {
    const isAssigned = assignedStudentIds.has(student.id);
    const isUpdating = updating === student.id;
    const hasConflict = studentConflicts.has(student.id);
    const conflicts = studentConflicts.get(student.id) || [];

    // For conflict tab, disable unless admin override is enabled
    const isDisabled = showConflictInfo && hasConflict && !adminOverride && !isAssigned;

    return (
      <div
        key={student.id}
        className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
          isAssigned 
            ? 'bg-primary/5' 
            : hasConflict 
              ? 'bg-destructive/5' 
              : 'hover:bg-secondary/50'
        } ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !isUpdating && !isDisabled && handleToggleStudent(student.id, isAssigned)}
      >
        {isUpdating ? (
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        ) : (
          <Checkbox
            checked={isAssigned}
            disabled={isDisabled}
            onCheckedChange={() => handleToggleStudent(student.id, isAssigned)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{student.name}</p>
            {showConflictInfo && hasConflict && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                시간표 충돌
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[student.grade, student.school].filter(Boolean).join(' · ') || '-'}
          </p>
          {showConflictInfo && hasConflict && conflicts.length > 0 && (
            <p className="text-xs text-destructive mt-1">
              기존: {conflicts.map(c => {
                const dayLabel = DAYS_OF_WEEK.find(d => d.value === c.dayOfWeek)?.label || '';
                return `${c.className} (${dayLabel} ${c.startTime}-${c.endTime})`;
              }).join(', ')}
            </p>
          )}
        </div>
        {showConflictInfo && hasConflict && isAdmin(role) && !isAssigned && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs flex-shrink-0"
            disabled={isUpdating}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStudent(student.id, false, true);
            }}
          >
            충돌 무시 배정
          </Button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" />
          학생 배정
        </h3>
        <span className="text-sm text-muted-foreground">
          배정된 학생: {assignedStudentIds.size}명
        </span>
      </div>

      {currentSchedule && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
          현재 슬롯: {DAYS_OF_WEEK.find(d => d.value === currentSchedule.dayOfWeek)?.label}요일 {currentSchedule.startTime}-{currentSchedule.endTime}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="학생 검색 (이름, 학년, 학교)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Admin override toggle */}
      {isAdmin(role) && conflictingStudents.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <Label htmlFor="admin-override" className="text-sm flex-1 cursor-pointer">
            충돌 무시 모드 (관리자 전용)
          </Label>
          <Switch
            id="admin-override"
            checked={adminOverride}
            onCheckedChange={setAdminOverride}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="available" className="flex-1">
            배정 가능 ({availableStudents.length})
          </TabsTrigger>
          <TabsTrigger value="conflict" className="flex-1">
            충돌
            {conflictingStudents.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {conflictingStudents.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-3">
          <ScrollArea className="h-[280px] border rounded-md">
            <div className="p-2 space-y-1">
              {availableStudents.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {searchQuery ? '검색 결과가 없습니다' : '배정 가능한 학생이 없습니다'}
                </p>
              ) : (
                availableStudents.map((student) => renderStudentRow(student, false))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="conflict" className="mt-3">
          <ScrollArea className="h-[280px] border rounded-md">
            <div className="p-2 space-y-1">
              {conflictingStudents.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  시간표 충돌이 있는 학생이 없습니다
                </p>
              ) : (
                conflictingStudents.map((student) => renderStudentRow(student, true))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
