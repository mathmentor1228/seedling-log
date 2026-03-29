import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Trash2, Copy, ClipboardPaste,
  GripVertical, Loader2, Search, Users, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ──
const ROOMS = [
  { value: 'room10', label: '10강의실', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  { value: 'glass', label: '유리문강의실', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
] as const;

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300',
  '영어': 'bg-green-500/20 border-green-500/40 text-green-700 dark:text-green-300',
  '국어': 'bg-purple-500/20 border-purple-500/40 text-purple-700 dark:text-purple-300',
  '과학': 'bg-orange-500/20 border-orange-500/40 text-orange-700 dark:text-orange-300',
  '기타': 'bg-muted border-border text-muted-foreground',
};

const SLOT_HEIGHT = 48;
const GRADE_ORDER = ['중1', '중2', '중3', '고1', '고2', '고3', '기타'];

function generateSlots(minTime: string, maxTime: string): string[] {
  const slots: string[] = [];
  let [h, m] = minTime.slice(0, 5).split(':').map(Number);
  const [endH, endM] = maxTime.slice(0, 5).split(':').map(Number);
  while (h < endH || (h === endH && m < endM)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 30;
    if (m >= 60) { m -= 60; h++; }
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
  slot_start: string;
  slot_end: string;
  student_ids: string[];
  student_names: string[];
  subject: string | null;
  teacher_id: string | null;
  span: number;
}

interface StudentOption { id: string; name: string; grade?: string; }
interface TeacherOption { id: string; full_name: string; }

// ── AssignmentBlock ──
function AssignmentBlock({ assignment, onRemove }: {
  assignment: Assignment; onRemove: () => void;
}) {
  const colorClass = SUBJECT_COLORS[assignment.subject || '기타'] || SUBJECT_COLORS['기타'];
  const heightPx = assignment.span * SLOT_HEIGHT - 4;

  return (
    <div
      style={{ height: heightPx }}
      className={cn(
        'rounded-lg border px-2 py-1.5 relative group overflow-hidden',
        colorClass
      )}
    >
      <div className="flex flex-wrap gap-1">
        {(assignment.student_names || []).map((name: string, i: number) => (
          <span key={i} className="text-xs font-semibold bg-background/50 rounded px-1">
            {name}
          </span>
        ))}
      </div>
      {assignment.subject && (
        <p className="text-[10px] opacity-70 mt-0.5 truncate">
          {assignment.subject}
        </p>
      )}
      <p className="text-[10px] opacity-50 mt-0.5 font-mono">
        {assignment.slot_start?.slice(0, 5)}~{assignment.slot_end?.slice(0, 5)}
      </p>
      <div className="absolute top-1 right-1 hidden group-hover:flex">
        <button
          onClick={onRemove}
          className="w-4 h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px]"
          title="전체 제거"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── RoomColumn (with HTML5 drop targets) ──
function RoomColumn({ room, slots, assignments, onRemove, onDrop }: {
  room: string; slots: string[]; assignments: Assignment[];
  onRemove: (id: string) => void;
  onDrop: (room: string, slot: string, data: any) => void;
}) {
  const assignmentMap: Record<string, Assignment> = {};
  const occupiedSlots = new Set<string>();

  assignments.forEach(a => {
    const startKey = a.slot_start?.slice(0, 5);
    if (startKey) {
      assignmentMap[startKey] = a;
      let [h, m] = startKey.split(':').map(Number);
      for (let i = 0; i < a.span; i++) {
        occupiedSlots.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        m += 30; if (m >= 60) { m -= 60; h++; }
      }
    }
  });

  return (
    <div className="flex-1 min-w-[140px]">
      {slots.map(slot => {
        const assignment = assignmentMap[slot];
        const isOccupied = occupiedSlots.has(slot) && !assignment;

        if (assignment) {
          return (
            <div key={slot} style={{ height: assignment.span * SLOT_HEIGHT }}>
              <AssignmentBlock
                assignment={assignment}
                onRemove={() => onRemove(assignment.id)}
              />
            </div>
          );
        }

        if (isOccupied) {
          return <div key={slot} style={{ height: SLOT_HEIGHT }} />;
        }

        // Droppable empty slot
        return (
          <div
            key={slot}
            style={{ height: SLOT_HEIGHT }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('bg-primary/10', 'border-primary');
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('bg-primary/10', 'border-primary');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('bg-primary/10', 'border-primary');
              const raw = e.dataTransfer.getData('application/json');
              if (!raw) return;
              try {
                const data = JSON.parse(raw);
                onDrop(room, slot, data);
              } catch {}
            }}
            className="border border-dashed rounded-md border-border/30 hover:border-border/60 transition-colors flex items-center justify-center"
          />
        );
      })}
    </div>
  );
}

// ── DraggableStudentChip (HTML5 draggable) ──
function DraggableStudentChip({ student, isSelected, onToggle, selectedIds, allStudents, durationSlots, subject }: {
  student: StudentOption; isSelected: boolean; onToggle: () => void;
  selectedIds: Set<string>; allStudents: StudentOption[];
  durationSlots: number; subject: string;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    const studentIds = isSelected && selectedIds.size > 1
      ? Array.from(selectedIds) : [student.id];
    const studentNames = isSelected && selectedIds.size > 1
      ? allStudents.filter(s => selectedIds.has(s.id)).map(s => s.name)
      : [student.name];

    const data = { studentIds, studentNames, durationSlots, subject };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';

    // Custom ghost
    const ghost = document.createElement('div');
    ghost.className = 'bg-primary text-white rounded px-2 py-1 text-xs';
    ghost.textContent = studentNames.join(', ');
    ghost.style.position = 'absolute';
    ghost.style.top = '-100px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing select-none transition-all',
        isSelected
          ? 'bg-primary/10 border-primary/40 text-primary font-medium'
          : 'bg-background border-border hover:border-primary/30'
      )}
      onClick={onToggle}
    >
      <div
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center shrink-0',
          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
        )}
      >
        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>
      <span className="truncate">{student.name}</span>
      <GripVertical className="w-3 h-3 text-muted-foreground shrink-0 ml-auto" />
    </div>
  );
}

