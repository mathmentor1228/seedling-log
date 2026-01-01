import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, X, Calendar, Lock } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type SubjectType = Database['public']['Enums']['subject_type'];

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

interface ClassSlot {
  classId: string;
  className: string;
  subject: SubjectType;
  teacherId: string | null;
  teacherName: string;
  scheduleId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface StudentSlotAssignmentProps {
  studentId: string;
  studentName: string;
  readOnly?: boolean;
}

export default function StudentSlotAssignment({
  studentId,
  studentName,
  readOnly = false,
}: StudentSlotAssignmentProps) {
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [studentId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch all class schedules with class and teacher info
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('class_schedules')
        .select(`
          id,
          class_id,
          teacher_id,
          day_of_week,
          start_time,
          end_time,
          classes!inner (
            id,
            name,
            subject,
            teacher_id
          )
        `)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time');

      if (schedulesError) throw schedulesError;

      // Fetch teacher profiles
      const teacherIds = [...new Set(
        (schedulesData || [])
          .map(s => s.teacher_id)
          .filter((id): id is string => id !== null)
      )];

      let teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);

        teacherMap = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = p.full_name;
          return acc;
        }, {} as Record<string, string>);
      }

      // Build slot list
      const slotList: ClassSlot[] = (schedulesData || []).map((s: any) => ({
        classId: s.class_id,
        className: s.classes.name,
        subject: s.classes.subject,
        teacherId: s.teacher_id,
        teacherName: teacherMap[s.teacher_id] || '미지정',
        scheduleId: s.id,
        dayOfWeek: s.day_of_week,
        startTime: s.start_time.slice(0, 5),
        endTime: s.end_time.slice(0, 5),
      }));

      setSlots(slotList);

      // Fetch current assignments for this student
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', studentId);

      if (assignmentsError) throw assignmentsError;

      setAssignedClassIds(new Set((assignmentsData || []).map(a => a.class_id)));
    } catch (error) {
      console.error('Error fetching slot data:', error);
      toast({
        title: '오류',
        description: '슬롯 데이터를 불러오지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Get unique teachers and subjects for filters
  const uniqueTeachers = useMemo(() => {
    const map = new Map<string, string>();
    slots.forEach(s => {
      if (s.teacherId) {
        map.set(s.teacherId, s.teacherName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [slots]);

  const uniqueSubjects = useMemo(() => {
    return [...new Set(slots.map(s => s.subject))];
  }, [slots]);

  // Filter and group slots
  const filteredSlots = useMemo(() => {
    return slots.filter(slot => {
      if (filterTeacher !== 'all' && slot.teacherId !== filterTeacher) return false;
      if (filterDay !== 'all' && slot.dayOfWeek !== parseInt(filterDay)) return false;
      if (filterSubject !== 'all' && slot.subject !== filterSubject) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          slot.teacherName.toLowerCase().includes(query) ||
          slot.className.toLowerCase().includes(query) ||
          slot.subject.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [slots, filterTeacher, filterDay, filterSubject, searchQuery]);

  // Assigned slots
  const assignedSlots = useMemo(() => {
    return slots.filter(s => assignedClassIds.has(s.classId));
  }, [slots, assignedClassIds]);

  // Check for time overlap conflict (startA < endB AND startB < endA)
  const getConflictingSlot = (slot: ClassSlot): ClassSlot | null => {
    if (assignedClassIds.has(slot.classId)) return null; // Already assigned, no conflict
    
    return assignedSlots.find(
      assigned =>
        assigned.classId !== slot.classId &&
        assigned.dayOfWeek === slot.dayOfWeek &&
        assigned.startTime < slot.endTime &&
        slot.startTime < assigned.endTime
    ) || null;
  };

  const hasTimeConflict = (slot: ClassSlot): boolean => {
    return getConflictingSlot(slot) !== null;
  };

  const handleToggleAssignment = async (slot: ClassSlot) => {
    if (readOnly) return;
    
    const isAssigned = assignedClassIds.has(slot.classId);

    // Check conflict before assigning
    if (!isAssigned) {
      const conflicting = getConflictingSlot(slot);
      if (conflicting) {
        const dayLabel = DAYS_OF_WEEK.find(d => d.value === conflicting.dayOfWeek)?.label || '';
        toast({
          title: '중복 배정 불가',
          description: `이미 같은 요일/시간에 다른 수업이 배정되어 있습니다: ${conflicting.className} (${dayLabel} ${conflicting.startTime}-${conflicting.endTime})`,
          variant: 'destructive',
        });
        return;
      }
    }

    setProcessing(slot.classId);

    try {
      if (isAssigned) {
        // Remove assignment
        const { error } = await supabase
          .from('class_students')
          .delete()
          .eq('class_id', slot.classId)
          .eq('student_id', studentId);

        if (error) throw error;

        setAssignedClassIds(prev => {
          const next = new Set(prev);
          next.delete(slot.classId);
          return next;
        });

        toast({
          title: '배정 해제',
          description: `${slot.className} 슬롯에서 학생을 제외했습니다.`,
        });
      } else {
        // Add assignment
        const { error } = await supabase
          .from('class_students')
          .insert({ class_id: slot.classId, student_id: studentId });

        if (error) {
          if (error.code === '23505') {
            toast({
              title: '이미 배정됨',
              description: '이 학생은 이미 해당 슬롯에 배정되어 있습니다.',
              variant: 'destructive',
            });
            return;
          }
          throw error;
        }

        setAssignedClassIds(prev => new Set(prev).add(slot.classId));

        toast({
          title: '배정 완료',
          description: `${slot.className} 슬롯에 학생을 배정했습니다.`,
        });
      }
    } catch (error: any) {
      console.error('Error toggling assignment:', error);
      toast({
        title: '오류',
        description: error.message || '배정 변경에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(null);
    }
  };

  const formatSlotLabel = (slot: ClassSlot) => {
    const dayLabel = DAYS_OF_WEEK.find(d => d.value === slot.dayOfWeek)?.label || '';
    return `${slot.teacherName} · ${dayLabel} · ${slot.startTime}–${slot.endTime} (${slot.subject})`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Read-only notice */}
      {readOnly && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground text-sm">
          <Lock className="h-4 w-4" />
          <span>읽기 전용 - 배정 변경은 관리자만 가능합니다.</span>
        </div>
      )}

      {/* Currently Assigned */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">
            배정된 슬롯 ({assignedSlots.length}개)
          </Label>
        </div>
        {assignedSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">배정된 슬롯이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignedSlots.map(slot => (
              <Badge
                key={slot.classId}
                variant="secondary"
                className="flex items-center gap-1 py-1.5 px-3"
              >
                <span className="text-xs">{formatSlotLabel(slot)}</span>
                {!readOnly && (
                  <button
                    onClick={() => handleToggleAssignment(slot)}
                    disabled={processing === slot.classId}
                    className="ml-1 hover:text-destructive"
                  >
                    {processing === slot.classId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="슬롯 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterTeacher} onValueChange={setFilterTeacher}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="선생님" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 선생님</SelectItem>
              {uniqueTeachers.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterDay} onValueChange={setFilterDay}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="요일" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 요일</SelectItem>
              {DAYS_OF_WEEK.map(d => (
                <SelectItem key={d.value} value={d.value.toString()}>
                  {d.label}요일
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="과목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 과목</SelectItem>
              {uniqueSubjects.map(s => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Available Slots */}
      <div>
        <Label className="text-sm font-medium mb-3 block">
          사용 가능한 슬롯 ({filteredSlots.length}개)
        </Label>
        {filteredSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">조건에 맞는 슬롯이 없습니다.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {filteredSlots.map(slot => {
              const isAssigned = assignedClassIds.has(slot.classId);
              const conflict = !isAssigned && hasTimeConflict(slot);
              const dayLabel = DAYS_OF_WEEK.find(d => d.value === slot.dayOfWeek)?.label || '';

              return (
                <div
                  key={slot.scheduleId}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    conflict
                      ? 'border-destructive/50 bg-destructive/5 opacity-60'
                      : isAssigned
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    id={slot.scheduleId}
                    checked={isAssigned}
                    disabled={processing === slot.classId || conflict || readOnly}
                    onCheckedChange={() => handleToggleAssignment(slot)}
                  />
                  <label
                    htmlFor={slot.scheduleId}
                    className={`flex-1 text-sm ${readOnly ? '' : 'cursor-pointer'} ${
                      conflict ? 'text-muted-foreground' : ''
                    }`}
                  >
                    <span className="font-medium">{slot.teacherName}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span>{dayLabel}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span>{slot.startTime}–{slot.endTime}</span>
                    <span className="text-muted-foreground"> · </span>
                    <Badge variant="outline" className="text-xs ml-1">
                      {slot.subject}
                    </Badge>
                    {conflict && (
                      <span className="text-destructive text-xs ml-2">(시간 충돌)</span>
                    )}
                  </label>
                  {processing === slot.classId && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
