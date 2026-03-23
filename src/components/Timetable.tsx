import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Check, Search, Calendar, Clock, Users, User, ChevronLeft, ChevronRight, UserPlus, ArrowUpDown, Pencil, Loader2, Save, FolderOpen, Building2, AlertTriangle, List, LayoutGrid, Thermometer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ClassStudentManager } from '@/components/ClassStudentManager';
import { StudentGroupManager } from '@/components/timetable/StudentGroupManager';
import { GroupSlotAssignment } from '@/components/timetable/GroupSlotAssignment';
import { ClassroomCapacityDashboard } from '@/components/timetable/ClassroomCapacityDashboard';
import { TimetableMatrixView } from '@/components/timetable/TimetableMatrixView';

const DAYS_OF_WEEK = [
  { value: 1, label: '월', full: '월요일' },
  { value: 2, label: '화', full: '화요일' },
  { value: 3, label: '수', full: '수요일' },
  { value: 4, label: '목', full: '목요일' },
  { value: 5, label: '금', full: '금요일' },
  { value: 6, label: '토', full: '토요일' },
  { value: 0, label: '일', full: '일요일' },
];

const DAY_ACCENT: Record<number, string> = {
  1: 'border-l-amber-400',
  2: 'border-l-emerald-400',
  3: 'border-l-sky-400',
  4: 'border-l-violet-400',
  5: 'border-l-orange-400',
  6: 'border-l-slate-400',
  0: 'border-l-rose-400',
};

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  '영어': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '국어': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  '과학': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const STUDENT_PAGE_SIZE = 50;

interface Classroom {
  id: string;
  name: string;
  manager_name: string;
  capacity: number;
}

