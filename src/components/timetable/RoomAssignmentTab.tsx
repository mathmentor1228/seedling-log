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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { format, addDays, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Copy,
  GripVertical, Loader2, CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ──
const ROOMS = [
  { value: 'room10', label: '10강의실', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  { value: 'glass', label: '유리문강의실', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
] as const;

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

function slotEnd(slot: string): string {
  let [h, m] = slot.split(':').map(Number);
  m += 30;
  if (m >= 60) { m -= 60; h++; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Types ──
interface RoomAssignment {
  id: string;
  room: string;
  assigned_date: string;
  slot_start: string;
  slot_end: string;
  student_id: string;
  teacher_id: string;
  subject: string | null;
  memo: string | null;
  is_routine: boolean;
  student_name?: string;
  teacher_name?: string;
}

interface StudentOption { id: string; name: string; }
interface TeacherOption { id: string; full_name: string; }

// ── Draggable Card ──
function DraggableCard({ assignment }: { assignment: RoomAssignment }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assignment.id,
    data: assignment,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background cursor-grab',
        'hover:shadow-sm transition-shadow',
        isDragging && 'opacity-40'
      )}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="font-medium truncate">{assignment.student_name}</span>
      {assignment.subject && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
          {assignment.subject}
        </Badge>
      )}
    </div>
  );
}

// ── Droppable Slot ──
function DroppableSlot({
  slotId,
  children,
  isOver,
}: {
  slotId: string;
  children: React.ReactNode;
  isOver?: boolean;
}) {
  const { setNodeRef, isOver: over } = useDroppable({ id: slotId });
  const highlighted = isOver || over;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[40px] rounded-md border border-dashed border-border/50 p-1 space-y-1 transition-colors',
        highlighted && 'bg-primary/5 border-primary/30'
      )}
    >
      {children}
    </div>
  );
}

