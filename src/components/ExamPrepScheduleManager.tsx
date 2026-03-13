import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Trash2, AlertTriangle, CalendarCheck, Clock, Users, X,
  ChevronDown, ChevronUp, ArrowLeft, UserPlus, UserMinus, GripVertical,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────
interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
}
interface Teacher { id: string; full_name: string; }
interface ClassInfo { class_id: string; student_id: string; subject: string; teacher_id: string | null; }

interface TimeSlotEntry { id: string; startTime: string; endTime: string; }
interface SessionEntry { label: string; date: string; slots: TimeSlotEntry[]; }

interface ExistingSchedule {
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_name: string;
}

// DB types
interface DbCourse {
  id: string; subject: string; teacher_id: string; title: string | null;
  description: string | null; deadline_date: string; created_at: string;
}
interface DbSession { id: string; course_id: string; session_number: number; session_label: string; schedule_date: string; start_time: string; end_time: string; }
interface DbTimeSlot { id: string; session_id: string; start_time: string; end_time: string; slot_order: number; }
interface DbSlotStudent { id: string; slot_id: string; student_id: string; }
interface DbEnrollment { id: string; course_id: string; student_id: string; status: string; confirmed_at: string | null; }

interface CourseView extends DbCourse {
  sessions: (DbSession & { time_slots: (DbTimeSlot & { students: DbSlotStudent[] })[] })[];
  enrollments: DbEnrollment[];
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];
const SCHOOL_LEVEL_ORDER: Record<string, number> = { '초': 1, '중': 2, '고': 3 };
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '미확인', variant: 'destructive' },
  confirmed: { label: '확인완료', variant: 'default' },
  auto_confirmed: { label: '시스템 확정', variant: 'secondary' },
};

let _tempId = 0;
function tempId() { return `temp_${++_tempId}`; }

