import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import {
  Trash2, Loader2, Search, Users, Check, Plus, CalendarDays, LayoutGrid, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ──
const ROOMS = [
  { id: 'general', label: '일반강의실' },
  { id: 'room10', label: '10강의실' },
  { id: 'glass', label: '유리문강의실' },
];

const DAYS = ['월', '화', '수', '목', '금', '토'];

const FIXED_STYLE = 'border-[#9FE1CB] text-[#085041]';
const FIXED_BG = 'rgba(159,225,203,0.35)';
const GUERRILLA_STYLE = 'border-[#FAC775] text-[#633806]';
const GUERRILLA_BG = 'rgba(250,199,117,0.35)';

const SLOT_HEIGHT = 44; // px per 30-min slot

type ViewMode = 'day' | 'week' | 'date';

// ── Helpers ──
function generateSlots(start: string, end: string): string[] {
  const slots: string[] = [];
  let [h, m] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 30;
    if (m >= 60) { m = 0; h++; }
  }
  return slots;
}

function calcSlotEnd(slot: string, spanCount: number): string {
  let [h, m] = slot.split(':').map(Number);
  m += 30 * spanCount;
  while (m >= 60) { m -= 60; h++; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayKST(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function getDayOfWeekLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return labels[d.getDay()];
}

const GRADE_ORDER = ['중1', '중2', '중3', '고1', '고2', '고3', '기타'];

function getGradeGroup(grade: string | null): string {
  if (!grade) return '기타';
  for (const g of ['중1', '중2', '중3', '고1', '고2', '고3']) {
    if (grade.includes(g)) return g;
  }
  return '기타';
}

// ── Types ──
interface Assignment {
  id: string;
  room: string;
  day: string | null;
  time_slot: string;
  slot_end: string;
  span: number;
  student_ids: string[];
  student_names: string[];
  is_fixed: boolean;
  date: string | null;
  subject: string | null;
}

interface StudentOption { id: string; name: string; grade?: string; }
interface TeacherOption { id: string; full_name: string; }

// ════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════
export function RoomAssignmentTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedDate, setSelectedDate] = useState(getTodayKST);

  // Student panel
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [durationSlots, setDurationSlots] = useState(2);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [isFixed, setIsFixed] = useState(true);

  // Teacher-student mapping
  const [studentTeacherMap, setStudentTeacherMap] = useState<Record<string, string[]>>({});
  const [studentSubjectMap, setStudentSubjectMap] = useState<Record<string, string[]>>({});

  // ── Fetch time range ──
  const fetchTimeRange = useCallback(async () => {
    const { data } = await supabase
      .from('class_schedules')
      .select('start_time, end_time');
    const starts = (data ?? []).map(r => (r.start_time as string).slice(0, 5)).sort();
    const ends = (data ?? []).map(r => (r.end_time as string).slice(0, 5)).sort().reverse();
    const minTime = starts[0] ?? '16:00';
    const maxTime = ends[0] ?? '22:00';
    setTimeSlots(generateSlots(minTime, maxTime));
  }, []);

  // ── Fetch students, teachers, mappings ──
  const fetchStudents = useCallback(async () => {
    const { data } = await supabase
      .from('students')
      .select('id, name, grade')
      .neq('enrollment_status', '퇴원')
      .order('name');
    setStudents((data ?? []) as StudentOption[]);
  }, []);

  const fetchTeachersAndMappings = useCallback(async () => {
    // Teachers from classes
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id, subject')
      .not('teacher_id', 'is', null);

    const teacherIds = [...new Set((classData ?? []).map((c: any) => c.teacher_id))];
    if (teacherIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      setTeachers((profileData ?? []) as TeacherOption[]);
    }

    // Student-teacher mapping
    const { data: csData } = await supabase
      .from('class_students')
      .select('student_id, class_id');
    const { data: clsData } = await supabase
      .from('classes')
      .select('id, teacher_id, subject')
      .not('teacher_id', 'is', null);

    const classMap: Record<string, { teacher_id: string; subject: string }> = {};
    (clsData ?? []).forEach((c: any) => { classMap[c.id] = { teacher_id: c.teacher_id, subject: c.subject }; });

    const tMap: Record<string, string[]> = {};
    const sMap: Record<string, string[]> = {};
    (csData ?? []).forEach((cs: any) => {
      const cls = classMap[cs.class_id];
      if (!cls) return;
      const sid = cs.student_id;
      if (!tMap[sid]) tMap[sid] = [];
      if (!tMap[sid].includes(cls.teacher_id)) tMap[sid].push(cls.teacher_id);
      if (!sMap[sid]) sMap[sid] = [];
      if (!sMap[sid].includes(cls.subject)) sMap[sid].push(cls.subject);
    });
    setStudentTeacherMap(tMap);
    setStudentSubjectMap(sMap);
  }, []);

  // ── Fetch assignments ──
  const fetchAssignments = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_assignments')
      .select('*');
    if (error) { console.error(error); return; }
    setAssignments((data ?? []).map((r: any) => ({
      id: r.id,
      room: r.room,
      day: r.day,
      time_slot: (r.slot_start as string).slice(0, 5),
      slot_end: (r.slot_end as string).slice(0, 5),
      span: r.span ?? 1,
      student_ids: r.student_ids ?? [],
      student_names: r.student_names ?? [],
      is_fixed: r.is_fixed ?? false,
      date: r.assigned_date,
      subject: r.subject,
    })));
  }, []);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchTimeRange(), fetchStudents(), fetchTeachersAndMappings(), fetchAssignments()]);
      setLoading(false);
    })();
  }, [fetchTimeRange, fetchStudents, fetchTeachersAndMappings, fetchAssignments]);

  // ── Filtered students ──
  const filteredStudents = useMemo(() => {
    let list = students;
    if (filterTeacherId) {
      list = list.filter(s => studentTeacherMap[s.id]?.includes(filterTeacherId));
    }
    if (filterSubject) {
      list = list.filter(s => studentSubjectMap[s.id]?.includes(filterSubject));
    }
    if (search) {
      list = list.filter(s => s.name.includes(search));
    }
    return list;
  }, [students, filterTeacherId, filterSubject, search, studentTeacherMap, studentSubjectMap]);

  const groupedStudents = useMemo(() => {
    return GRADE_ORDER.reduce((acc, grade) => {
      const grp = filteredStudents.filter(s => getGradeGroup(s.grade ?? null) === grade);
      if (grp.length > 0) acc[grade] = grp;
      return acc;
    }, {} as Record<string, StudentOption[]>);
  }, [filteredStudents]);

  // ── Get visible assignments for current view ──
  const visibleAssignments = useMemo(() => {
    if (viewMode === 'day') {
      return assignments.filter(a =>
        (a.is_fixed && a.day === selectedDay) ||
        (!a.is_fixed && a.date && getDayOfWeekLabel(a.date) === selectedDay)
      );
    }
    if (viewMode === 'week') {
      return assignments.filter(a => a.is_fixed || !a.date);
    }
    // date mode
    const dayLabel = getDayOfWeekLabel(selectedDate);
    return assignments.filter(a =>
      (a.is_fixed && a.day === dayLabel) ||
      (!a.is_fixed && a.date === selectedDate)
    );
  }, [assignments, viewMode, selectedDay, selectedDate]);

  // ── Drop handler ──
  async function handleDrop(room: string, slot: string, day: string, data: {
    studentIds: string[]; studentNames: string[]; durationSlots: number; subject: string;
  }) {
    const slotEnd = calcSlotEnd(slot, data.durationSlots);

    // Check for existing assignment in same room+slot+day
    const existing = visibleAssignments.find(
      a => a.room === room && a.time_slot === slot && (a.day === day || (!a.is_fixed && a.date && getDayOfWeekLabel(a.date) === day))
    );

    if (existing) {
      const mergedIds = [...new Set([...(existing.student_ids as string[]), ...data.studentIds])];
      const mergedNames = [...new Set([...(existing.student_names as string[]), ...data.studentNames])];
      const { error } = await supabase
        .from('room_assignments')
        .update({ student_ids: mergedIds, student_names: mergedNames } as any)
        .eq('id', existing.id);
      if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    } else {
      const insertData: any = {
        room,
        slot_start: slot,
        slot_end: slotEnd,
        student_ids: data.studentIds,
        student_names: data.studentNames,
        span: data.durationSlots,
        subject: data.subject || null,
        teacher_id: user?.id || null,
        is_fixed: isFixed,
        day,
      };
      if (!isFixed) {
        insertData.assigned_date = viewMode === 'date' ? selectedDate : null;
      }

      const { error } = await supabase.from('room_assignments').insert(insertData);
      if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    }

    setSelectedStudentIds(new Set());
    fetchAssignments();
    toast({ title: '배정 완료' });
  }

  // ── Remove handler ──
  async function handleRemove(id: string) {
    const { error } = await supabase.from('room_assignments').delete().eq('id', id);
    if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    fetchAssignments();
    toast({ title: '삭제 완료' });
  }

  // ── Toggle student ──
  function toggleStudent(id: string) {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)]">
      {/* ══════ Left: Room Grid ══════ */}
      <div className="flex-1 overflow-auto">
        {/* Top controls */}
        <div className="sticky top-0 z-10 bg-background pb-3 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* View mode toggle */}
            <ToggleGroup type="single" value={viewMode} onValueChange={v => v && setViewMode(v as ViewMode)}>
              <ToggleGroupItem value="day" className="text-xs gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> 요일별
              </ToggleGroupItem>
              <ToggleGroupItem value="week" className="text-xs gap-1">
                <LayoutGrid className="w-3.5 h-3.5" /> 주간
              </ToggleGroupItem>
              <ToggleGroupItem value="date" className="text-xs gap-1">
                <Calendar className="w-3.5 h-3.5" /> 날짜별
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Fixed / guerrilla toggle */}
            <ToggleGroup type="single" value={isFixed ? 'fixed' : 'guerrilla'} onValueChange={v => v && setIsFixed(v === 'fixed')}>
              <ToggleGroupItem value="fixed" className="text-xs" style={{ backgroundColor: isFixed ? FIXED_BG : undefined }}>
                고정
              </ToggleGroupItem>
              <ToggleGroupItem value="guerrilla" className="text-xs" style={{ backgroundColor: !isFixed ? GUERRILLA_BG : undefined }}>
                게릴라
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Day tabs (day view) */}
          {viewMode === 'day' && (
            <div className="flex gap-1">
              {DAYS.map(d => (
                <Button
                  key={d}
                  size="sm"
                  variant={selectedDay === d ? 'default' : 'outline'}
                  className="text-xs px-3"
                  onClick={() => setSelectedDay(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          )}

          {/* Date picker (date view) */}
          {viewMode === 'date' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-40 h-8 text-sm"
              />
              <Badge variant="outline">{getDayOfWeekLabel(selectedDate)}요일</Badge>
            </div>
          )}
        </div>

        {/* Grid */}
        {viewMode === 'week' ? (
          <WeekGrid
            timeSlots={timeSlots}
            assignments={visibleAssignments}
            onDrop={handleDrop}
            onRemove={handleRemove}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        ) : (
          <DayGrid
            timeSlots={timeSlots}
            assignments={viewMode === 'day'
              ? visibleAssignments
              : visibleAssignments}
            day={viewMode === 'day' ? selectedDay : getDayOfWeekLabel(selectedDate)}
            onDrop={handleDrop}
            onRemove={handleRemove}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        )}
      </div>

      {/* ══════ Right: Student Panel ══════ */}
      <div className="w-64 shrink-0 border-l border-border pl-4 overflow-auto">
        <div className="space-y-3 sticky top-0 bg-background pb-3 z-10">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="w-4 h-4" /> 학생 선택
          </h3>

          {/* Teacher filter */}
          <Select value={filterTeacherId || 'all'} onValueChange={v => setFilterTeacherId(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="전체 선생님" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 선생님</SelectItem>
              {teachers.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Subject filter */}
          <Select value={filterSubject || 'all'} onValueChange={v => setFilterSubject(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="전체 과목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 과목</SelectItem>
              {['수학', '영어', '국어', '과학'].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="이름 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">머무는 시간</span>
            <div className="flex gap-1 flex-wrap">
              {[1, 2, 3, 4, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setDurationSlots(n)}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded border transition-colors',
                    durationSlots === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {n === 1 ? '30분' : n === 2 ? '1시간' : n === 3 ? '1.5h' : n === 4 ? '2시간' : '3시간'}
                </button>
              ))}
            </div>
          </div>

          {/* Subject selection for assignment */}
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="배정 과목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">과목 없음</SelectItem>
              {['수학', '영어', '국어', '과학'].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Selection count */}
          {selectedStudentIds.size > 0 && (
            <div className="bg-primary/10 rounded-lg p-2 text-center">
              <span className="text-xs font-semibold text-primary">{selectedStudentIds.size}명 선택됨</span>
              <p className="text-[10px] text-muted-foreground">시간 슬롯으로 드래그하세요</p>
            </div>
          )}
        </div>

        {/* Student list by grade */}
        <div className="space-y-3">
          {Object.entries(groupedStudents).map(([grade, gradeStudents]) => (
            <div key={grade}>
              <div className="text-[11px] font-semibold text-muted-foreground mb-1">{grade}</div>
              <div className="space-y-0.5">
                {gradeStudents.map(student => (
                  <DraggableStudentChip
                    key={student.id}
                    student={student}
                    isSelected={selectedStudentIds.has(student.id)}
                    onToggle={() => toggleStudent(student.id)}
                    selectedIds={selectedStudentIds}
                    allStudents={students}
                    durationSlots={durationSlots}
                    selectedSubject={selectedSubject}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DayGrid — 요일별 / 날짜별 뷰
// ════════════════════════════════════════════════════════
function DayGrid({
  timeSlots, assignments, day, onDrop, onRemove,
  selectedStudentIds, students, durationSlots, selectedSubject,
}: {
  timeSlots: string[];
  assignments: Assignment[];
  day: string;
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>;
  students: StudentOption[];
  durationSlots: number;
  selectedSubject: string;
}) {
  return (
    <div className="min-w-[500px]">
      {/* Header */}
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-px bg-border rounded-t-lg overflow-hidden">
        <div className="bg-muted p-2 text-xs font-medium text-muted-foreground text-center">시간</div>
        {ROOMS.map(room => (
          <div key={room.id} className="bg-muted p-2 text-xs font-semibold text-center">{room.label}</div>
        ))}
      </div>

      {/* Body */}
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-px bg-border border border-t-0 rounded-b-lg overflow-hidden">
        {timeSlots.map(slot => (
          <SlotRow
            key={slot}
            slot={slot}
            day={day}
            assignments={assignments}
            onDrop={onDrop}
            onRemove={onRemove}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  slot, day, assignments, onDrop, onRemove,
  selectedStudentIds, students, durationSlots, selectedSubject,
}: {
  slot: string;
  day: string;
  assignments: Assignment[];
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>;
  students: StudentOption[];
  durationSlots: number;
  selectedSubject: string;
}) {
  return (
    <>
      <div className="bg-muted/50 p-1.5 text-[11px] text-muted-foreground text-center font-mono flex items-center justify-center"
        style={{ height: SLOT_HEIGHT }}>
        {slot}
      </div>
      {ROOMS.map(room => {
        const assignment = assignments.find(a => a.room === room.id && a.time_slot === slot);
        // Check if this slot is occupied by a multi-span assignment from above
        const isOccupied = !assignment && assignments.some(a => {
          if (a.room !== room.id || a.span <= 1) return false;
          const aSlotIdx = slotToMinutes(a.time_slot);
          const curIdx = slotToMinutes(slot);
          return curIdx > aSlotIdx && curIdx < aSlotIdx + a.span * 30;
        });

        if (isOccupied) {
          return <div key={room.id} className="bg-background" style={{ height: SLOT_HEIGHT }} />;
        }

        if (assignment) {
          return (
            <AssignmentBlock
              key={room.id}
              assignment={assignment}
              onRemove={() => onRemove(assignment.id)}
            />
          );
        }

        return (
          <DroppableSlot
            key={room.id}
            room={room.id}
            slot={slot}
            day={day}
            onDrop={onDrop}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        );
      })}
    </>
  );
}

function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

// ════════════════════════════════════════════════════════
// WeekGrid — 주간 뷰 (고정 배정만)
// ════════════════════════════════════════════════════════
function WeekGrid({
  timeSlots, assignments, onDrop, onRemove,
  selectedStudentIds, students, durationSlots, selectedSubject,
}: {
  timeSlots: string[];
  assignments: Assignment[];
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>;
  students: StudentOption[];
  durationSlots: number;
  selectedSubject: string;
}) {
  // For week view: show each room as a section, with day columns
  return (
    <div className="space-y-6">
      {ROOMS.map(room => (
        <div key={room.id}>
          <h4 className="text-sm font-semibold mb-2">{room.label}</h4>
          <div className="overflow-auto">
            <div className={`grid gap-px bg-border rounded-lg overflow-hidden`}
              style={{ gridTemplateColumns: `60px repeat(${DAYS.length}, 1fr)` }}>
              {/* Header */}
              <div className="bg-muted p-2 text-xs font-medium text-muted-foreground text-center">시간</div>
              {DAYS.map(d => (
                <div key={d} className="bg-muted p-2 text-xs font-semibold text-center">{d}</div>
              ))}

              {/* Body */}
              {timeSlots.map(slot => (
                <WeekSlotRow
                  key={slot}
                  slot={slot}
                  room={room.id}
                  assignments={assignments}
                  onDrop={onDrop}
                  onRemove={onRemove}
                  selectedStudentIds={selectedStudentIds}
                  students={students}
                  durationSlots={durationSlots}
                  selectedSubject={selectedSubject}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekSlotRow({
  slot, room, assignments, onDrop, onRemove,
  selectedStudentIds, students, durationSlots, selectedSubject,
}: {
  slot: string;
  room: string;
  assignments: Assignment[];
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>;
  students: StudentOption[];
  durationSlots: number;
  selectedSubject: string;
}) {
  return (
    <>
      <div className="bg-muted/50 p-1 text-[11px] text-muted-foreground text-center font-mono flex items-center justify-center"
        style={{ height: SLOT_HEIGHT }}>
        {slot}
      </div>
      {DAYS.map(day => {
        const assignment = assignments.find(a => a.room === room && a.time_slot === slot && a.day === day);
        const isOccupied = !assignment && assignments.some(a => {
          if (a.room !== room || a.day !== day || a.span <= 1) return false;
          const aIdx = slotToMinutes(a.time_slot);
          const curIdx = slotToMinutes(slot);
          return curIdx > aIdx && curIdx < aIdx + a.span * 30;
        });

        if (isOccupied) return <div key={day} className="bg-background" style={{ height: SLOT_HEIGHT }} />;

        if (assignment) {
          return (
            <AssignmentBlock
              key={day}
              assignment={assignment}
              onRemove={() => onRemove(assignment.id)}
              compact
            />
          );
        }

        return (
          <DroppableSlot
            key={day}
            room={room}
            slot={slot}
            day={day}
            onDrop={onDrop}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        );
      })}
    </>
  );
}

// ════════════════════════════════════════════════════════
// AssignmentBlock
// ════════════════════════════════════════════════════════
function AssignmentBlock({ assignment, onRemove, compact }: {
  assignment: Assignment; onRemove: () => void; compact?: boolean;
}) {
  const heightPx = assignment.span * SLOT_HEIGHT - 2;
  const bgColor = assignment.is_fixed ? FIXED_BG : GUERRILLA_BG;
  const borderStyle = assignment.is_fixed ? FIXED_STYLE : GUERRILLA_STYLE;

  return (
    <div
      style={{ height: heightPx, backgroundColor: bgColor }}
      className={cn(
        'rounded border px-1.5 py-1 relative group overflow-hidden',
        borderStyle,
      )}
    >
      <div className="flex flex-wrap gap-0.5">
        {(assignment.student_names ?? []).map((name: string, i: number) => (
          <span key={i} className="text-[11px] font-semibold">{name}</span>
        ))}
      </div>
      {!compact && assignment.subject && (
        <div className="text-[10px] opacity-70 mt-0.5">{assignment.subject}</div>
      )}
      {!compact && (
        <div className="text-[10px] opacity-50">
          {assignment.time_slot}~{assignment.slot_end}
        </div>
      )}
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity
                   bg-background/80 rounded-full p-0.5 hover:bg-destructive/20"
      >
        <Trash2 className="w-3 h-3 text-destructive" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DroppableSlot (HTML5 drag target)
// ════════════════════════════════════════════════════════
function DroppableSlot({ room, slot, day, onDrop, selectedStudentIds, students, durationSlots, selectedSubject }: {
  room: string;
  slot: string;
  day: string;
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  selectedStudentIds: Set<string>;
  students: StudentOption[];
  durationSlots: number;
  selectedSubject: string;
}) {
  return (
    <div
      style={{ height: SLOT_HEIGHT }}
      className="bg-background border-0 transition-colors"
      onDragOver={e => {
        e.preventDefault();
        e.currentTarget.classList.add('!bg-primary/10');
      }}
      onDragLeave={e => {
        e.currentTarget.classList.remove('!bg-primary/10');
      }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.classList.remove('!bg-primary/10');
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        try {
          const data = JSON.parse(raw);
          onDrop(room, slot, day, data);
        } catch {}
      }}
    />
  );
}

// ════════════════════════════════════════════════════════
// DraggableStudentChip (HTML5 drag source)
// ════════════════════════════════════════════════════════
function DraggableStudentChip({
  student, isSelected, onToggle,
  selectedIds, allStudents, durationSlots, selectedSubject,
}: {
  student: StudentOption;
  isSelected: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  allStudents: StudentOption[];
  durationSlots: number;
  selectedSubject: string;
}) {
  return (
    <div
      draggable
      onDragStart={e => {
        const data = {
          studentIds: isSelected && selectedIds.size > 1
            ? Array.from(selectedIds)
            : [student.id],
          studentNames: isSelected && selectedIds.size > 1
            ? allStudents.filter(s => selectedIds.has(s.id)).map(s => s.name)
            : [student.name],
          durationSlots,
          subject: selectedSubject === 'none' ? '' : selectedSubject,
        };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        // Custom ghost
        const ghost = document.createElement('div');
        ghost.className = 'bg-primary text-white rounded px-2 py-1 text-xs font-medium';
        ghost.textContent = `${data.studentNames.join(', ')} (${data.durationSlots * 30}분)`;
        ghost.style.position = 'absolute';
        ghost.style.top = '-1000px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
      }}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md cursor-grab active:cursor-grabbing select-none transition-colors border text-xs',
        isSelected
          ? 'bg-primary/15 border-primary/30 font-semibold'
          : 'hover:bg-muted border-transparent'
      )}
    >
      <div className={cn(
        'w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0',
        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
      )}>
        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>
      {student.name}
    </div>
  );
}