// ── Main Component ──
export function RoomAssignmentTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Date navigation
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const dateLabel = format(currentDate, 'M월 d일 (EEEE)', { locale: ko });

  // Data
  const [assignments, setAssignments] = useState<RoomAssignment[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addRoom, setAddRoom] = useState('room10');
  const [addSlot, setAddSlot] = useState('');
  const [addStudentId, setAddStudentId] = useState('');
  const [addTeacherId, setAddTeacherId] = useState('');
  const [addSubject, setAddSubject] = useState('');
  const [addMemo, setAddMemo] = useState('');
  const [addIsRoutine, setAddIsRoutine] = useState(false);
  const [addRoutineDays, setAddRoutineDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Copy dialog
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTargetDate, setCopyTargetDate] = useState('');
  const [copyRoom, setCopyRoom] = useState('room10');
  const [copying, setCopying] = useState(false);

  // DnD
  const [activeItem, setActiveItem] = useState<RoomAssignment | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Fetch time range from class_schedules ──
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('class_schedules')
        .select('start_time, end_time')
        .eq('is_active', true);
      if (data && data.length > 0) {
        const starts = data.map(d => d.start_time).sort();
        const ends = data.map(d => d.end_time).sort();
        const minT = starts[0] || '14:00';
        const maxT = ends[ends.length - 1] || '22:00';
        setSlots(generateSlots(minT, maxT));
      } else {
        setSlots(generateSlots('14:00', '22:00'));
      }
    })();
  }, []);

  // ── Fetch assignments for date ──
  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('room_assignments')
      .select('*, students!student_id(name), profiles!teacher_id(full_name)')
      .eq('assigned_date', dateStr)
      .order('slot_start', { ascending: true });

    const mapped = (data || []).map((r: any) => ({
      ...r,
      student_name: r.students?.name,
      teacher_name: r.profiles?.full_name,
    }));
    setAssignments(mapped);
    setLoading(false);
  }, [dateStr]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  // ── Fetch students & teachers once ──
  useEffect(() => {
    (async () => {
      const [sRes, tRes] = await Promise.all([
        supabase.from('students').select('id, name').neq('enrollment_status', '퇴원').order('name'),
        supabase.from('profiles').select('id, full_name').not('full_name', 'is', null).order('full_name'),
      ]);
      setStudents(sRes.data || []);
      setTeachers((tRes.data || []) as TeacherOption[]);
    })();
  }, []);

  // ── Grouped data for grid ──
  const gridData = useMemo(() => {
    const map: Record<string, Record<string, RoomAssignment[]>> = {};
    for (const room of ROOMS) {
      map[room.value] = {};
      for (const slot of slots) {
        map[room.value][slot] = [];
      }
    }
    for (const a of assignments) {
      const slotKey = a.slot_start?.slice(0, 5);
      if (map[a.room]?.[slotKey]) {
        map[a.room][slotKey].push(a);
      }
    }
    return map;
  }, [assignments, slots]);

  // ── Add assignment ──
  async function handleAdd() {
    if (!addStudentId || !addTeacherId || !addSlot) {
      toast({ description: '학생, 선생님, 시간을 선택해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const inserts: any[] = [];
    if (addIsRoutine && addRoutineDays.length > 0) {
      const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
      for (const dow of addRoutineDays) {
        const d = addDays(monday, dow === 0 ? 6 : dow - 1);
        inserts.push({
          room: addRoom,
          assigned_date: format(d, 'yyyy-MM-dd'),
          slot_start: addSlot,
          slot_end: slotEnd(addSlot),
          student_id: addStudentId,
          teacher_id: addTeacherId,
          subject: addSubject || null,
          memo: addMemo || null,
          is_routine: true,
          routine_days: addRoutineDays,
        });
      }
    } else {
      inserts.push({
        room: addRoom,
        assigned_date: dateStr,
        slot_start: addSlot,
        slot_end: slotEnd(addSlot),
        student_id: addStudentId,
        teacher_id: addTeacherId,
        subject: addSubject || null,
        memo: addMemo || null,
        is_routine: false,
      });
    }

    const { error } = await supabase.from('room_assignments').insert(inserts);
    if (error) {
      toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ description: `${inserts.length}건 배정 완료` });
      setShowAddDialog(false);
      resetAddForm();
      fetchAssignments();
    }
    setSaving(false);
  }

  function resetAddForm() {
    setAddRoom('room10');
    setAddSlot('');
    setAddStudentId('');
    setAddTeacherId('');
    setAddSubject('');
    setAddMemo('');
    setAddIsRoutine(false);
    setAddRoutineDays([]);
    setStudentSearch('');
  }

  // ── Delete ──
  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('room_assignments').delete().eq('id', id);
    toast({ description: '삭제되었습니다' });
    fetchAssignments();
  }

  // ── Copy day slots ──
  async function handleCopyDay() {
    if (!copyTargetDate) {
      toast({ description: '대상 날짜를 선택해주세요', variant: 'destructive' });
      return;
    }
    setCopying(true);

    const source = assignments.filter(a => a.room === copyRoom);
    if (source.length === 0) {
      toast({ description: '복사할 배정이 없습니다', variant: 'destructive' });
      setCopying(false);
      return;
    }

    const inserts = source.map(a => ({
      room: a.room,
      assigned_date: copyTargetDate,
      slot_start: a.slot_start,
      slot_end: a.slot_end,
      student_id: a.student_id,
      teacher_id: a.teacher_id,
      subject: a.subject,
      memo: a.memo,
      is_routine: a.is_routine,
      routine_days: (a as any).routine_days || [],
    }));

    const { error } = await supabase.from('room_assignments').insert(inserts);
    if (!error && user) {
      await supabase.from('room_slot_copies').insert({
        source_date: dateStr,
        target_date: copyTargetDate,
        room: copyRoom,
        copied_by: user.id,
      });
    }

    if (error) {
      toast({ title: '복사 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ description: `${inserts.length}건이 ${copyTargetDate}로 복사되었습니다` });
      setShowCopyDialog(false);
    }
    setCopying(false);
  }

  // ── Drag & Drop ──
  function handleDragStart(event: DragStartEvent) {
    setActiveItem(event.active.data.current as RoomAssignment);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over || !active.data.current) return;

    const assignment = active.data.current as RoomAssignment;
    // droppable id format: "room|slot"
    const [newRoom, newSlot] = (over.id as string).split('|');
    if (!newRoom || !newSlot) return;
    if (assignment.room === newRoom && assignment.slot_start?.slice(0, 5) === newSlot) return;

    const { error } = await supabase
      .from('room_assignments')
      .update({ room: newRoom, slot_start: newSlot, slot_end: slotEnd(newSlot), updated_at: new Date().toISOString() })
      .eq('id', assignment.id);

    if (error) {
      toast({ title: '이동 실패', variant: 'destructive' });
    } else {
      toast({ description: '배정이 이동되었습니다' });
      fetchAssignments();
    }
  }

  const filteredStudents = students.filter(s =>
    !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="space-y-4">
      {/* ── Header: date nav + actions ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setCurrentDate(d => addDays(d, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-bold">{dateLabel}</h2>
          <Button variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setCurrentDate(d => addDays(d, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs"
            onClick={() => setCurrentDate(new Date())}>
            오늘
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1 text-xs"
            onClick={() => setShowCopyDialog(true)}>
            <Copy className="w-3.5 h-3.5" /> 복사
          </Button>
          <Button size="sm" className="gap-1 text-xs"
            onClick={() => { resetAddForm(); setShowAddDialog(true); }}>
            <Plus className="w-3.5 h-3.5" /> 배정 추가
          </Button>
        </div>
      </div>

      {/* ── Room summary badges ── */}
      <div className="flex gap-2">
        {ROOMS.map(room => {
          const count = assignments.filter(a => a.room === room.value).length;
          return (
            <Badge key={room.value} className={cn(room.color, 'text-xs')}>
              {room.label}: {count}명
            </Badge>
          );
        })}
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header row */}
              <div className="grid gap-1" style={{ gridTemplateColumns: '60px 1fr 1fr' }}>
                <div className="text-xs font-medium text-muted-foreground p-2">시간</div>
                {ROOMS.map(room => (
                  <div key={room.value} className="text-center p-2">
                    <Badge className={cn(room.color, 'text-xs')}>{room.label}</Badge>
                  </div>
                ))}
              </div>

              {/* Slot rows */}
              {slots.map(slot => (
                <div key={slot} className="grid gap-1 border-t border-border/30"
                  style={{ gridTemplateColumns: '60px 1fr 1fr' }}>
                  <div className="text-xs font-mono text-muted-foreground p-2 flex items-start pt-3">
                    {slot}
                  </div>
                  {ROOMS.map(room => {
                    const slotId = `${room.value}|${slot}`;
                    const items = gridData[room.value]?.[slot] || [];
                    return (
                      <DroppableSlot key={slotId} slotId={slotId}>
                        {items.map(a => (
                          <div key={a.id} className="group relative">
                            <DraggableCard assignment={a} />
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="absolute -top-1 -right-1 hidden group-hover:flex
                                         w-4 h-4 items-center justify-center rounded-full
                                         bg-destructive text-destructive-foreground text-[10px]"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </DroppableSlot>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeItem && (
              <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background shadow-lg">
                <GripVertical className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium">{activeItem.student_name}</span>
                {activeItem.subject && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{activeItem.subject}</Badge>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Add Dialog ── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>강의실 배정 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>강의실</Label>
                <Select value={addRoom} onValueChange={setAddRoom}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOMS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>시간 슬롯</Label>
                <Select value={addSlot} onValueChange={setAddSlot}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {slots.map(s => <SelectItem key={s} value={s}>{s}~{slotEnd(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>학생</Label>
              <Input placeholder="이름 검색..." value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)} className="mb-1 h-8 text-xs" />
              <Select value={addStudentId} onValueChange={setAddStudentId}>
                <SelectTrigger><SelectValue placeholder="학생 선택" /></SelectTrigger>
                <SelectContent>
                  {filteredStudents.slice(0, 50).map(s =>
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>담당 선생님</Label>
              <Select value={addTeacherId} onValueChange={setAddTeacherId}>
                <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t =>
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>과목</Label>
                <Select value={addSubject} onValueChange={setAddSubject}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="수학">수학</SelectItem>
                    <SelectItem value="영어">영어</SelectItem>
                    <SelectItem value="국어">국어</SelectItem>
                    <SelectItem value="과학">과학</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>메모</Label>
                <Input value={addMemo} onChange={e => setAddMemo(e.target.value)}
                  placeholder="메모" className="h-9" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={addIsRoutine}
                onCheckedChange={v => setAddIsRoutine(!!v)} id="routine-check" />
              <Label htmlFor="routine-check" className="text-sm">정기 루틴</Label>
            </div>

            {addIsRoutine && (
              <div>
                <Label>반복 요일</Label>
                <div className="flex gap-1 mt-1">
                  {DAY_LABELS.map((label, idx) => (
                    <Button key={idx} type="button" size="sm"
                      variant={addRoutineDays.includes(idx) ? 'default' : 'outline'}
                      className="w-9 h-8 text-xs"
                      onClick={() => setAddRoutineDays(prev =>
                        prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx].sort()
                      )}>
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>취소</Button>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                배정
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Copy Dialog ── */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>배정 복사</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>원본 날짜</Label>
              <p className="text-sm font-medium">{dateLabel}</p>
            </div>
            <div>
              <Label>강의실</Label>
              <Select value={copyRoom} onValueChange={setCopyRoom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>대상 날짜</Label>
              <Input type="date" value={copyTargetDate}
                onChange={e => setCopyTargetDate(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCopyDialog(false)}>취소</Button>
              <Button onClick={handleCopyDay} disabled={copying}>
                {copying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Copy className="w-4 h-4 mr-1" />}
                복사
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
