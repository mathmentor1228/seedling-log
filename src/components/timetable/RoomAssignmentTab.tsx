import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Trash2, Copy, ClipboardPaste,
  GripVertical, Loader2, Search, Users
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
const GRADE_ORDER = ['중1','중2','중3','고1','고2','고3'];

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

// ── DroppableSlot ──
function DroppableSlot({ id, room, slot, selectedCount }: {
  id: string; room: string; slot: string; selectedCount: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { room, slot } });

  return (
    <div
      ref={setNodeRef}
      style={{ height: SLOT_HEIGHT }}
      className={cn(
        'border border-dashed rounded-md transition-colors flex items-center justify-center',
        isOver && selectedCount > 0
          ? 'border-primary bg-primary/10'
          : 'border-border/30 hover:border-border/60'
      )}
    >
      {isOver && selectedCount > 0 && (
        <span className="text-xs text-primary font-medium">{selectedCount}명 배정</span>
      )}
    </div>
  );
}

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
          <span key={i} className="text-xs font-semibold">{name}</span>
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
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px]"
      >
        ×
      </button>
    </div>
  );
}

// ── RoomColumn ──
function RoomColumn({ room, slots, assignments, selectedCount, onRemove }: {
  room: string; slots: string[]; assignments: Assignment[];
  selectedCount: number; onRemove: (id: string) => void;
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

        return (
          <DroppableSlot
            key={slot}
            id={`${room}|${slot}`}
            room={room}
            slot={slot}
            selectedCount={selectedCount}
          />
        );
      })}
    </div>
  );
}

// ── DraggableStudentChip ──
function DraggableStudentChip({ student, isSelected, onToggle, selectedIds, allStudents, durationSlots, subject }: {
  student: StudentOption; isSelected: boolean; onToggle: () => void;
  selectedIds: Set<string>; allStudents: StudentOption[];
  durationSlots: number; subject: string;
}) {
  const dragStudentIds = isSelected && selectedIds.size > 1
    ? Array.from(selectedIds) : [student.id];
  const dragStudentNames = isSelected && selectedIds.size > 1
    ? allStudents.filter(s => selectedIds.has(s.id)).map(s => s.name)
    : [student.name];

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${student.id}`,
    data: {
      studentIds: dragStudentIds,
      studentNames: dragStudentNames,
      durationSlots,
      subject,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs cursor-grab select-none transition-all',
        isSelected
          ? 'bg-primary/10 border-primary/40 text-primary font-medium'
          : 'bg-background border-border hover:border-primary/30',
        isDragging && 'opacity-40'
      )}
      {...listeners}
      {...attributes}
    >
      <div
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer',
          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
        )}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        {isSelected && <span className="text-primary-foreground text-[10px]">✓</span>}
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

  // Copy state
  const [copiedDate, setCopiedDate] = useState<string | null>(null);
  const [copiedRoom, setCopiedRoom] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  // DnD
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  // ── Fetch students once ──
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name, grade')
        .neq('enrollment_status', '퇴원')
        .order('name');
      setStudents(data || []);
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

  // ── Grouped students ──
  const groupedStudents = useMemo(() => {
    const result: Record<string, StudentOption[]> = {};
    GRADE_ORDER.forEach(grade => {
      const gs = students.filter(s =>
        (s.grade || '').includes(grade) &&
        (!studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
      );
      if (gs.length > 0) result[grade] = gs;
    });
    // ungrouped
    const ungrouped = students.filter(s =>
      !GRADE_ORDER.some(g => (s.grade || '').includes(g)) &&
      (!studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
    );
    if (ungrouped.length > 0) result['기타'] = ungrouped;
    return result;
  }, [students, studentSearch]);

  // ── Delete ──
  async function handleRemove(id: string) {
    await supabase.from('room_assignments').delete().eq('id', id);
    toast({ description: '삭제되었습니다' });
    fetchData();
  }

  // ── Copy / Paste ──
  function handleCopy() {
    setCopiedDate(selectedDate);
    setCopiedRoom(null); // copy all rooms
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

  // ── Drag & Drop ──
  function handleDragStart(event: DragStartEvent) {
    setActiveDragData(event.active.data.current);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragData(null);
    const { active, over } = event;
    if (!over || !active.data.current) return;

    const dragData = active.data.current as any;
    const dropData = over.data.current as any;
    if (!dragData?.studentIds || !dropData?.room || !dropData?.slot) return;

    const { studentIds, studentNames, durationSlots: durSlots, subject } = dragData;
    const { room, slot } = dropData;
    const slotEnd = calcSlotEnd(slot, durSlots);

    // Resolve names if needed
    const resolvedNames = studentNames && studentNames.length > 0
      ? studentNames
      : students.filter(s => studentIds.includes(s.id)).map(s => s.name);

    const { error } = await supabase.from('room_assignments').insert({
      room,
      assigned_date: selectedDate,
      slot_start: slot,
      slot_end: slotEnd,
      student_ids: studentIds,
      student_names: resolvedNames,
      subject: subject || null,
      teacher_id: user?.id || null,
      span: durSlots,
    });

    if (error) {
      toast({ title: '배정 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ description: `${resolvedNames.length}명 배정 완료` });
      setSelectedStudentIds(new Set());
      fetchData();
    }
  }

  const selectedCount = selectedStudentIds.size;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                    selectedCount={selectedCount}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Student Panel ── */}
        <div className="w-64 shrink-0 flex flex-col border rounded-lg bg-background">
          <div className="p-3 border-b space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" />
              학생 선택
            </h3>

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

            {/* Subject */}
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="과목 선택" />
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
                      allStudents={students}
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

      {/* Drag Overlay */}
      <DragOverlay>
        {activeDragData && (
          <div className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs font-medium shadow-lg">
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>{activeDragData.studentNames?.join(', ')}</span>
            {activeDragData.subject && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">{activeDragData.subject}</Badge>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