export function ExamPrepScheduleManager() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Data
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classInfos, setClassInfos] = useState<ClassInfo[]>([]);
  const [existingSchedules, setExistingSchedules] = useState<ExistingSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // UI mode
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [step, setStep] = useState(1); // 1: basic info, 2: timetable + assign
  const [saving, setSaving] = useState(false);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  // Form - step 1
  const [formSubject, setFormSubject] = useState('수학');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDeadline, setFormDeadline] = useState('');

  // Form - step 2: sessions with multiple time slots
  const [sessions, setSessions] = useState<SessionEntry[]>([
    { label: '1회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
    { label: '2회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
    { label: '3회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
    { label: '4회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
    { label: '직전특강', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
  ]);

  // Slot → student assignments (slotTempId → studentId[])
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string[]>>({});
  // Currently "active" student for click-to-assign
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  const studentMap = useMemo(() => students.reduce<Record<string, Student>>((acc, s) => { acc[s.id] = s; return acc; }, {}), [students]);
  const teacherMap = useMemo(() => teachers.reduce<Record<string, string>>((acc, t) => { acc[t.id] = t.full_name; return acc; }, {}), [teachers]);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [studRes, teachRes, classStudRes, schedRes] = await Promise.all([
      supabase.from('students').select('id, name, grade, school, school_level, grade_year').neq('enrollment_status', '퇴원').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('class_students').select('class_id, student_id, classes(subject, teacher_id)'),
      supabase.from('class_schedules').select('class_id, day_of_week, start_time, end_time, is_active, classes(name), class_students(student_id)').eq('is_active', true),
    ]);
    setStudents(studRes.data || []);
    setTeachers(teachRes.data || []);
    const infos: ClassInfo[] = (classStudRes.data || []).map((cs: any) => ({
      class_id: cs.class_id, student_id: cs.student_id,
      subject: cs.classes?.subject || '', teacher_id: cs.classes?.teacher_id || null,
    }));
    setClassInfos(infos);

    const existingSch: ExistingSchedule[] = [];
    for (const s of (schedRes.data || []) as any[]) {
      for (const cs of (s.class_students || [])) {
        existingSch.push({
          student_id: cs.student_id, day_of_week: s.day_of_week,
          start_time: s.start_time, end_time: s.end_time, class_name: s.classes?.name || '수업',
        });
      }
    }
    setExistingSchedules(existingSch);
    await fetchCourses();
    setLoading(false);
  }

  async function fetchCourses() {
    const { data: coursesData } = await supabase.from('exam_prep_courses').select('*').order('created_at', { ascending: false });
    if (!coursesData || coursesData.length === 0) { setCourses([]); return; }
    const courseIds = coursesData.map((c: any) => c.id);

    const [sessRes, enrRes] = await Promise.all([
      supabase.from('exam_prep_sessions').select('*').in('course_id', courseIds).order('session_number'),
      supabase.from('exam_prep_enrollments').select('*').in('course_id', courseIds),
    ]);

    const sessionsData = (sessRes.data || []) as any[];
    const sessionIds = sessionsData.map((s: any) => s.id);

    let slotsData: any[] = [];
    let slotStudentsData: any[] = [];
    if (sessionIds.length > 0) {
      const [slotRes, slotStudRes] = await Promise.all([
        supabase.from('exam_prep_time_slots').select('*').in('session_id', sessionIds).order('slot_order'),
        supabase.from('exam_prep_slot_students').select('*'),
      ]);
      slotsData = slotRes.data || [];
      // Filter slot students to only relevant slots
      const slotIdSet = new Set(slotsData.map((s: any) => s.id));
      slotStudentsData = (slotStudRes.data || []).filter((ss: any) => slotIdSet.has(ss.slot_id));
    }

    setCourses(coursesData.map((c: any) => {
      const courseSessions = sessionsData.filter((s: any) => s.course_id === c.id);
      return {
        ...c,
        sessions: courseSessions.map((s: any) => {
          const sessionSlots = slotsData.filter((sl: any) => sl.session_id === s.id);
          return {
            ...s,
            time_slots: sessionSlots.map((sl: any) => ({
              ...sl,
              students: slotStudentsData.filter((ss: any) => ss.slot_id === sl.id),
            })),
          };
        }),
        enrollments: (enrRes.data || []).filter((e: any) => e.course_id === c.id),
      };
    }));
  }

  // Filtered students by subject + teacher
  const filteredStudents = useMemo(() => {
    if (!formSubject || !formTeacherId) return [];
    const sids = new Set(classInfos.filter(ci => ci.subject === formSubject && ci.teacher_id === formTeacherId).map(ci => ci.student_id));
    return students.filter(s => sids.has(s.id));
  }, [formSubject, formTeacherId, classInfos, students]);

  // Group by school_level + grade_year
  const groupedStudents = useMemo(() => {
    const groups: Record<string, Student[]> = {};
    for (const s of filteredStudents) {
      const level = s.school_level || '기타';
      const year = s.grade_year || 0;
      const key = `${level}${year}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const aL = SCHOOL_LEVEL_ORDER[a[0]] || 99;
      const bL = SCHOOL_LEVEL_ORDER[b[0]] || 99;
      if (aL !== bL) return aL - bL;
      return (parseInt(a.slice(1)) || 0) - (parseInt(b.slice(1)) || 0);
    });
  }, [filteredStudents]);

  // All assigned student IDs across all slots
  const assignedStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const ids of Object.values(slotAssignments)) ids.forEach(id => set.add(id));
    return set;
  }, [slotAssignments]);

  // Conflict detection for a student + slot
  const getConflictsForSlot = useCallback((studentId: string, sessionDate: string, slotStartTime: string, slotEndTime: string) => {
    if (!sessionDate || !slotStartTime || !slotEndTime) return [];
    const d = new Date(sessionDate + 'T00:00:00');
    const dow = d.getDay();
    const conflicts: string[] = [];
    // Regular class conflicts
    for (const es of existingSchedules) {
      if (es.student_id === studentId && es.day_of_week === dow && slotStartTime < es.end_time && slotEndTime > es.start_time) {
        conflicts.push(`${es.class_name} ${es.start_time.slice(0, 5)}-${es.end_time.slice(0, 5)}`);
      }
    }
    return conflicts;
  }, [existingSchedules]);

  // ── Session / Slot Editors ──────────────────────────────
  function updateSessionField(si: number, field: 'label' | 'date', value: string) {
    setSessions(prev => prev.map((s, i) => i === si ? { ...s, [field]: value } : s));
  }
  function addSession() {
    setSessions(prev => [...prev, { label: `${prev.length + 1}회차`, date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] }]);
  }
  function removeSession(si: number) {
    setSessions(prev => {
      const removed = prev[si];
      // Clean up slot assignments
      const newAssignments = { ...slotAssignments };
      removed.slots.forEach(sl => delete newAssignments[sl.id]);
      setSlotAssignments(newAssignments);
      return prev.filter((_, i) => i !== si);
    });
  }
  function addSlotToSession(si: number) {
    setSessions(prev => prev.map((s, i) => i === si ? { ...s, slots: [...s.slots, { id: tempId(), startTime: '', endTime: '' }] } : s));
  }
  function removeSlotFromSession(si: number, slotIdx: number) {
    setSessions(prev => prev.map((s, i) => {
      if (i !== si) return s;
      const removedSlot = s.slots[slotIdx];
      const newAssignments = { ...slotAssignments };
      delete newAssignments[removedSlot.id];
      setSlotAssignments(newAssignments);
      return { ...s, slots: s.slots.filter((_, j) => j !== slotIdx) };
    }));
  }
  function updateSlotTime(si: number, slotIdx: number, field: 'startTime' | 'endTime', value: string) {
    setSessions(prev => prev.map((s, i) => i === si ? {
      ...s,
      slots: s.slots.map((sl, j) => j === slotIdx ? { ...sl, [field]: value } : sl),
    } : s));
  }

  // ── Click-to-assign ──────────────────────────────
  function handleSlotClick(slotId: string) {
    if (!activeStudentId) return;
    const current = slotAssignments[slotId] || [];
    if (current.includes(activeStudentId)) return; // Already assigned
    setSlotAssignments(prev => ({ ...prev, [slotId]: [...(prev[slotId] || []), activeStudentId] }));
  }

  function removeStudentFromSlot(slotId: string, studentId: string) {
    setSlotAssignments(prev => ({
      ...prev,
      [slotId]: (prev[slotId] || []).filter(id => id !== studentId),
    }));
  }

  function assignStudentToAllSlots(studentId: string) {
    const newAssignments = { ...slotAssignments };
    for (const sess of sessions) {
      for (const slot of sess.slots) {
        if (slot.startTime && slot.endTime) {
          const current = newAssignments[slot.id] || [];
          if (!current.includes(studentId)) {
            newAssignments[slot.id] = [...current, studentId];
          }
        }
      }
    }
    setSlotAssignments(newAssignments);
  }

  function removeStudentFromAllSlots(studentId: string) {
    const newAssignments: Record<string, string[]> = {};
    for (const [slotId, ids] of Object.entries(slotAssignments)) {
      const filtered = ids.filter(id => id !== studentId);
      if (filtered.length > 0) newAssignments[slotId] = filtered;
    }
    setSlotAssignments(newAssignments);
  }

  // ── Save ──────────────────────────────
  async function handleSave() {
    const filledSessions = sessions.filter(s => s.date && s.slots.some(sl => sl.startTime && sl.endTime));
    const allAssignedIds = new Set<string>();
    for (const ids of Object.values(slotAssignments)) ids.forEach(id => allAssignedIds.add(id));

    if (!formDeadline || !formTeacherId || allAssignedIds.size === 0 || filledSessions.length === 0) {
      toast({ title: '필수 항목을 모두 입력해주세요', description: '마지노선, 선생님, 시간표, 학생 배치를 확인하세요.', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // 1. Create course
    const { data: course, error: courseErr } = await supabase.from('exam_prep_courses').insert({
      subject: formSubject, teacher_id: formTeacherId,
      title: formTitle || `${formSubject} 내신 특강`,
      description: formDescription || null, deadline_date: formDeadline,
      created_by: user?.id || null,
    }).select('id').single();

    if (courseErr || !course) {
      toast({ title: '저장 실패', description: courseErr?.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Create sessions (one per 회차, use first slot times as representative)
    const sessionRows = filledSessions.map((s, i) => {
      const firstSlot = s.slots.find(sl => sl.startTime && sl.endTime);
      return {
        course_id: course.id, session_number: i + 1, session_label: s.label,
        schedule_date: s.date,
        start_time: firstSlot?.startTime || '00:00',
        end_time: firstSlot?.endTime || '00:00',
      };
    });

    const { data: dbSessions, error: sessErr } = await supabase.from('exam_prep_sessions').insert(sessionRows).select('id, session_number');
    if (sessErr || !dbSessions) {
      toast({ title: '세션 저장 실패', variant: 'destructive' });
      await supabase.from('exam_prep_courses').delete().eq('id', course.id);
      setSaving(false);
      return;
    }

    // 3. Create time slots
    const timeSlotRows: Array<{ session_id: string; start_time: string; end_time: string; slot_order: number }> = [];
    const slotIdMapping: Record<string, { sessionIdx: number; slotOrder: number }> = {}; // temp_id → location

    filledSessions.forEach((sess, si) => {
      const dbSession = dbSessions.find((ds: any) => ds.session_number === si + 1);
      if (!dbSession) return;
      sess.slots.forEach((slot, sli) => {
        if (!slot.startTime || !slot.endTime) return;
        timeSlotRows.push({
          session_id: dbSession.id,
          start_time: slot.startTime, end_time: slot.endTime,
          slot_order: sli + 1,
        });
        slotIdMapping[slot.id] = { sessionIdx: si, slotOrder: sli + 1 };
      });
    });

    const { data: dbSlots, error: slotErr } = await supabase.from('exam_prep_time_slots').insert(timeSlotRows).select('id, session_id, slot_order');
    if (slotErr || !dbSlots) {
      toast({ title: '시간표 저장 실패', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 4. Create slot-student assignments
    const slotStudentRows: Array<{ slot_id: string; student_id: string }> = [];
    for (const [tempSlotId, studentIds] of Object.entries(slotAssignments)) {
      const mapping = slotIdMapping[tempSlotId];
      if (!mapping) continue;
      const filledSess = filledSessions[mapping.sessionIdx];
      if (!filledSess) continue;
      const dbSession = dbSessions.find((ds: any) => ds.session_number === mapping.sessionIdx + 1);
      if (!dbSession) continue;
      const dbSlot = dbSlots.find((ds: any) => ds.session_id === dbSession.id && ds.slot_order === mapping.slotOrder);
      if (!dbSlot) continue;
      for (const sid of studentIds) {
        slotStudentRows.push({ slot_id: dbSlot.id, student_id: sid });
      }
    }

    if (slotStudentRows.length > 0) {
      await supabase.from('exam_prep_slot_students').insert(slotStudentRows);
    }

    // 5. Create enrollments for all assigned students
    const enrollRows = [...allAssignedIds].map(sid => ({ course_id: course.id, student_id: sid }));
    await supabase.from('exam_prep_enrollments').insert(enrollRows);

    toast({ title: `${allAssignedIds.size}명 · ${filledSessions.length}회차 특강 등록 완료` });
    resetAndGoBack();
    await fetchCourses();
    setSaving(false);
  }

  async function handleDeleteCourse(courseId: string) {
    const { error } = await supabase.from('exam_prep_courses').delete().eq('id', courseId);
    if (!error) {
      setCourses(prev => prev.filter(c => c.id !== courseId));
      toast({ title: '삭제되었습니다' });
    }
  }

  function resetAndGoBack() {
    setMode('list');
    setStep(1);
    setFormSubject('수학');
    setFormTeacherId('');
    setFormTitle('');
    setFormDescription('');
    setFormDeadline('');
    setSessions([
      { label: '1회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
      { label: '2회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
      { label: '3회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
      { label: '4회차', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
      { label: '직전특강', date: '', slots: [{ id: tempId(), startTime: '', endTime: '' }] },
    ]);
    setSlotAssignments({});
    setActiveStudentId(null);
  }

  // Stats
  const allEnrollments = courses.flatMap(c => c.enrollments);
  const pendingCount = allEnrollments.filter(e => e.status === 'pending').length;
  const confirmedCount = allEnrollments.filter(e => e.status === 'confirmed').length;
  const autoCount = allEnrollments.filter(e => e.status === 'auto_confirmed').length;

  // ═══════════════ RENDER ═══════════════
  if (mode === 'create') {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetAndGoBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-bold">내신 특강 등록</h2>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={step === 1 ? 'default' : 'outline'} className="text-xs cursor-pointer" onClick={() => setStep(1)}>
              1. 기본 정보
            </Badge>
            <Badge variant={step === 2 ? 'default' : 'outline'} className="text-xs cursor-pointer" onClick={() => step === 1 && formTeacherId ? setStep(2) : null}>
              2. 시간표 & 배치
            </Badge>
          </div>
        </div>

        {step === 1 && (
          <Card>
            <CardContent className="p-5 space-y-5">
              {/* Subject + Teacher */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">과목</Label>
                  <Select value={formSubject} onValueChange={v => { setFormSubject(v); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">담당 선생님</Label>
                  <Select value={formTeacherId} onValueChange={v => { setFormTeacherId(v); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">특강 제목 (선택)</Label>
                  <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder={`${formSubject} 내신 특강`} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">확인 마지노선</Label>
                  <Input type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} className="h-9" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">설명 (선택)</Label>
                <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="특강 내용, 준비물 등" rows={2} />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!formTeacherId || !formDeadline}
                >
                  다음: 시간표 & 학생 배치 →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
            {/* LEFT: Timetable */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> 회차별 시간표
                </h3>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addSession}>
                  <Plus className="w-3 h-3 mr-1" /> 회차 추가
                </Button>
              </div>

              <div className="space-y-3">
                {sessions.map((sess, si) => (
                  <Card key={si} className="overflow-hidden border-border/60">
                    {/* Session header */}
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
                      <Input
                        value={sess.label}
                        onChange={e => updateSessionField(si, 'label', e.target.value)}
                        className="w-[90px] h-7 text-xs font-bold bg-background"
                      />
                      <Input
                        type="date"
                        value={sess.date}
                        onChange={e => updateSessionField(si, 'date', e.target.value)}
                        className="h-7 text-xs w-[160px] bg-background"
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => addSlotToSession(si)}>
                          <Plus className="w-3 h-3 mr-1" /> 시간대
                        </Button>
                        {sessions.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive" onClick={() => removeSession(si)}>
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Time slots */}
                    <div className="divide-y">
                      {sess.slots.map((slot, sli) => {
                        const assigned = slotAssignments[slot.id] || [];
                        const isTargetable = !!activeStudentId && !assigned.includes(activeStudentId) && slot.startTime && slot.endTime;
                        return (
                          <div
                            key={slot.id}
                            className={`px-4 py-3 transition-all ${
                              isTargetable
                                ? 'bg-primary/5 ring-2 ring-inset ring-primary/30 cursor-pointer hover:bg-primary/10'
                                : ''
                            }`}
                            onClick={() => isTargetable && handleSlotClick(slot.id)}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <GripVertical className="w-3 h-3 text-muted-foreground/40" />
                              <span className="text-[10px] text-muted-foreground font-medium w-[30px]">
                                #{sli + 1}
                              </span>
                              <Input
                                type="time"
                                value={slot.startTime}
                                onChange={e => updateSlotTime(si, sli, 'startTime', e.target.value)}
                                className="h-7 text-xs w-[110px]"
                                onClick={e => e.stopPropagation()}
                              />
                              <span className="text-xs text-muted-foreground">~</span>
                              <Input
                                type="time"
                                value={slot.endTime}
                                onChange={e => updateSlotTime(si, sli, 'endTime', e.target.value)}
                                className="h-7 text-xs w-[110px]"
                                onClick={e => e.stopPropagation()}
                              />
                              {sess.slots.length > 1 && (
                                <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={e => { e.stopPropagation(); removeSlotFromSession(si, sli); }}>
                                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                            {/* Assigned students */}
                            {assigned.length > 0 && (
                              <div className="flex flex-wrap gap-1 ml-[42px]">
                                {assigned.map(sid => {
                                  const st = studentMap[sid];
                                  const conflicts = getConflictsForSlot(sid, sess.date, slot.startTime, slot.endTime);
                                  const hasConflict = conflicts.length > 0;
                                  return (
                                    <Badge
                                      key={sid}
                                      variant={hasConflict ? 'destructive' : 'secondary'}
                                      className="text-[10px] pl-1.5 pr-0.5 py-0.5 gap-1 cursor-default group"
                                      title={hasConflict ? `충돌: ${conflicts.join(', ')}` : st?.name || ''}
                                    >
                                      {hasConflict && <AlertTriangle className="w-2.5 h-2.5" />}
                                      {st?.name || sid.slice(0, 6)}
                                      <button
                                        className="ml-0.5 rounded-full p-0.5 hover:bg-background/50 transition-colors"
                                        onClick={e => { e.stopPropagation(); removeStudentFromSlot(slot.id, sid); }}
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                            {assigned.length === 0 && slot.startTime && slot.endTime && (
                              <p className="text-[10px] text-muted-foreground/50 ml-[42px] italic">
                                {activeStudentId ? '클릭하여 학생 배치' : '학생을 선택 후 클릭'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>

              {/* Save */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>← 이전</Button>
                <Button onClick={handleSave} disabled={saving || assignedStudentIds.size === 0} size="lg">
                  {saving ? '저장 중...' : `${assignedStudentIds.size}명 · ${sessions.filter(s => s.date).length}회차 등록`}
                </Button>
              </div>
            </div>

            {/* RIGHT: Student List */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> 학생 명단
                <Badge variant="outline" className="text-[10px] ml-auto">{assignedStudentIds.size}/{filteredStudents.length}</Badge>
              </h3>

              {filteredStudents.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">해당 과목/선생님의 학생이 없습니다</CardContent></Card>
              ) : (
                <Card className="overflow-hidden">
                  <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                    {groupedStudents.map(([groupKey, groupStudents]) => {
                      const levelChar = groupKey[0];
                      const yearNum = groupKey.slice(1);
                      const levelLabel = levelChar === '초' ? '초등' : levelChar === '중' ? '중학' : levelChar === '고' ? '고등' : groupKey;
                      const groupLabel = yearNum && yearNum !== '0' ? `${levelLabel} ${yearNum}학년` : levelLabel;

                      return (
                        <div key={groupKey}>
                          <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-3 py-1.5 border-b border-border/50">
                            <span className="text-[11px] font-bold text-muted-foreground">{groupLabel} ({groupStudents.length})</span>
                          </div>
                          {groupStudents.map(s => {
                            const isActive = activeStudentId === s.id;
                            const isAssigned = assignedStudentIds.has(s.id);
                            return (
                              <div
                                key={s.id}
                                className={`flex items-center gap-2 px-3 py-2 border-b border-border/30 cursor-pointer transition-all text-sm select-none ${
                                  isActive
                                    ? 'bg-primary/15 ring-1 ring-inset ring-primary/40'
                                    : isAssigned
                                    ? 'bg-primary/5'
                                    : 'hover:bg-accent/40'
                                }`}
                                onClick={() => setActiveStudentId(isActive ? null : s.id)}
                              >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${isAssigned ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                                <span className={`font-medium ${isActive ? 'text-primary' : ''}`}>{s.name}</span>
                                {s.school && <span className="text-[10px] text-muted-foreground ml-auto">{s.school}</span>}
                                {isAssigned && !isActive && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-auto">배치됨</Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Quick actions for active student */}
              {activeStudentId && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-bold text-primary">
                      {studentMap[activeStudentId]?.name} 선택됨
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      왼쪽 시간표를 클릭하면 해당 시간에 배치됩니다.
                    </p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => assignStudentToAllSlots(activeStudentId)}>
                        <UserPlus className="w-3 h-3 mr-1" /> 전체 배치
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => removeStudentFromAllSlots(activeStudentId)}>
                        <UserMinus className="w-3 h-3 mr-1" /> 전체 해제
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════ LIST VIEW ═══════════════
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">미확인</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{confirmedCount}</p>
            <p className="text-xs text-muted-foreground">확인완료</p>
          </CardContent>
        </Card>
        <Card className="border-muted-foreground/30 bg-muted/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{autoCount}</p>
            <p className="text-xs text-muted-foreground">시스템 확정</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => { resetAndGoBack(); setMode('create'); }}>
          <Plus className="w-4 h-4 mr-1" /> 내신 특강 등록
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : courses.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">등록된 내신 특강이 없습니다</p>
      ) : (
        <div className="space-y-3">
          {courses.map(course => {
            const expanded = expandedCourseId === course.id;
            const cPending = course.enrollments.filter(e => e.status === 'pending').length;
            const cConfirmed = course.enrollments.filter(e => e.status === 'confirmed').length;
            const cAuto = course.enrollments.filter(e => e.status === 'auto_confirmed').length;

            return (
              <Card key={course.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedCourseId(expanded ? null : course.id)}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{course.subject}</Badge>
                    <span className="font-medium text-sm">{course.title || `${course.subject} 특강`}</span>
                    <span className="text-xs text-muted-foreground">{teacherMap[course.teacher_id] || '—'}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{course.sessions.length}회차</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{course.enrollments.length}명</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {cPending > 0 && <Badge variant="destructive" className="text-[10px] px-1.5">{cPending} 미확인</Badge>}
                      {cConfirmed > 0 && <Badge variant="default" className="text-[10px] px-1.5">{cConfirmed} 확인</Badge>}
                      {cAuto > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{cAuto} 자동</Badge>}
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {expanded && (
                  <CardContent className="pt-0 pb-4 border-t space-y-4">
                    {/* Sessions with time slots */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">일정 & 시간표</p>
                      <div className="space-y-2">
                        {course.sessions.map(sess => (
                          <div key={sess.id} className="border rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 px-3 py-2 bg-muted/30">
                              <Badge variant="outline" className="text-[10px] min-w-[50px] justify-center">{sess.session_label}</Badge>
                              <span className="font-mono text-xs">{sess.schedule_date}</span>
                            </div>
                            {sess.time_slots.length > 0 ? (
                              <div className="divide-y">
                                {sess.time_slots.map(slot => (
                                  <div key={slot.id} className="px-3 py-2 flex items-start gap-2">
                                    <span className="font-mono text-xs text-muted-foreground mt-0.5">
                                      {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {slot.students.map(ss => (
                                        <Badge key={ss.id} variant="secondary" className="text-[10px]">
                                          {studentMap[ss.student_id]?.name || '—'}
                                        </Badge>
                                      ))}
                                      {slot.students.length === 0 && (
                                        <span className="text-[10px] text-muted-foreground italic">배치된 학생 없음</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="px-3 py-1.5 text-xs text-muted-foreground">
                                {sess.start_time.slice(0, 5)}-{sess.end_time.slice(0, 5)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Enrollment Status */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">확약 현황 ({course.enrollments.length}명)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {course.enrollments.map(enr => (
                          <Badge key={enr.id} variant={STATUS_MAP[enr.status]?.variant || 'outline'} className="text-xs">
                            {studentMap[enr.student_id]?.name || '—'} · {STATUS_MAP[enr.status]?.label || enr.status}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[11px] text-muted-foreground">마지노선: {course.deadline_date}</p>
                      <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs" onClick={() => handleDeleteCourse(course.id)}>
                        <Trash2 className="w-3 h-3 mr-1" /> 삭제
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
