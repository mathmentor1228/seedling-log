import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import {
  Trash2, Loader2, Search, Users, Check, Plus, CalendarDays, LayoutGrid, Eye, ArrowUp, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ──
const ROOMS = [
  { id: 'general', label: '일반강의실' },
  { id: 'room10', label: '10강의실' },
  { id: 'glass', label: '유리문강의실' },
];

const DAYS = ['월', '화', '수', '목', '금', '토'];

const SLOT_HEIGHT = 44;

type ViewMode = 'day' | 'week' | 'overview';
type OverviewSubTab = 'byDate' | 'byDay';

// Teacher color mapping
const TEACHER_COLORS: Record<string, { bg: string; border: string; text: string; initial: string }> = {};
const DEFAULT_TEACHER_COLOR = { bg: '#D3D1C7', border: '#5F5E5A', text: '#444441' };

function getTeacherColor(teacherName: string | null) {
  if (!teacherName) return DEFAULT_TEACHER_COLOR;
  if (teacherName.includes('서미정') || teacherName === '서미정')
    return { bg: '#9FE1CB', border: '#085041', text: '#085041' };
  if (teacherName.includes('김민희') || teacherName === '김민희')
    return { bg: '#CECBF6', border: '#534AB7', text: '#3C3489' };
  return DEFAULT_TEACHER_COLOR;
}

function getTeacherInitial(teacherName: string | null): string {
  if (!teacherName) return '';
  if (teacherName.includes('서미정') || teacherName === '서미정') return '서';
  if (teacherName.includes('김민희') || teacherName === '김민희') return '김';
  return teacherName.charAt(0);
}

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

function getDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}

function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

const GRADE_ORDER = ['고3', '고2', '고1', '기타'];