// ── Main Component ──
export function RoomAssignmentTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState(getTodayKST);
  const dateLabel = useMemo(() => {
    try {
      return format(parseISO(selectedDate), 'M월 d일 (EEEE)', { locale: ko });
    } catch { return selectedDate; }
  }, [selectedDate]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Student panel state
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [durationSlots, setDurationSlots] = useState(2);
  const [selectedSubject, setSelectedSubject] = useState('');

  // Teacher/subject filter state
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [studentTeacherMap, setStudentTeacherMap] = useState<Record<string, string[]>>({});
  const [studentSubjectMap, setStudentSubjectMap] = useState<Record<string, string[]>>({});

  // Copy state
  const [copiedDate, setCopiedDate] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  // ── Fetch time range ──
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('class_schedules')
        .select('start_time, end_time')
        .eq('is_active', true);
      if (data && data.length > 0) {
        const starts = data.map(d => d.start_time).sort();
        const ends = data.map(d => d.end_time).sort();
        setSlots(generateSlots(starts[0] || '14:00', ends[ends.length - 1] || '22:00'));
      } else {
        setSlots(generateSlots('14:00', '22:00'));
      }
    })();
  }, []);

  // ── Fetch assignments ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('room_assignments')
      .select('id, room, slot_start, slot_end, student_ids, student_names, subject, teacher_id, span')
      .eq('assigned_date', selectedDate)
      .order('slot_start', { ascending: true });

    setAssignments((data || []).map((r: any) => ({
      ...r,
      student_ids: r.student_ids || [],
      student_names: r.student_names || [],
      span: r.span || 1,
    })));
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Fetch students + teacher map ──
  useEffect(() => {
    (async () => {
      // Students
      const { data: studentData } = await supabase
        .from('students')
        .select('id, name, grade')
        .neq('enrollment_status', '퇴원')
        .order('name');
      setStudents(studentData || []);

      // Teachers from classes
      const { data: teacherData } = await supabase
        .from('classes')
        .select('teacher_id, profiles!inner(id, full_name)')
        .not('teacher_id', 'is', null);

      const uniqueTeachers = Array.from(
        new Map(
          (teacherData || []).map((c: any) => [
            c.teacher_id,
            { id: c.teacher_id, full_name: (c.profiles as any)?.full_name || '' }
          ])
        ).values()
      );
      setTeachers(uniqueTeachers);

      // Student → teacher/subject mapping
      const { data: classStudentsData } = await supabase
        .from('class_students')
        .select('student_id, classes!inner(teacher_id, subject)')
        .not('classes.teacher_id', 'is', null);

      const tMap: Record<string, string[]> = {};
      const sMap: Record<string, string[]> = {};
      (classStudentsData || []).forEach((cs: any) => {
        const sid = cs.student_id;
        const tid = (cs.classes as any)?.teacher_id;
        const subj = (cs.classes as any)?.subject;
        if (tid) {
          if (!tMap[sid]) tMap[sid] = [];
          if (!tMap[sid].includes(tid)) tMap[sid].push(tid);
        }
        if (subj) {
          if (!sMap[sid]) sMap[sid] = [];
          if (!sMap[sid].includes(subj)) sMap[sid].push(subj);
        }
      });
      setStudentTeacherMap(tMap);
      setStudentSubjectMap(sMap);
    })();
  }, []);

  // ── Student toggle ──
  function toggleStudent(id: string) {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Filtered students by teacher/subject ──
  const filteredStudents = useMemo(() => {
    let list = students;
    if (filterTeacherId) {
      list = list.filter(s => studentTeacherMap[s.id]?.includes(filterTeacherId));
    }
    if (filterSubject) {
      list = list.filter(s => studentSubjectMap[s.id]?.includes(filterSubject));
    }
    return list;
  }, [students, filterTeacherId, filterSubject, studentTeacherMap, studentSubjectMap]);

  // ── Grouped students ──
  const groupedStudents = useMemo(() => {
    const filtered = filteredStudents.filter(s =>
      !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase())
    );
    const result: Record<string, StudentOption[]> = {};
    GRADE_ORDER.forEach(grade => {
      const grp = filtered.filter(s => getGradeGroup(s.grade ?? null) === grade);
      if (grp.length > 0) result[grade] = grp;
    });
    return result;
  }, [filteredStudents, studentSearch]);

  // ── Delete ──
  async function handleRemove(id: string) {
    await supabase.from('room_assignments').delete().eq('id', id);
    toast({ description: '삭제되었습니다' });
    fetchData();
  }

  // ── Copy / Paste ──
  function handleCopy() {
    setCopiedDate(selectedDate);
    toast({ description: `${dateLabel} 배정이 복사되었습니다` });
  }

  async function handlePaste() {
    if (!copiedDate || copiedDate === selectedDate) return;
    setCopying(true);

    const { data: source } = await supabase
      .from('room_assignments')
      .select('room, slot_start, slot_end, student_ids, student_names, subject, teacher_id, span')
      .eq('assigned_date', copiedDate);

    if (!source || source.length === 0) {
      toast({ description: '복사할 배정이 없습니다', variant: 'destructive' });
      setCopying(false);
      return;
    }

    const inserts = source.map((a: any) => ({
      room: a.room,
      assigned_date: selectedDate,
      slot_start: a.slot_start,
      slot_end: a.slot_end,
      student_ids: a.student_ids || [],
      student_names: a.student_names || [],
      subject: a.subject,
      teacher_id: a.teacher_id,
      span: a.span || 1,
    }));

    const { error } = await supabase.from('room_assignments').insert(inserts);
    if (error) {
      toast({ title: '붙여넣기 실패', description: error.message, variant: 'destructive' });
    } else {
      if (user) {
        await supabase.from('room_slot_copies').insert({
          source_date: copiedDate,
          target_date: selectedDate,
          room: 'all',
          copied_by: user.id,
        });
      }
      toast({ description: `${inserts.length}건이 붙여넣기되었습니다` });
      setCopiedDate(null);
      fetchData();
    }
    setCopying(false);
  }

  // ── Handle Drop (HTML5) ──
  async function handleDrop(
    room: string,
    slot: string,
    data: { studentIds: string[]; studentNames: string[]; durationSlots: number; subject: string }
  ) {
    const slotEnd = calcSlotEnd(slot, data.durationSlots);

    // Check if slot already has an assignment
    const existing = assignments.find(
      a => a.room === room && a.slot_start?.slice(0, 5) === slot
    );

    if (existing) {
      // Merge students into existing block
      const currentIds = (existing.student_ids as string[]) || [];
      const currentNames = (existing.student_names as string[]) || [];
      const mergedIds = [...new Set([...currentIds, ...data.studentIds])];
      const mergedNames = [...new Set([...currentNames, ...data.studentNames])];

      const { error } = await supabase
        .from('room_assignments')
        .update({ student_ids: mergedIds, student_names: mergedNames })
        .eq('id', existing.id);

      if (error) {
        toast({ title: '배정 실패', description: error.message, variant: 'destructive' });
      } else {
        toast({ description: `${data.studentNames.length}명 추가 완료` });
      }
    } else {
      const resolvedNames = data.studentNames.length > 0
        ? data.studentNames
        : students.filter(s => data.studentIds.includes(s.id)).map(s => s.name);

      const { error } = await supabase.from('room_assignments').insert({
        room,
        assigned_date: selectedDate,
        slot_start: slot,
        slot_end: slotEnd,
        student_ids: data.studentIds,
        student_names: resolvedNames,
        subject: data.subject || null,
        teacher_id: user?.id || null,
        span: data.durationSlots,
      });

      if (error) {
        toast({ title: '배정 실패', description: error.message, variant: 'destructive' });
      } else {
        toast({ description: `${resolvedNames.length}명 배정 완료` });
      }
    }

    setSelectedStudentIds(new Set());
    fetchData();
  }

  const selectedCount = selectedStudentIds.size;

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      {/* ── Left: Room Grid ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Date nav */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setSelectedDate(d => format(subDays(parseISO(d), 1), 'yyyy-MM-dd'))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-36 h-8 text-sm"
          />
          <Button variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setSelectedDate(d => format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-8"
            onClick={() => setSelectedDate(getTodayKST())}>오늘</Button>

          <span className="text-sm font-semibold text-muted-foreground ml-1">{dateLabel}</span>

          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="outline" className="gap-1 text-xs h-8"
              onClick={handleCopy}>
              <Copy className="w-3.5 h-3.5" /> 복사
            </Button>
            {copiedDate && copiedDate !== selectedDate && (
              <Button size="sm" variant="outline" className="gap-1 text-xs h-8"
                onClick={handlePaste} disabled={copying}>
                {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
                붙여넣기
              </Button>
            )}
          </div>
        </div>

        {/* Room summary */}
        <div className="flex gap-2 mb-3">
          {ROOMS.map(room => {
            const count = assignments.filter(a => a.room === room.value)
              .reduce((sum, a) => sum + (a.student_names?.length || 0), 0);
            return (
              <Badge key={room.value} className={cn(room.color, 'text-xs')}>
                {room.label}: {count}명
              </Badge>
            );
          })}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto border rounded-lg bg-background">
            {/* Header */}
            <div className="flex border-b bg-muted/30 sticky top-0 z-10">
              <div className="w-14 shrink-0 p-2 text-xs font-medium text-muted-foreground">시간</div>
              {ROOMS.map(room => (
                <div key={room.value} className="flex-1 min-w-[140px] p-2 text-center">
                  <Badge className={cn(room.color, 'text-xs')}>{room.label}</Badge>
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="flex">
              {/* Time column */}
              <div className="w-14 shrink-0">
                {slots.map(slot => (
                  <div key={slot} style={{ height: SLOT_HEIGHT }}
                    className="flex items-center justify-center text-[11px] font-mono text-muted-foreground border-b border-border/20">
                    {slot}
                  </div>
                ))}
              </div>

              {/* Room columns */}
              {ROOMS.map(room => (
                <RoomColumn
                  key={room.value}
                  room={room.value}
                  slots={slots}
                  assignments={assignments.filter(a => a.room === room.value)}
                  onRemove={handleRemove}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Student Panel ── */}
      <div className="w-64 shrink-0 flex flex-col border rounded-lg bg-background">
        <div className="p-3 border-b space-y-2.5">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary" />
            학생 선택
          </h3>

          {/* Teacher filter */}
          <Select value={filterTeacherId} onValueChange={setFilterTeacherId}>
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
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="전체 과목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 과목</SelectItem>
              <SelectItem value="수학">수학</SelectItem>
              <SelectItem value="영어">영어</SelectItem>
              <SelectItem value="국어">국어</SelectItem>
              <SelectItem value="과학">과학</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="이름 검색..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>

          {/* Duration */}
          <div>
            <Label className="text-xs text-muted-foreground">머무는 시간</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {[1, 2, 3, 4, 6].map(n => (
                <button key={n}
                  onClick={() => setDurationSlots(n)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border transition-colors',
                    durationSlots === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary/50'
                  )}>
                  {n === 1 ? '30분' : n === 2 ? '1시간' : n === 3 ? '1.5h' : n === 4 ? '2시간' : '3시간'}
                </button>
              ))}
            </div>
          </div>

          {/* Subject for assignment */}
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="배정 과목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">과목 없음</SelectItem>
              <SelectItem value="수학">수학</SelectItem>
              <SelectItem value="영어">영어</SelectItem>
              <SelectItem value="국어">국어</SelectItem>
              <SelectItem value="과학">과학</SelectItem>
            </SelectContent>
          </Select>

          {/* Selected count */}
          {selectedCount > 0 && (
            <div className="rounded-lg bg-primary/10 border border-primary/30 p-2 text-center">
              <Badge className="bg-primary text-primary-foreground text-xs">{selectedCount}명 선택됨</Badge>
              <p className="text-[10px] text-muted-foreground mt-1">시간 슬롯으로 드래그하세요</p>
            </div>
          )}
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-auto p-2 space-y-3">
          {Object.entries(groupedStudents).map(([grade, gradeStudents]) => (
            <div key={grade}>
              <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">{grade}</p>
              <div className="space-y-1">
                {gradeStudents.map(student => (
                  <DraggableStudentChip
                    key={student.id}
                    student={student}
                    isSelected={selectedStudentIds.has(student.id)}
                    onToggle={() => toggleStudent(student.id)}
                    selectedIds={selectedStudentIds}
                    allStudents={filteredStudents}
                    durationSlots={durationSlots}
                    subject={selectedSubject === 'none' ? '' : selectedSubject}
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