interface ScheduleRow {
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherName: string;
  students: { id: string; name: string }[];
  groupNames?: string[];
  classroomId?: string | null;
  classroomName?: string;
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

  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [examPrepRows, setExamPrepRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all');
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'time' | 'teacher_time'>('time');
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'congestion'>('list');
  const [matrixDay, setMatrixDay] = useState<number>(new Date().getDay());
  const [editClassId, setEditClassId] = useState<string | null>(null);
  const [editClassName, setEditClassName] = useState('');

  // Inline edit state
  const [editSlot, setEditSlot] = useState<{
    scheduleId: string;
    classId: string;
    className: string;
    subject: string;
    startTime: string;
    endTime: string;
    teacherId: string;
    dayOfWeek: number;
  } | null>(null);
  const [editForm, setEditForm] = useState({ className: '', startTime: '', endTime: '', teacherId: '', classroomId: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);

  // Student lookup
  const [students, setStudents] = useState<Student[]>([]);
  const [totalStudentCount, setTotalStudentCount] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [studentScheduleRows, setStudentScheduleRows] = useState<StudentScheduleRow[]>([]);
  const [studentScheduleLoading, setStudentScheduleLoading] = useState(false);

  useEffect(() => {
    fetchScheduleData();
    if (isAdminUser || isAssistantUser) {
      fetchAllTeachers();
      fetchClassrooms();
    }
  }, [user, isAdminUser]);

  useEffect(() => {
    if (canViewAllStudents) fetchStudents();
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
      let scheduleQuery = supabase
        .from('class_schedules')
        .select(`
          id, class_id, day_of_week, start_time, end_time, teacher_id, is_active, classroom_id,
          classes (id, name, subject, teacher_id)
        `)
        .eq('is_active', true);

      if (!isAdminUser && !isAssistantUser && user) {
        scheduleQuery = scheduleQuery.eq('teacher_id', user.id);
      }

      const { data: schedulesData, error: schedError } = await scheduleQuery;
      if (schedError) throw schedError;

      const teacherIds = new Set<string>();
      const classIds = new Set<string>();
      (schedulesData || []).forEach((s: any) => {
        if (s.teacher_id) teacherIds.add(s.teacher_id);
        if (s.classes?.teacher_id) teacherIds.add(s.classes.teacher_id);
        if (s.class_id) classIds.add(s.class_id);
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
            .in('id', studentIds)
            .neq('enrollment_status', '퇴원');

          const studentMap: Record<string, string> = {};
          (studentsData || []).forEach((s) => { studentMap[s.id] = s.name; });

          classStudents.forEach((cs) => {
            if (!studentMap[cs.student_id]) return;
            if (!studentsByClass[cs.class_id]) studentsByClass[cs.class_id] = [];
            studentsByClass[cs.class_id].push({
              id: cs.student_id,
              name: studentMap[cs.student_id],
            });
          });

          Object.keys(studentsByClass).forEach((classId) => {
            studentsByClass[classId].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      }

      // Fetch group assignments for schedules
      const scheduleIds = (schedulesData || []).map((s: any) => s.id);
      let groupsBySchedule: Record<string, string[]> = {};
      if (scheduleIds.length > 0) {
        const { data: sgaData } = await supabase
          .from('schedule_group_assignments')
          .select('schedule_id, group_id')
          .in('schedule_id', scheduleIds);
        if (sgaData && sgaData.length > 0) {
          const groupIds = [...new Set(sgaData.map((a: any) => a.group_id))];
          const { data: groupsData } = await supabase
            .from('student_groups')
            .select('id, name')
            .in('id', groupIds);
          const groupNameMap: Record<string, string> = {};
          (groupsData || []).forEach((g: any) => { groupNameMap[g.id] = g.name; });
          sgaData.forEach((a: any) => {
            if (!groupsBySchedule[a.schedule_id]) groupsBySchedule[a.schedule_id] = [];
            if (groupNameMap[a.group_id]) groupsBySchedule[a.schedule_id].push(groupNameMap[a.group_id]);
          });
        }
      }

      // Fetch classrooms for mapping
      const { data: classroomsData } = await supabase.from('classrooms').select('id, name').eq('is_active', true);
      const classroomNameMap: Record<string, string> = {};
      (classroomsData || []).forEach((cr: any) => { classroomNameMap[cr.id] = cr.name; });

      const rows: ScheduleRow[] = (schedulesData || []).map((s: any) => {
        const teacherId = s.teacher_id || s.classes?.teacher_id;
        return {
          scheduleId: s.id,
          classId: s.class_id,
          className: s.classes?.name || '',
          subject: s.classes?.subject || '',
          dayOfWeek: s.day_of_week,
          startTime: s.start_time,
          endTime: s.end_time,
          teacherId: teacherId || '',
          teacherName: teacherId ? teacherMap[teacherId] || '미배정' : '미배정',
          students: studentsByClass[s.class_id] || [],
          groupNames: groupsBySchedule[s.id] || [],
          classroomId: s.classroom_id || null,
          classroomName: s.classroom_id ? classroomNameMap[s.classroom_id] || '' : '',
        };
      });

      rows.sort((a, b) => {
        const dayOrder = [1, 2, 3, 4, 5, 6, 0];
        const ai = dayOrder.indexOf(a.dayOfWeek);
        const bi = dayOrder.indexOf(b.dayOfWeek);
        if (ai !== bi) return ai - bi;
        return a.startTime.localeCompare(b.startTime);
      });

      setScheduleRows(rows);

      if (isAdminUser || isAssistantUser) {
        const uniqueTeachers = new Map<string, string>();
        rows.forEach((r) => {
          if (r.teacherId) uniqueTeachers.set(r.teacherId, r.teacherName);
        });
        setTeachers(
          Array.from(uniqueTeachers.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }

      // ── Fetch confirmed exam prep slots for teacher timetable ──
      await fetchExamPrepForTimetable(teacherMap);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      toast({ title: '오류', description: '시간표를 불러오지 못했습니다', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function fetchExamPrepForTimetable(teacherMap: Record<string, string>) {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      // Fetch courses with confirmed/auto_confirmed enrollments that have future sessions
      let courseQuery = supabase.from('exam_prep_courses').select('id, subject, teacher_id, title, school_name');
      if (!isAdminUser && !isAssistantUser && user) {
        courseQuery = courseQuery.eq('teacher_id', user.id);
      }
      const { data: courses } = await courseQuery;
      if (!courses || courses.length === 0) { setExamPrepRows([]); return; }

      const courseIds = courses.map((c: any) => c.id);
      const { data: sessionsData } = await supabase.from('exam_prep_sessions')
        .select('id, course_id, session_label, schedule_date, start_time, end_time')
        .in('course_id', courseIds)
        .gte('schedule_date', todayStr)
        .order('schedule_date');
      if (!sessionsData || sessionsData.length === 0) { setExamPrepRows([]); return; }

      const sessionIds = sessionsData.map((s: any) => s.id);
      const [slotsRes, slotStudentsRes] = await Promise.all([
        supabase.from('exam_prep_time_slots').select('id, session_id, start_time, end_time').in('session_id', sessionIds).order('slot_order'),
        supabase.from('exam_prep_slot_students').select('slot_id, student_id'),
      ]);
      const slots = slotsRes.data || [];
      const slotStudents = slotStudentsRes.data || [];
      const slotIdSet = new Set(slots.map((s: any) => s.id));
      const relevantSlotStudents = slotStudents.filter((ss: any) => slotIdSet.has(ss.slot_id));

      // Get student names
      const allStudentIds = [...new Set(relevantSlotStudents.map((ss: any) => ss.student_id))];
      let studentNameMap: Record<string, string> = {};
      if (allStudentIds.length > 0) {
        const { data: studData } = await supabase.from('students').select('id, name').in('id', allStudentIds);
        (studData || []).forEach((s: any) => { studentNameMap[s.id] = s.name; });
      }

      // Build exam prep schedule rows grouped by date
      const examRows: ScheduleRow[] = [];
      for (const sess of sessionsData as any[]) {
        const course = courses.find((c: any) => c.id === sess.course_id);
        if (!course) continue;
        const sessionSlots = slots.filter((sl: any) => sl.session_id === sess.id);
        const d = new Date(sess.schedule_date + 'T00:00:00');
        const dow = d.getDay();

        for (const slot of sessionSlots as any[]) {
          const slotStuds = relevantSlotStudents.filter((ss: any) => ss.slot_id === slot.id);
          examRows.push({
            scheduleId: `exam-${slot.id}`,
            classId: `exam-${course.id}-${sess.id}`,
            className: `내신특강 ${course.school_name ? `(${course.school_name})` : ''} ${sess.session_label}`.trim(),
            subject: course.subject,
            dayOfWeek: dow,
            startTime: slot.start_time,
            endTime: slot.end_time,
            teacherId: course.teacher_id,
            teacherName: teacherMap[course.teacher_id] || '미배정',
            students: slotStuds.map((ss: any) => ({
              id: ss.student_id,
              name: studentNameMap[ss.student_id] || '—',
            })),
          });
        }
      }
      setExamPrepRows(examRows);
    } catch (e) {
      console.error('Error fetching exam prep for timetable:', e);
      setExamPrepRows([]);
    }
  }

  async function fetchAllTeachers() {
    try {
      const { data } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name');
      setAllTeachers((data || []).map(p => ({ id: p.id, name: p.full_name })));
    } catch (e) {
      console.error('Error fetching all teachers:', e);
    }
  }

  async function fetchClassrooms() {
    try {
      const { data } = await supabase.from('classrooms').select('id, name, manager_name, capacity').eq('is_active', true).order('sort_order');
      setClassrooms((data || []) as Classroom[]);
    } catch (e) {
      console.error('Error fetching classrooms:', e);
    }
  }

  async function handleEditSave() {
    if (!editSlot) return;
    setEditSaving(true);
    try {
      // Update class name if changed
      if (editForm.className !== editSlot.className) {
        const { error } = await supabase
          .from('classes')
          .update({ name: editForm.className })
          .eq('id', editSlot.classId);
        if (error) {
          console.error('[TIMETABLE_EDIT] classes update error:', error);
          throw error;
        }
      }

      // Update schedule time/classroom if changed
      const updates: Record<string, any> = {};
      if (editForm.startTime !== editSlot.startTime.slice(0, 5)) updates.start_time = editForm.startTime;
      if (editForm.endTime !== editSlot.endTime.slice(0, 5)) updates.end_time = editForm.endTime;
      if (editForm.classroomId !== (editSlot as any).classroomId) {
        updates.classroom_id = editForm.classroomId || null;
      }
      
      // Only process teacher change for admin/assistant
      if ((isAdminUser || isAssistantUser) && editForm.teacherId !== editSlot.teacherId) {
        updates.teacher_id = editForm.teacherId;
        const { error: classTeacherErr } = await supabase.from('classes').update({ teacher_id: editForm.teacherId }).eq('id', editSlot.classId);
        if (classTeacherErr) {
          console.error('[TIMETABLE_EDIT] class teacher update error:', classTeacherErr);
          throw classTeacherErr;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('class_schedules')
          .update(updates)
          .eq('id', editSlot.scheduleId);
        if (error) {
          console.error('[TIMETABLE_EDIT] class_schedules update error:', error);
          throw error;
        }
      }

      toast({ title: '수정 완료', description: '수업 정보가 저장되었습니다' });
      setEditSlot(null);
      fetchScheduleData();
    } catch (error: any) {
      console.error('[TIMETABLE_EDIT] Error saving edit:', error);
      toast({ title: '오류', description: error.message || '수정에 실패했습니다', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  }

  function openEditSlot(row: ScheduleRow) {
    setEditSlot({
      scheduleId: row.scheduleId,
      classId: row.classId,
      className: row.className,
      subject: row.subject,
      startTime: row.startTime,
      endTime: row.endTime,
      teacherId: row.teacherId,
      dayOfWeek: row.dayOfWeek,
      classroomId: row.classroomId || '',
    } as any);
    setEditForm({
      className: row.className,
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime.slice(0, 5),
      teacherId: row.teacherId,
      classroomId: row.classroomId || '',
    });
  }

  async function fetchStudents() {
    setStudentsLoading(true);
    try {
      const offset = (studentPage - 1) * STUDENT_PAGE_SIZE;
      let query = supabase.from('students').select('id, name', { count: 'exact' }).neq('enrollment_status', '퇴원');
      if (studentSearchQuery.trim()) {
        query = query.ilike('name', `%${studentSearchQuery.trim()}%`);
      }
      const { data, error, count } = await query
        .order('name', { ascending: true })
        .range(offset, offset + STUDENT_PAGE_SIZE - 1);
      if (error) throw error;
      setStudents(data || []);
      setTotalStudentCount(count || 0);
    } catch (error) {
      console.error('Error fetching students:', error);
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
        .select(`id, name, subject, teacher_id, class_schedules (id, day_of_week, start_time, end_time, is_active, teacher_id)`)
        .in('id', classIds);
      if (classError) throw classError;

      const teacherIds = new Set<string>();
      (classData || []).forEach((c: any) => {
        if (c.teacher_id) teacherIds.add(c.teacher_id);
        (c.class_schedules || []).forEach((s: any) => { if (s.teacher_id) teacherIds.add(s.teacher_id); });
      });

      let teacherMap: Record<string, string> = {};
      if (teacherIds.size > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(teacherIds));
        if (profiles) teacherMap = profiles.reduce((acc: Record<string, string>, p) => { acc[p.id] = p.full_name; return acc; }, {});
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

      const dayOrder = [1, 2, 3, 4, 5, 6, 0];
      rows.sort((a, b) => {
        const ai = dayOrder.indexOf(a.dayOfWeek);
        const bi = dayOrder.indexOf(b.dayOfWeek);
        if (ai !== bi) return ai - bi;
        return a.startTime.localeCompare(b.startTime);
      });

      setStudentScheduleRows(rows);
    } catch (error) {
      console.error('Error fetching student schedule:', error);
      toast({ title: '오류', description: '학생 시간표를 불러오지 못했습니다', variant: 'destructive' });
    } finally {
      setStudentScheduleLoading(false);
    }
  }

  const fmt = (time: string) => time.slice(0, 5);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast({ title: '복사됨' });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: '복사 실패', variant: 'destructive' });
    }
  };

  const today = new Date().getDay();

  // ── Derived data ──

  // Combine regular + exam prep rows
  const allRows = useMemo(() => [...scheduleRows, ...examPrepRows], [scheduleRows, examPrepRows]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (selectedTeacherId !== 'all') rows = rows.filter((r) => r.teacherId === selectedTeacherId);
    if (selectedDayFilter !== 'all') rows = rows.filter((r) => r.dayOfWeek === parseInt(selectedDayFilter));
    return rows;
  }, [allRows, selectedTeacherId, selectedDayFilter]);

  const byDay = useMemo(() => {
    const map: Record<number, ScheduleRow[]> = {};
    filteredRows.forEach((r) => {
      if (!map[r.dayOfWeek]) map[r.dayOfWeek] = [];
      map[r.dayOfWeek].push(r);
    });
    Object.values(map).forEach(rows => {
      rows.sort((a, b) => {
        if (sortMode === 'teacher_time') {
          const tc = a.teacherName.localeCompare(b.teacherName);
          if (tc !== 0) return tc;
        }
        return a.startTime.localeCompare(b.startTime);
      });
    });
    return map;
  }, [filteredRows, sortMode]);

  const byTeacher = useMemo(() => {
    const map: Record<string, { name: string; rows: ScheduleRow[] }> = {};
    allRows.forEach((r) => {
      const key = r.teacherId || 'unassigned';
      if (!map[key]) map[key] = { name: r.teacherName, rows: [] };
      map[key].rows.push(r);
    });
    return map;
  }, [allRows]);

  const studentByDay = useMemo(() => {
    const map: Record<number, StudentScheduleRow[]> = {};
    studentScheduleRows.forEach((r) => {
      if (!map[r.dayOfWeek]) map[r.dayOfWeek] = [];
      map[r.dayOfWeek].push(r);
    });
    return map;
  }, [studentScheduleRows]);

  // ── Capacity slots data for dashboard ──
  const capacitySlots = useMemo(() => {
    return allRows.map(r => ({
      scheduleId: r.scheduleId,
      classroomId: r.classroomId || null,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      studentCount: r.students.length,
    }));
  }, [allRows]);

  // Check if a slot is over capacity
  const getSlotCapacityStatus = useCallback((row: ScheduleRow): { isOver: boolean; current: number; max: number } | null => {
    if (!row.classroomId) return null;
    const room = classrooms.find(c => c.id === row.classroomId);
    if (!room) return null;
    // Sum all students in same classroom + same day + overlapping time
    const sameRoomSlots = allRows.filter(r =>
      r.classroomId === row.classroomId &&
      r.dayOfWeek === row.dayOfWeek &&
      r.startTime < row.endTime && row.startTime < r.endTime
    );
    const totalStudents = sameRoomSlots.reduce((sum, r) => sum + r.students.length, 0);
    return { isOver: totalStudents > room.capacity, current: totalStudents, max: room.capacity };
  }, [classrooms, allRows]);

  // ── Render helpers ──
  const isExamPrepRow = (row: ScheduleRow) => row.scheduleId.startsWith('exam-');

  const SlotCard = ({ row, showTeacher = false, editable = false }: { row: ScheduleRow; showTeacher?: boolean; editable?: boolean }) => {
    const isExamPrep = isExamPrepRow(row);
    const capStatus = getSlotCapacityStatus(row);
    return (
    <div
      className={cn(
        'border-l-4 rounded-lg bg-card p-3 shadow-sm hover:shadow-md transition-shadow',
        isExamPrep ? 'border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20' : 
        capStatus?.isOver ? 'border-l-destructive bg-destructive/5' : DAY_ACCENT[row.dayOfWeek],
        editable && !isExamPrep && 'cursor-pointer ring-transparent hover:ring-1 hover:ring-primary/30'
      )}
      onClick={editable && !isExamPrep ? () => { setEditClassId(row.classId); setEditClassName(row.className); } : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isExamPrep && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">내신특강</span>
          )}
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', SUBJECT_COLORS[row.subject] || 'bg-muted text-muted-foreground')}>
            {row.subject}
          </span>
          <span className="text-sm font-medium">{row.className}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Clock className="w-3 h-3" />
            {fmt(row.startTime)}–{fmt(row.endTime)}
          </div>
          {editable && !isExamPrep && (
            <button
              onClick={(e) => { e.stopPropagation(); openEditSlot(row); }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="수업 정보 수정"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Classroom & teacher info */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        {showTeacher && (
          <span className="text-xs text-muted-foreground">
            <User className="w-3 h-3 inline mr-0.5" />
            {row.teacherName}
          </span>
        )}
        {row.classroomName && (
          <span className="text-xs text-muted-foreground">
            <Building2 className="w-3 h-3 inline mr-0.5" />
            {row.classroomName}
          </span>
        )}
        {capStatus && (
          <span className={cn('text-[10px] font-semibold', capStatus.isOver ? 'text-destructive' : 'text-muted-foreground')}>
            {capStatus.current}/{capStatus.max}명
            {capStatus.isOver && (
              <AlertTriangle className="w-3 h-3 inline ml-0.5 text-destructive" />
            )}
          </span>
        )}
      </div>
      {row.groupNames && row.groupNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {row.groupNames.map((gn, i) => (
            <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              <FolderOpen className="w-2.5 h-2.5 mr-0.5" />
              {gn}
            </Badge>
          ))}
        </div>
      )}
      {row.students.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <Users className="w-3 h-3 text-muted-foreground shrink-0" />
          {row.students.map((s) => (
            <span key={s.id} className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {s.name}
            </span>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(row.students.map((s) => s.name).join(', '), row.classId + row.dayOfWeek); }}
            className="ml-1 text-muted-foreground hover:text-foreground"
          >
            {copiedId === row.classId + row.dayOfWeek ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
          {editable && (
            <span className="ml-auto">
              <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
          )}
        </div>
      )}
      {row.students.length === 0 && editable && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserPlus className="w-3.5 h-3.5" />
          학생 배정하기
        </div>
      )}
    </div>
    );
  };

  const StudentSlotCard = ({ row }: { row: StudentScheduleRow }) => (
    <div className={cn(
      'border-l-4 rounded-lg bg-card p-3 shadow-sm',
      DAY_ACCENT[row.dayOfWeek]
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', SUBJECT_COLORS[row.subject] || 'bg-muted text-muted-foreground')}>
            {row.subject}
          </span>
          <span className="text-sm font-medium">{row.className}</span>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {fmt(row.startTime)}–{fmt(row.endTime)}
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        <User className="w-3 h-3 inline mr-1" />
        {row.teacherName}
      </div>
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

  // ── Teacher-only view ──
  if (!isAdminUser && !isAssistantUser) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5" />
            내 시간표
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">등록된 시간표가 없습니다</p>
          ) : (
            <div className="space-y-6">
              {DAYS_OF_WEEK.map(({ value, full }) => {
                const dayRows = byDay[value];
                if (!dayRows?.length) return null;
                const isToday = value === today;
                return (
                  <div key={value}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                        {full}
                      </h3>
                      {isToday && <Badge className="text-[10px] h-5">오늘</Badge>}
                    </div>
                    <div className="space-y-2">
                      {dayRows.map((row, idx) => (
                        <SlotCard key={`${row.classId}-${idx}`} row={row} editable />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>

        {/* Student management dialog for teachers */}
        <Dialog open={!!editClassId} onOpenChange={(open) => { if (!open) setEditClassId(null); }}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                학생 배정 – {editClassName}
              </DialogTitle>
            </DialogHeader>
            {editClassId && (
              <ClassStudentManager
                classId={editClassId}
                onStudentCountChange={() => fetchScheduleData()}
              />
            )}
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  // ── Admin / Assistant view ──
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="w-5 h-5" />
          시간표 관리
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* View Mode Selector */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit mb-4">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="w-3.5 h-3.5" /> 리스트 뷰
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'timeline' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> 타임라인 뷰
          </button>
          <button
            onClick={() => setViewMode('congestion')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'congestion' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Thermometer className="w-3.5 h-3.5" /> 혼잡도 뷰
          </button>
        </div>

        {viewMode === 'timeline' || viewMode === 'congestion' ? (
          <TimetableMatrixView
            scheduleRows={allRows}
            classrooms={classrooms}
            selectedDay={matrixDay}
            onDayChange={setMatrixDay}
            mode={viewMode}
            onDataChange={fetchScheduleData}
          />
        ) : (
        <Tabs defaultValue="day" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="day" className="text-xs sm:text-sm">
              <Calendar className="w-4 h-4 mr-1 hidden sm:inline" />
              요일별
            </TabsTrigger>
            <TabsTrigger value="teacher" className="text-xs sm:text-sm">
              <User className="w-4 h-4 mr-1 hidden sm:inline" />
              선생님별
            </TabsTrigger>
            <TabsTrigger value="student" className="text-xs sm:text-sm">
              <Users className="w-4 h-4 mr-1 hidden sm:inline" />
              학생별
            </TabsTrigger>
            <TabsTrigger value="group" className="text-xs sm:text-sm">
              <FolderOpen className="w-4 h-4 mr-1 hidden sm:inline" />
              그룹(반)
            </TabsTrigger>
          </TabsList>

          {/* ── 요일별 뷰 ── */}
          <TabsContent value="day" className="space-y-4">
            {/* Capacity Dashboard */}
            {classrooms.length > 0 && (
              <ClassroomCapacityDashboard
                classrooms={classrooms}
                slots={capacitySlots}
                selectedDay={selectedDayFilter !== 'all' ? parseInt(selectedDayFilter) : today}
              />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="선생님 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 선생님</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(selectedTeacherId !== 'all' || selectedDayFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => { setSelectedTeacherId('all'); setSelectedDayFilter('all'); }}
                >
                  필터 초기화
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs ml-auto"
                onClick={() => setSortMode(prev => prev === 'time' ? 'teacher_time' : 'time')}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortMode === 'time' ? '시간순' : '선생님→시간순'}
              </Button>
            </div>
            
            {/* Quick day filter chips */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedDayFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  selectedDayFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                전체
              </button>
              {DAYS_OF_WEEK.map((d) => {
                const count = scheduleRows.filter(r => r.dayOfWeek === d.value && (selectedTeacherId === 'all' || r.teacherId === selectedTeacherId)).length;
                if (count === 0) return null;
                return (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDayFilter(d.value.toString())}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                      selectedDayFilter === d.value.toString()
                        ? 'bg-primary text-primary-foreground'
                        : d.value === today
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {d.label} <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            {(selectedTeacherId !== 'all' || selectedDayFilter !== 'all') && filteredRows.length > 0 && (
              <div className="text-xs text-muted-foreground">
                검색 결과: {filteredRows.length}개 수업
              </div>
            )}

            {filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {selectedTeacherId !== 'all' || selectedDayFilter !== 'all' 
                  ? '해당 조건의 수업이 없습니다' 
                  : '시간표가 없습니다'}
              </p>
            ) : (
              <div className="space-y-6">
                {DAYS_OF_WEEK.map(({ value, full }) => {
                  const dayRows = byDay[value];
                  if (!dayRows?.length) return null;
                  const isToday = value === today;
                  return (
                    <div key={value}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                          isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}>
                          {DAYS_OF_WEEK.find(d => d.value === value)?.label}
                        </div>
                        <h3 className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                          {full}
                        </h3>
                        {isToday && <Badge className="text-[10px] h-5">오늘</Badge>}
                        <Badge variant="outline" className="text-[10px] ml-auto">{dayRows.length}개 수업</Badge>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {dayRows.map((row, idx) => (
                          <SlotCard key={`${row.classId}-${idx}`} row={row} showTeacher={selectedTeacherId === 'all'} editable />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── 선생님별 뷰 ── */}
          <TabsContent value="teacher" className="space-y-6">
            {Object.entries(byTeacher)
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([teacherId, { name, rows }]) => {
                // Group this teacher's rows by day
                const teacherByDay: Record<number, ScheduleRow[]> = {};
                rows.forEach((r) => {
                  if (!teacherByDay[r.dayOfWeek]) teacherByDay[r.dayOfWeek] = [];
                  teacherByDay[r.dayOfWeek].push(r);
                });

                const totalStudents = new Set(rows.flatMap(r => r.students.map(s => s.id))).size;

                const copyText = rows.map(r => {
                  const dayLabel = DAYS_OF_WEEK.find(d => d.value === r.dayOfWeek)?.label || '';
                  return `${dayLabel} ${fmt(r.startTime)}-${fmt(r.endTime)} ${r.subject}(${r.className}) ${r.students.map(s => s.name).join(',')}`;
                }).join('\n');

                return (
                  <div key={teacherId} className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                          {name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">{name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {rows.length}개 수업 · {totalStudents}명 학생
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleCopy(`[${name} 시간표]\n${copyText}`, `teacher-${teacherId}`)}
                      >
                        {copiedId === `teacher-${teacherId}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                    <div className="p-3 space-y-4">
                      {DAYS_OF_WEEK.map(({ value, label }) => {
                        const dayRows = teacherByDay[value];
                        if (!dayRows?.length) return null;
                        return (
                          <div key={value}>
                            <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                              <span className={cn(
                                'inline-flex w-5 h-5 rounded items-center justify-center text-[10px] font-bold',
                                value === today ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              )}>
                                {label}
                              </span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {dayRows.map((row, idx) => (
                                <SlotCard key={`${row.classId}-${idx}`} row={row} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </TabsContent>

          {/* ── 학생별 뷰 ── */}
          <TabsContent value="student" className="space-y-4">
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
                      setStudentPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
                <Select value={selectedStudentId} onValueChange={(id) => {
                  setSelectedStudentId(id);
                  setSelectedStudentName(students.find(s => s.id === id)?.name || '');
                }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={studentsLoading ? '로딩중...' : '학생 선택'} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {totalStudentCount > STUDENT_PAGE_SIZE && (
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  {studentPage}/{Math.ceil(totalStudentCount / STUDENT_PAGE_SIZE)} · 총 {totalStudentCount}명
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setStudentPage(p => Math.max(1, p - 1))} disabled={studentPage <= 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setStudentPage(p => Math.min(Math.ceil(totalStudentCount / STUDENT_PAGE_SIZE), p + 1))} disabled={studentPage >= Math.ceil(totalStudentCount / STUDENT_PAGE_SIZE)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {selectedStudentId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {selectedStudentName} 시간표
                  </h4>
                  {studentScheduleRows.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        const text = [`[${selectedStudentName} 시간표]`, ...studentScheduleRows.map(r => {
                          const d = DAYS_OF_WEEK.find(d => d.value === r.dayOfWeek)?.label || '';
                          return `${d} ${fmt(r.startTime)}-${fmt(r.endTime)} ${r.subject}(${r.teacherName})`;
                        })].join('\n');
                        handleCopy(text, 'student-copy');
                      }}
                    >
                      {copiedId === 'student-copy' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      복사
                    </Button>
                  )}
                </div>

                {studentScheduleLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : studentScheduleRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">배정된 수업이 없습니다</p>
                ) : (
                  <div className="space-y-4">
                    {DAYS_OF_WEEK.map(({ value, full }) => {
                      const dayRows = studentByDay[value];
                      if (!dayRows?.length) return null;
                      const isToday = value === today;
                      return (
                        <div key={value}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={cn(
                              'inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold',
                              isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            )}>
                              {DAYS_OF_WEEK.find(d => d.value === value)?.label}
                            </span>
                            <span className={cn('text-sm font-medium', isToday && 'text-primary')}>{full}</span>
                            {isToday && <Badge className="text-[10px] h-5">오늘</Badge>}
                          </div>
                          <div className="space-y-2">
                            {dayRows.map((row, idx) => (
                              <StudentSlotCard key={idx} row={row} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          {/* ── 그룹(반) 뷰 ── */}
          <TabsContent value="group" className="space-y-6">
            <StudentGroupManager />
            <div className="border-t pt-4">
              <GroupSlotAssignment onDataChange={() => fetchScheduleData()} />
            </div>
          </TabsContent>
        </Tabs>
        )}
      </CardContent>

      {/* Student management dialog */}
      <Dialog open={!!editClassId} onOpenChange={(open) => { if (!open) { setEditClassId(null); fetchScheduleData(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {editClassName} — 학생 배정
            </DialogTitle>
          </DialogHeader>
          {editClassId && <ClassStudentManager classId={editClassId} />}
        </DialogContent>
      </Dialog>

      {/* Edit slot dialog */}
      <Dialog open={!!editSlot} onOpenChange={(open) => { if (!open) setEditSlot(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              수업 정보 수정
            </DialogTitle>
          </DialogHeader>
          {editSlot && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">
                  {DAYS_OF_WEEK.find(d => d.value === editSlot.dayOfWeek)?.full}
                </Badge>
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', SUBJECT_COLORS[editSlot.subject] || 'bg-muted text-muted-foreground')}>
                  {editSlot.subject}
                </span>
              </div>

              <div className="space-y-2">
                <Label>수업명</Label>
                <Input
                  value={editForm.className}
                  onChange={(e) => setEditForm(f => ({ ...f, className: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>시작 시간</Label>
                  <Input
                    type="time"
                    value={editForm.startTime}
                    onChange={(e) => setEditForm(f => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>종료 시간</Label>
                  <Input
                    type="time"
                    value={editForm.endTime}
                    onChange={(e) => setEditForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>

              {(isAdminUser || isAssistantUser) && (
                <>
                  <div className="space-y-2">
                    <Label>담당 선생님</Label>
                    <Select value={editForm.teacherId} onValueChange={(v) => setEditForm(f => ({ ...f, teacherId: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="선생님 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {allTeachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>강의실</Label>
                    <Select value={editForm.classroomId || 'none'} onValueChange={(v) => setEditForm(f => ({ ...f, classroomId: v === 'none' ? '' : v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="강의실 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">미지정</SelectItem>
                        {classrooms.map(cr => (
                          <SelectItem key={cr.id} value={cr.id}>
                            {cr.name} ({cr.manager_name}, 정원 {cr.capacity}명)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditSlot(null)}>취소</Button>
                <Button onClick={handleEditSave} disabled={editSaving || !editForm.className.trim()}>
                  {editSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