function getGradeGroup(grade: string | number | null): string {
  if (!grade && grade !== 0) return '기타';
  const g = String(grade).trim();
  if (g === '3') return '고3';
  if (g === '2') return '고2';
  if (g === '1') return '고1';
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
  teacher_id: string | null;
  teacher_name: string | null;
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
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({}); // id → name

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedDate, setSelectedDate] = useState(getTodayKST);
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>('byDate');
  const [overviewDay, setOverviewDay] = useState(DAYS[0]);

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

  // Guerrilla modal
  const [guerrillaOpen, setGuerrillaOpen] = useState(false);
  const [guerrillaSearch, setGuerrillaSearch] = useState('');
  const [guerrillaStudentIds, setGuerrillaStudentIds] = useState<string[]>([]);
  const [guerrillaRoom, setGuerrillaRoom] = useState('general');
  const [guerrillaStart, setGuerrillaStart] = useState('');
  const [guerrillaEnd, setGuerrillaEnd] = useState('');
  const [guerrillaDate, setGuerrillaDate] = useState(getTodayKST);
  const [guerrillaSaving, setGuerrillaSaving] = useState(false);

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
      const tList = (profileData ?? []) as TeacherOption[];
      setTeachers(tList);
      const tMap: Record<string, string> = {};
      tList.forEach(t => { tMap[t.id] = t.full_name ?? ''; });
      setTeacherMap(tMap);
    }

    const { data: csData } = await supabase
      .from('class_students')
      .select('student_id, class_id');
    const { data: clsData } = await supabase
      .from('classes')
      .select('id, teacher_id, subject')
      .not('teacher_id', 'is', null);

    const classMapLocal: Record<string, { teacher_id: string; subject: string }> = {};
    (clsData ?? []).forEach((c: any) => { classMapLocal[c.id] = { teacher_id: c.teacher_id, subject: c.subject }; });

    const stMap: Record<string, string[]> = {};
    const ssMap: Record<string, string[]> = {};
    (csData ?? []).forEach((cs: any) => {
      const cls = classMapLocal[cs.class_id];
      if (!cls) return;
      const sid = cs.student_id;
      if (!stMap[sid]) stMap[sid] = [];
      if (!stMap[sid].includes(cls.teacher_id)) stMap[sid].push(cls.teacher_id);
      if (!ssMap[sid]) ssMap[sid] = [];
      if (!ssMap[sid].includes(cls.subject)) ssMap[sid].push(cls.subject);
    });
    setStudentTeacherMap(stMap);
    setStudentSubjectMap(ssMap);
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
      teacher_id: r.teacher_id,
      teacher_name: null, // resolved later
    })));
  }, []);

  // Resolve teacher names after both teachers and assignments are loaded
  const resolvedAssignments = useMemo(() => {
    return assignments.map(a => ({
      ...a,
      teacher_name: a.teacher_id ? (teacherMap[a.teacher_id] ?? null) : null,
    }));
  }, [assignments, teacherMap]);

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
    if (filterTeacherId) list = list.filter(s => studentTeacherMap[s.id]?.includes(filterTeacherId));
    if (filterSubject) list = list.filter(s => studentSubjectMap[s.id]?.includes(filterSubject));
    if (search) list = list.filter(s => s.name.includes(search));
    return list;
  }, [students, filterTeacherId, filterSubject, search, studentTeacherMap, studentSubjectMap]);

  const groupedStudents = useMemo(() => {
    return GRADE_ORDER.reduce((acc, grade) => {
      const grp = filteredStudents.filter(s => getGradeGroup(s.grade ?? null) === grade);
      if (grp.length > 0) acc[grade] = grp;
      return acc;
    }, {} as Record<string, StudentOption[]>);
  }, [filteredStudents]);

  // ── myStudentIds for overview general room filtering ──
  const myStudentIds = useMemo(() => {
    if (!filterTeacherId) return null; // no filter = show all
    return students.filter(s => studentTeacherMap[s.id]?.includes(filterTeacherId)).map(s => s.id);
  }, [filterTeacherId, students, studentTeacherMap]);

  // ── Get visible assignments for current view ──
  const visibleAssignments = useMemo(() => {
    if (viewMode === 'day') {
      return resolvedAssignments.filter(a =>
        (a.is_fixed && a.day === selectedDay) ||
        (!a.is_fixed && a.date && getDayOfWeek(a.date) === selectedDay)
      );
    }
    if (viewMode === 'week') {
      return resolvedAssignments.filter(a => a.is_fixed || !a.date);
    }
    // overview mode
    if (overviewSubTab === 'byDate') {
      const dayLabel = getDayOfWeek(selectedDate);
      return resolvedAssignments.filter(a =>
        (a.is_fixed && a.day === dayLabel) ||
        (!a.is_fixed && a.date === selectedDate)
      );
    }
    // byDay — fixed only
    return resolvedAssignments.filter(a => a.is_fixed && a.day === overviewDay);
  }, [resolvedAssignments, viewMode, selectedDay, selectedDate, overviewSubTab, overviewDay]);

  // Apply room-specific filtering for overview
  const overviewFilteredAssignments = useMemo(() => {
    if (viewMode !== 'overview') return visibleAssignments;
    return visibleAssignments.filter(a => {
      if (a.room === 'general' && myStudentIds) {
        return (a.student_ids as string[]).some(id => myStudentIds.includes(id));
      }
      // room10, glass → show all
      return true;
    });
  }, [viewMode, visibleAssignments, myStudentIds]);

  // ── Drop handler ──
  async function handleDrop(room: string, slot: string, day: string, data: {
    studentIds: string[]; studentNames: string[]; durationSlots: number; subject: string;
  }) {
    const slotEnd = calcSlotEnd(slot, data.durationSlots);
    const currentAssignments = viewMode === 'overview' ? overviewFilteredAssignments : visibleAssignments;

    // Only merge when EXACT same start time AND same duration (span)
    const existing = currentAssignments.find(a => {
      if (a.room !== room) return false;
      if (!(a.day === day || (!a.is_fixed && a.date && getDayOfWeek(a.date) === day))) return false;
      return a.time_slot === slot && a.span === data.durationSlots;
    });

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
        insertData.assigned_date = viewMode === 'overview' ? selectedDate : (viewMode === 'day' ? null : null);
      }
      const { error } = await supabase.from('room_assignments').insert(insertData);
      if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    }

    setSelectedStudentIds(new Set());
    fetchAssignments();
    toast({ title: '배정 완료' });
  }

  // ── Edit assignment (add/remove students) ──
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [editSearch, setEditSearch] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editStudentIds, setEditStudentIds] = useState<string[]>([]);
  const [editStudentNames, setEditStudentNames] = useState<string[]>([]);

  function openEditModal(assignment: Assignment) {
    setEditAssignment(assignment);
    setEditStudentIds([...(assignment.student_ids as string[])]);
    setEditStudentNames([...(assignment.student_names as string[])]);
    setEditSearch('');
  }

  function toggleEditStudent(id: string, name: string) {
    if (editStudentIds.includes(id)) {
      setEditStudentIds(prev => prev.filter(x => x !== id));
      setEditStudentNames(prev => {
        const idx = editStudentIds.indexOf(id);
        return prev.filter((_, i) => i !== idx);
      });
    } else {
      setEditStudentIds(prev => [...prev, id]);
      setEditStudentNames(prev => [...prev, name]);
    }
  }

  async function saveEditAssignment() {
    if (!editAssignment) return;
    if (editStudentIds.length === 0) {
      // If no students left, delete the assignment
      await handleRemove(editAssignment.id);
      setEditAssignment(null);
      return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from('room_assignments')
      .update({ student_ids: editStudentIds, student_names: editStudentNames } as any)
      .eq('id', editAssignment.id);
    setEditSaving(false);
    if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '수정 완료' });
    setEditAssignment(null);
    fetchAssignments();
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

  // ── Guerrilla save ──
  async function saveGuerrilla() {
    if (guerrillaStudentIds.length === 0 || !guerrillaStart || !guerrillaEnd) {
      toast({ title: '필수 항목을 모두 입력해주세요', variant: 'destructive' });
      return;
    }
    const startMin = slotToMinutes(guerrillaStart);
    const endMin = slotToMinutes(guerrillaEnd);
    if (endMin <= startMin) {
      toast({ title: '종료시간은 시작시간 이후여야 합니다', variant: 'destructive' });
      return;
    }
    const span = (endMin - startMin) / 30;
    const names = guerrillaStudentIds.map(id => students.find(s => s.id === id)?.name ?? '');

    setGuerrillaSaving(true);
    const { error } = await supabase.from('room_assignments').insert({
      room: guerrillaRoom,
      slot_start: guerrillaStart,
      slot_end: guerrillaEnd,
      student_ids: guerrillaStudentIds,
      student_names: names,
      span,
      teacher_id: user?.id || null,
      is_fixed: false,
      day: getDayOfWeek(guerrillaDate),
      assigned_date: guerrillaDate,
    } as any);
    setGuerrillaSaving(false);

    if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '게릴라 배정 완료' });
    setGuerrillaOpen(false);
    setGuerrillaStudentIds([]);
    setGuerrillaSearch('');
    fetchAssignments();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeAssignments = viewMode === 'overview' ? overviewFilteredAssignments : visibleAssignments;
  const currentDay = viewMode === 'day' ? selectedDay
    : viewMode === 'overview'
      ? (overviewSubTab === 'byDate' ? getDayOfWeek(selectedDate) : overviewDay)
      : '';

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
              <ToggleGroupItem value="overview" className="text-xs gap-1">
                <Eye className="w-3.5 h-3.5" /> 통합현황
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Fixed / guerrilla toggle (not in overview) */}
            {viewMode !== 'overview' && (
              <ToggleGroup type="single" value={isFixed ? 'fixed' : 'guerrilla'} onValueChange={v => v && setIsFixed(v === 'fixed')}>
                <ToggleGroupItem value="fixed" className="text-xs"
                  style={{ backgroundColor: isFixed ? 'rgba(159,225,203,0.35)' : undefined }}>
                  고정
                </ToggleGroupItem>
                <ToggleGroupItem value="guerrilla" className="text-xs"
                  style={{ backgroundColor: !isFixed ? 'rgba(250,199,117,0.35)' : undefined }}>
                  게릴라
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {/* Guerrilla add button (overview only) */}
            {viewMode === 'overview' && (
              <Button size="sm" variant="outline" className="text-xs gap-1 ml-auto"
                onClick={() => { setGuerrillaDate(selectedDate); setGuerrillaOpen(true); }}>
                <Plus className="w-3.5 h-3.5" /> 게릴라 추가
              </Button>
            )}
          </div>

          {/* Day tabs (day view) */}
          {viewMode === 'day' && (
            <div className="flex gap-1">
              {DAYS.map(d => (
                <Button key={d} size="sm" variant={selectedDay === d ? 'default' : 'outline'}
                  className="text-xs px-3" onClick={() => setSelectedDay(d)}>
                  {d}
                </Button>
              ))}
            </div>
          )}

          {/* Overview sub-tabs & controls */}
          {viewMode === 'overview' && (
            <div className="space-y-2">
              <div className="flex gap-1">
                <Button size="sm" variant={overviewSubTab === 'byDate' ? 'default' : 'outline'}
                  className="text-xs px-3" onClick={() => setOverviewSubTab('byDate')}>
                  날짜 기준
                </Button>
                <Button size="sm" variant={overviewSubTab === 'byDay' ? 'default' : 'outline'}
                  className="text-xs px-3" onClick={() => setOverviewSubTab('byDay')}>
                  요일 기준
                </Button>
              </div>
              {overviewSubTab === 'byDate' ? (
                <div className="flex items-center gap-2">
                  <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="w-40 h-8 text-sm" />
                  <Badge variant="outline">{getDayOfWeek(selectedDate)}요일</Badge>
                </div>
              ) : (
                <div className="flex gap-1">
                  {DAYS.map(d => (
                    <Button key={d} size="sm" variant={overviewDay === d ? 'default' : 'outline'}
                      className="text-xs px-3" onClick={() => setOverviewDay(d)}>
                      {d}
                    </Button>
                  ))}
                </div>
              )}
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
            onEdit={openEditModal}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        ) : viewMode === 'overview' ? (
          <OverviewGrid
            timeSlots={timeSlots}
            assignments={activeAssignments}
            day={currentDay}
            onRemove={handleRemove}
            onDrop={handleDrop}
            onEdit={openEditModal}
          />
        ) : (
          <DayGrid
            timeSlots={timeSlots}
            assignments={visibleAssignments}
            day={selectedDay}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onEdit={openEditModal}
            selectedStudentIds={selectedStudentIds}
            students={students}
            durationSlots={durationSlots}
            selectedSubject={selectedSubject}
          />
        )}
      </div>

      {/* ══════ Right: Student Panel ══════ */}
      {viewMode !== 'overview' && (
        <div className="w-64 shrink-0 border-l border-border pl-4 overflow-auto">
          <div className="space-y-3 sticky top-0 bg-background pb-3 z-10">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="w-4 h-4" /> 학생 선택
            </h3>

            <Select value={filterTeacherId || 'all'} onValueChange={v => setFilterTeacherId(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="전체 선생님" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선생님</SelectItem>
                {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterSubject || 'all'} onValueChange={v => setFilterSubject(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="전체 과목" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 과목</SelectItem>
                {['수학', '영어', '국어', '과학'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="이름 검색" value={search} onChange={e => setSearch(e.target.value)}
                className="h-8 text-xs pl-7" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">머무는 시간</span>
              <div className="flex gap-1 flex-wrap">
                {[1, 2, 3, 4, 6].map(n => (
                  <button key={n} onClick={() => setDurationSlots(n)}
                    className={cn('text-[11px] px-2 py-0.5 rounded border transition-colors',
                      durationSlots === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/50'
                    )}>
                    {n === 1 ? '30분' : n === 2 ? '1시간' : n === 3 ? '1.5h' : n === 4 ? '2시간' : '3시간'}
                  </button>
                ))}
              </div>
            </div>

            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="배정 과목" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">과목 없음</SelectItem>
                {['수학', '영어', '국어', '과학'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            {selectedStudentIds.size > 0 && (
              <div className="bg-primary/10 rounded-lg p-2 text-center">
                <span className="text-xs font-semibold text-primary">{selectedStudentIds.size}명 선택됨</span>
                <p className="text-[10px] text-muted-foreground">시간 슬롯으로 드래그하세요</p>
              </div>
            )}
          </div>

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
      )}

      {/* ══════ Overview: Teacher filter on right side ══════ */}
      {viewMode === 'overview' && (
        <div className="w-56 shrink-0 border-l border-border pl-4 overflow-auto">
          <div className="space-y-3 sticky top-0 bg-background pb-3 z-10">
            <h3 className="text-sm font-semibold">필터</h3>
            <Select value={filterTeacherId || 'all'} onValueChange={v => setFilterTeacherId(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="전체 선생님" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선생님</SelectItem>
                {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="space-y-1.5 text-[11px] text-muted-foreground">
              <p className="font-semibold text-foreground text-xs">범례</p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#9FE1CB', borderColor: '#085041' }} />
                <span>서미정T</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#CECBF6', borderColor: '#534AB7' }} />
                <span>김민희T</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2" style={{ backgroundColor: '#D3D1C7', borderColor: '#5F5E5A' }} />
                <span>기타</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-3 rounded border-2 border-muted-foreground" />
                  <span>고정</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-3 rounded border-2 border-dashed border-muted-foreground" />
                  <span>게릴라</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Guerrilla Add Modal ══════ */}
      <GuerrillaModal
        open={guerrillaOpen}
        onOpenChange={setGuerrillaOpen}
        students={students}
        search={guerrillaSearch}
        setSearch={setGuerrillaSearch}
        selectedIds={guerrillaStudentIds}
        setSelectedIds={setGuerrillaStudentIds}
        room={guerrillaRoom}
        setRoom={setGuerrillaRoom}
        startSlot={guerrillaStart}
        setStartSlot={setGuerrillaStart}
        endSlot={guerrillaEnd}
        setEndSlot={setGuerrillaEnd}
        date={guerrillaDate}
        setDate={setGuerrillaDate}
        timeSlots={timeSlots}
        saving={guerrillaSaving}
        onSave={saveGuerrilla}
      />

      {/* ══════ Edit Assignment Modal ══════ */}
      <Dialog open={!!editAssignment} onOpenChange={(open) => { if (!open) setEditAssignment(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">배정 수정 — {editAssignment?.time_slot}~{editAssignment?.slot_end}</DialogTitle>
          </DialogHeader>
          {editAssignment && (
            <div className="space-y-4">
              {/* Current students */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">현재 배정 학생 ({editStudentIds.length}명)</Label>
                {editStudentIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {editStudentIds.map((id, idx) => (
                      <Badge key={id} variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20"
                        onClick={() => toggleEditStudent(id, editStudentNames[idx])}>
                        {editStudentNames[idx]} ×
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">학생이 없으면 저장 시 배정이 삭제됩니다</p>
                )}
              </div>

              {/* Add students */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">학생 추가</Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="이름 검색" value={editSearch} onChange={e => setEditSearch(e.target.value)}
                    className="h-8 text-xs pl-7" />
                </div>
              </div>
              <div className="max-h-40 overflow-auto border rounded p-1 space-y-0.5">
                {students
                  .filter(s => !editSearch || s.name.includes(editSearch))
                  .slice(0, 50).map(s => {
                    const selected = editStudentIds.includes(s.id);
                    return (
                      <div key={s.id} className={cn(
                        'flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors',
                        selected ? 'bg-primary/15 font-semibold' : 'hover:bg-muted'
                      )} onClick={() => toggleEditStudent(s.id, s.name)}>
                        <div className={cn('w-3 h-3 rounded-sm border flex items-center justify-center',
                          selected ? 'bg-primary border-primary' : 'border-muted-foreground/30')}>
                          {selected && <Check className="w-2 h-2 text-primary-foreground" />}
                        </div>
                        {s.name}
                        {s.grade && <span className="text-muted-foreground">({s.grade})</span>}
                      </div>
                    );
                  })}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setEditAssignment(null)}>취소</Button>
                <Button size="sm" onClick={saveEditAssignment} disabled={editSaving}>
                  {editSaving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  {editStudentIds.length === 0 ? '배정 삭제' : '저장'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// OverviewGrid — 통합현황 뷰
// ════════════════════════════════════════════════════════
function OverviewGrid({ timeSlots, assignments, day, onRemove, onDrop }: {
  timeSlots: string[];
  assignments: Assignment[];
  day: string;
  onRemove: (id: string) => void;
  onDrop: (room: string, slot: string, day: string, data: any) => void;
}) {
  return (
    <div className="min-w-[500px]">
      {/* Header */}
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-px bg-border rounded-t-lg overflow-hidden">
        <div className="bg-muted p-2 text-xs font-medium text-muted-foreground text-center">시간</div>
        {ROOMS.map(room => (
          <div key={room.id} className={cn(
            'p-2 text-xs font-semibold text-center flex items-center justify-center gap-1.5',
            room.id === 'general' ? 'bg-[hsl(var(--accent))]' : 'bg-muted'
          )}>
            {room.label}
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
              {room.id === 'general' ? '본인담당만' : '전체공개'}
            </Badge>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-px bg-border border border-t-0 rounded-b-lg overflow-hidden">
        {timeSlots.map(slot => (
          <OverviewSlotRow key={slot} slot={slot} day={day} assignments={assignments} onRemove={onRemove} onDrop={onDrop} />
        ))}
      </div>
    </div>
  );
}

function OverviewSlotRow({ slot, day, assignments, onRemove, onDrop }: {
  slot: string;
  day: string;
  assignments: Assignment[];
  onRemove: (id: string) => void;
  onDrop: (room: string, slot: string, day: string, data: any) => void;
}) {
  return (
    <>
      <div className="bg-muted/50 p-1.5 text-[11px] text-muted-foreground text-center font-mono flex items-center justify-center"
        style={{ height: SLOT_HEIGHT }}>
        {slot}
      </div>
      {ROOMS.map(room => {
        const assignment = assignments.find(a => a.room === room.id && a.time_slot === slot);
        const parentAssignment = !assignment ? assignments.find(a => {
          if (a.room !== room.id || a.span <= 1) return false;
          const aIdx = slotToMinutes(a.time_slot);
          const curIdx = slotToMinutes(slot);
          return curIdx > aIdx && curIdx < aIdx + a.span * 30;
        }) : null;

        if (parentAssignment) {
          return (
            <div key={room.id} className="bg-background relative"
              style={{ height: SLOT_HEIGHT }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/30', 'ring-inset'); }}
              onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset'); }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset');
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                try { onDrop(room.id, parentAssignment.time_slot, day, JSON.parse(raw)); } catch {}
              }}
            />
          );
        }

        if (assignment) {
          return (
            <OverviewAssignmentBlock
              key={room.id}
              assignment={assignment}
              onRemove={() => onRemove(assignment.id)}
              onDropAdd={(data) => onDrop(room.id, slot, day, data)}
            />
          );
        }

        return (
          <div key={room.id} className="bg-background border-dashed border border-border/30"
            style={{ height: SLOT_HEIGHT }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/30', 'ring-inset'); }}
            onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset'); }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset');
              const raw = e.dataTransfer.getData('application/json');
              if (!raw) return;
              try { onDrop(room.id, slot, day, JSON.parse(raw)); } catch {}
            }}
          />
        );
      })}
    </>
  );
}

// ════════════════════════════════════════════════════════
// OverviewAssignmentBlock — teacher-colored chips
// ════════════════════════════════════════════════════════
function OverviewAssignmentBlock({ assignment, onRemove, onDropAdd }: { assignment: Assignment; onRemove: () => void; onDropAdd?: (data: any) => void }) {
  const heightPx = assignment.span * SLOT_HEIGHT - 2;
  const tColor = getTeacherColor(assignment.teacher_name);
  const initial = getTeacherInitial(assignment.teacher_name);

  return (
    <div
      style={{
        height: heightPx,
        backgroundColor: tColor.bg,
        borderColor: tColor.border,
        color: tColor.text,
        borderStyle: assignment.is_fixed ? 'solid' : 'dashed',
      }}
      className="rounded border-2 px-1.5 py-1 relative group overflow-hidden"
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/40'); }}
      onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/40'); }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.classList.remove('ring-2', 'ring-primary/40');
        const raw = e.dataTransfer.getData('application/json');
        if (!raw || !onDropAdd) return;
        try { onDropAdd(JSON.parse(raw)); } catch {}
      }}
    >
      <div className="flex flex-wrap gap-0.5 items-center">
        {initial && (
          <span className="text-[9px] font-bold rounded px-1 py-0 mr-0.5"
            style={{ backgroundColor: tColor.border, color: tColor.bg }}>
            {initial}
          </span>
        )}
        {(assignment.student_names ?? []).map((name: string, i: number) => (
          <span key={i} className="text-[11px] font-semibold inline-flex items-center gap-0.5">
            {name}
            {!assignment.is_fixed && <ArrowUp className="w-2.5 h-2.5 inline-block" />}
          </span>
        ))}
      </div>
      {assignment.subject && (
        <div className="text-[10px] opacity-70 mt-0.5">{assignment.subject}</div>
      )}
      <div className="text-[10px] opacity-50">
        {assignment.time_slot}~{assignment.slot_end}
      </div>
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
// DayGrid — 요일별 뷰
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
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-px bg-border rounded-t-lg overflow-hidden">
        <div className="bg-muted p-2 text-xs font-medium text-muted-foreground text-center">시간</div>
        {ROOMS.map(room => (
          <div key={room.id} className="bg-muted p-2 text-xs font-semibold text-center">{room.label}</div>
        ))}
      </div>
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-px bg-border border border-t-0 rounded-b-lg overflow-hidden">
        {timeSlots.map(slot => (
          <SlotRow key={slot} slot={slot} day={day} assignments={assignments} onDrop={onDrop} onRemove={onRemove}
            selectedStudentIds={selectedStudentIds} students={students} durationSlots={durationSlots} selectedSubject={selectedSubject} />
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  slot, day, assignments, onDrop, onRemove,
  selectedStudentIds, students, durationSlots, selectedSubject,
}: {
  slot: string; day: string; assignments: Assignment[];
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>; students: StudentOption[];
  durationSlots: number; selectedSubject: string;
}) {
  return (
    <>
      <div className="bg-muted/50 p-1.5 text-[11px] text-muted-foreground text-center font-mono flex items-center justify-center"
        style={{ height: SLOT_HEIGHT }}>{slot}</div>
      {ROOMS.map(room => {
        const assignment = assignments.find(a => a.room === room.id && a.time_slot === slot);
        const parentAssignment = !assignment ? assignments.find(a => {
          if (a.room !== room.id || a.span <= 1) return false;
          const aIdx = slotToMinutes(a.time_slot);
          const curIdx = slotToMinutes(slot);
          return curIdx > aIdx && curIdx < aIdx + a.span * 30;
        }) : null;

        if (parentAssignment) {
          // Occupied by a multi-span block — render a droppable area that merges into the parent
          return (
            <div key={room.id} className="bg-background relative"
              style={{ height: SLOT_HEIGHT }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/30', 'ring-inset'); }}
              onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset'); }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset');
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                try { onDrop(room.id, parentAssignment.time_slot, day, JSON.parse(raw)); } catch {}
              }}
            />
          );
        }
        if (assignment) {
          return <AssignmentBlock key={room.id} assignment={assignment} onRemove={() => onRemove(assignment.id)}
            onDropAdd={(data) => onDrop(room.id, slot, day, data)} />;
        }
        return (
          <DroppableSlot key={room.id} room={room.id} slot={slot} day={day} onDrop={onDrop}
            selectedStudentIds={selectedStudentIds} students={students} durationSlots={durationSlots} selectedSubject={selectedSubject} />
        );
      })}
    </>
  );
}

// ════════════════════════════════════════════════════════
// WeekGrid — 주간 뷰
// ════════════════════════════════════════════════════════
function WeekGrid({
  timeSlots, assignments, onDrop, onRemove,
  selectedStudentIds, students, durationSlots, selectedSubject,
}: {
  timeSlots: string[]; assignments: Assignment[];
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>; students: StudentOption[];
  durationSlots: number; selectedSubject: string;
}) {
  return (
    <div className="space-y-6">
      {ROOMS.map(room => (
        <div key={room.id}>
          <h4 className="text-sm font-semibold mb-2">{room.label}</h4>
          <div className="overflow-auto">
            <div className="grid gap-px bg-border rounded-lg overflow-hidden"
              style={{ gridTemplateColumns: `60px repeat(${DAYS.length}, 1fr)` }}>
              <div className="bg-muted p-2 text-xs font-medium text-muted-foreground text-center">시간</div>
              {DAYS.map(d => <div key={d} className="bg-muted p-2 text-xs font-semibold text-center">{d}</div>)}
              {timeSlots.map(slot => (
                <WeekSlotRow key={slot} slot={slot} room={room.id} assignments={assignments}
                  onDrop={onDrop} onRemove={onRemove} selectedStudentIds={selectedStudentIds}
                  students={students} durationSlots={durationSlots} selectedSubject={selectedSubject} />
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
  slot: string; room: string; assignments: Assignment[];
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  onRemove: (id: string) => void;
  selectedStudentIds: Set<string>; students: StudentOption[];
  durationSlots: number; selectedSubject: string;
}) {
  return (
    <>
      <div className="bg-muted/50 p-1 text-[11px] text-muted-foreground text-center font-mono flex items-center justify-center"
        style={{ height: SLOT_HEIGHT }}>{slot}</div>
      {DAYS.map(day => {
        const assignment = assignments.find(a => a.room === room && a.time_slot === slot && a.day === day);
        const parentAssignment = !assignment ? assignments.find(a => {
          if (a.room !== room || a.day !== day || a.span <= 1) return false;
          const aIdx = slotToMinutes(a.time_slot);
          const curIdx = slotToMinutes(slot);
          return curIdx > aIdx && curIdx < aIdx + a.span * 30;
        }) : null;

        if (parentAssignment) {
          return (
            <div key={day} className="bg-background relative"
              style={{ height: SLOT_HEIGHT }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/30', 'ring-inset'); }}
              onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset'); }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-primary/30', 'ring-inset');
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                try { onDrop(room, parentAssignment.time_slot, day, JSON.parse(raw)); } catch {}
              }}
            />
          );
        }
        if (assignment) {
          return <AssignmentBlock key={day} assignment={assignment} onRemove={() => onRemove(assignment.id)} compact
            onDropAdd={(data) => onDrop(room, slot, day, data)} />;
        }
        return (
          <DroppableSlot key={day} room={room} slot={slot} day={day} onDrop={onDrop}
            selectedStudentIds={selectedStudentIds} students={students} durationSlots={durationSlots} selectedSubject={selectedSubject} />
        );
      })}
    </>
  );
}

// ════════════════════════════════════════════════════════
// AssignmentBlock (day/week views — original style)
// ════════════════════════════════════════════════════════
function AssignmentBlock({ assignment, onRemove, compact, onDropAdd }: {
  assignment: Assignment; onRemove: () => void; compact?: boolean;
  onDropAdd?: (data: any) => void;
}) {
  const heightPx = assignment.span * SLOT_HEIGHT - 2;
  const bgColor = assignment.is_fixed ? 'rgba(159,225,203,0.35)' : 'rgba(250,199,117,0.35)';
  const borderStyle = assignment.is_fixed
    ? 'border-[#9FE1CB] text-[#085041]'
    : 'border-[#FAC775] text-[#633806]';

  return (
    <div style={{ height: heightPx, backgroundColor: bgColor }}
      className={cn('rounded border px-1.5 py-1 relative group overflow-hidden', borderStyle)}
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/40'); }}
      onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/40'); }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.classList.remove('ring-2', 'ring-primary/40');
        const raw = e.dataTransfer.getData('application/json');
        if (!raw || !onDropAdd) return;
        try { onDropAdd(JSON.parse(raw)); } catch {}
      }}
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
        <div className="text-[10px] opacity-50">{assignment.time_slot}~{assignment.slot_end}</div>
      )}
      <button onClick={onRemove}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded-full p-0.5 hover:bg-destructive/20">
        <Trash2 className="w-3 h-3 text-destructive" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DroppableSlot
// ════════════════════════════════════════════════════════
function DroppableSlot({ room, slot, day, onDrop, selectedStudentIds, students, durationSlots, selectedSubject }: {
  room: string; slot: string; day: string;
  onDrop: (room: string, slot: string, day: string, data: any) => void;
  selectedStudentIds: Set<string>; students: StudentOption[];
  durationSlots: number; selectedSubject: string;
}) {
  return (
    <div style={{ height: SLOT_HEIGHT }} className="bg-background border-0 transition-colors"
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('!bg-primary/10'); }}
      onDragLeave={e => { e.currentTarget.classList.remove('!bg-primary/10'); }}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.classList.remove('!bg-primary/10');
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        try { onDrop(room, slot, day, JSON.parse(raw)); } catch {}
      }}
    />
  );
}

// ════════════════════════════════════════════════════════
// DraggableStudentChip
// ════════════════════════════════════════════════════════
function DraggableStudentChip({
  student, isSelected, onToggle,
  selectedIds, allStudents, durationSlots, selectedSubject,
}: {
  student: StudentOption; isSelected: boolean; onToggle: () => void;
  selectedIds: Set<string>; allStudents: StudentOption[];
  durationSlots: number; selectedSubject: string;
}) {
  return (
    <div draggable
      onDragStart={e => {
        const data = {
          studentIds: isSelected && selectedIds.size > 1 ? Array.from(selectedIds) : [student.id],
          studentNames: isSelected && selectedIds.size > 1
            ? allStudents.filter(s => selectedIds.has(s.id)).map(s => s.name) : [student.name],
          durationSlots,
          subject: selectedSubject === 'none' ? '' : selectedSubject,
        };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
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
        isSelected ? 'bg-primary/15 border-primary/30 font-semibold' : 'hover:bg-muted border-transparent'
      )}>
      <div className={cn('w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0',
        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30')}>
        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>
      {student.name}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// GuerrillaModal — 게릴라 배정 추가 모달
// ════════════════════════════════════════════════════════
function GuerrillaModal({
  open, onOpenChange, students, search, setSearch,
  selectedIds, setSelectedIds, room, setRoom,
  startSlot, setStartSlot, endSlot, setEndSlot,
  date, setDate, timeSlots, saving, onSave,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  students: StudentOption[]; search: string; setSearch: (v: string) => void;
  selectedIds: string[]; setSelectedIds: (v: string[]) => void;
  room: string; setRoom: (v: string) => void;
  startSlot: string; setStartSlot: (v: string) => void;
  endSlot: string; setEndSlot: (v: string) => void;
  date: string; setDate: (v: string) => void;
  timeSlots: string[]; saving: boolean; onSave: () => void;
}) {
  const filtered = search ? students.filter(s => s.name.includes(search)) : students;
  const startMin = startSlot ? slotToMinutes(startSlot) : 0;
  const endMin = endSlot ? slotToMinutes(endSlot) : 0;
  const span = endMin > startMin ? (endMin - startMin) / 30 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>게릴라 배정 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date */}
          <div className="space-y-1">
            <Label className="text-xs">날짜</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-sm" />
          </div>

          {/* Room */}
          <div className="space-y-1">
            <Label className="text-xs">강의실</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROOMS.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">시작시간</Label>
              <Select value={startSlot} onValueChange={setStartSlot}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">종료시간</Label>
              <Select value={endSlot} onValueChange={setEndSlot}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {timeSlots.filter(t => slotToMinutes(t) > startMin).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  {/* add last slot + 30min */}
                  {timeSlots.length > 0 && (() => {
                    const last = timeSlots[timeSlots.length - 1];
                    const extra = calcSlotEnd(last, 1);
                    if (slotToMinutes(extra) > startMin) {
                      return <SelectItem value={extra}>{extra}</SelectItem>;
                    }
                    return null;
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
          {span > 0 && <p className="text-[11px] text-muted-foreground">→ {span * 30}분 ({span}슬롯)</p>}

          {/* Student search */}
          <div className="space-y-1">
            <Label className="text-xs">학생 검색</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="이름 검색" value={search} onChange={e => setSearch(e.target.value)}
                className="h-8 text-xs pl-7" />
            </div>
          </div>

          {/* Selected students */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedIds.map(id => {
                const name = students.find(s => s.id === id)?.name ?? '';
                return (
                  <Badge key={id} variant="secondary" className="text-xs cursor-pointer"
                    onClick={() => setSelectedIds(selectedIds.filter(x => x !== id))}>
                    {name} ×
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Student list */}
          <div className="max-h-40 overflow-auto border rounded p-1 space-y-0.5">
            {filtered.slice(0, 50).map(s => {
              const selected = selectedIds.includes(s.id);
              return (
                <div key={s.id} className={cn(
                  'flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors',
                  selected ? 'bg-primary/15 font-semibold' : 'hover:bg-muted'
                )} onClick={() => {
                  if (selected) setSelectedIds(selectedIds.filter(x => x !== s.id));
                  else setSelectedIds([...selectedIds, s.id]);
                }}>
                  <div className={cn('w-3 h-3 rounded-sm border flex items-center justify-center',
                    selected ? 'bg-primary border-primary' : 'border-muted-foreground/30')}>
                    {selected && <Check className="w-2 h-2 text-primary-foreground" />}
                  </div>
                  {s.name}
                  {s.grade && <span className="text-muted-foreground">({s.grade})</span>}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
          <Button size="sm" onClick={onSave} disabled={saving || selectedIds.length === 0 || !startSlot || !endSlot}>
            {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
