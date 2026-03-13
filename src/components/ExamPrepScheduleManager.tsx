import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, AlertTriangle, CalendarCheck, Clock, Users, X, ChevronDown, ChevronUp } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
}

interface Teacher {
  id: string;
  full_name: string;
}

interface ClassInfo {
  class_id: string;
  student_id: string;
  subject: string;
  teacher_id: string | null;
}

interface SessionEntry {
  label: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ExamPrepCourse {
  id: string;
  subject: string;
  teacher_id: string;
  title: string | null;
  description: string | null;
  deadline_date: string;
  created_at: string;
  sessions: ExamPrepSession[];
  enrollments: ExamPrepEnrollment[];
}

interface ExamPrepSession {
  id: string;
  course_id: string;
  session_number: number;
  session_label: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
}

interface ExamPrepEnrollment {
  id: string;
  course_id: string;
  student_id: string;
  status: string;
  confirmed_at: string | null;
}

// Existing class_schedules for conflict detection
interface ExistingSchedule {
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_name: string;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];
const DEFAULT_SESSIONS: SessionEntry[] = [
  { label: '1회차', date: '', startTime: '', endTime: '' },
  { label: '2회차', date: '', startTime: '', endTime: '' },
  { label: '3회차', date: '', startTime: '', endTime: '' },
  { label: '4회차', date: '', startTime: '', endTime: '' },
  { label: '직전특강', date: '', startTime: '', endTime: '' },
];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '미확인', variant: 'destructive' },
  confirmed: { label: '확인완료', variant: 'default' },
  auto_confirmed: { label: '시스템 확정', variant: 'secondary' },
};

const SCHOOL_LEVEL_ORDER: Record<string, number> = { '초': 1, '중': 2, '고': 3 };

export function ExamPrepScheduleManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courses, setCourses] = useState<ExamPrepCourse[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classInfos, setClassInfos] = useState<ClassInfo[]>([]);
  const [existingSchedules, setExistingSchedules] = useState<ExistingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formSubject, setFormSubject] = useState('수학');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [sessions, setSessions] = useState<SessionEntry[]>(DEFAULT_SESSIONS.map(s => ({ ...s })));
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  const studentMap = useMemo(() => students.reduce<Record<string, Student>>((acc, s) => { acc[s.id] = s; return acc; }, {}), [students]);
  const teacherMap = useMemo(() => teachers.reduce<Record<string, string>>((acc, t) => { acc[t.id] = t.full_name; return acc; }, {}), [teachers]);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [studRes, teachRes, classStudRes, schedRes] = await Promise.all([
      supabase.from('students').select('id, name, grade, school, school_level, grade_year').neq('enrollment_status', '퇴원').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('class_students').select('class_id, student_id, classes(subject, teacher_id)'),
      supabase.from('class_schedules').select('class_id, day_of_week, start_time, end_time, is_active, classes(name, subject, teacher_id), class_students(student_id)').eq('is_active', true),
    ]);

    setStudents(studRes.data || []);
    setTeachers(teachRes.data || []);
    
    // Build class info mapping
    const infos: ClassInfo[] = (classStudRes.data || []).map((cs: any) => ({
      class_id: cs.class_id,
      student_id: cs.student_id,
      subject: cs.classes?.subject || '',
      teacher_id: cs.classes?.teacher_id || null,
    }));
    setClassInfos(infos);

    // Build existing schedules for conflict detection
    const existingSch: ExistingSchedule[] = [];
    for (const s of (schedRes.data || []) as any[]) {
      const studentIds = (s.class_students || []).map((cs: any) => cs.student_id);
      for (const sid of studentIds) {
        existingSch.push({
          student_id: sid,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          class_name: s.classes?.name || '수업',
        });
      }
    }
    setExistingSchedules(existingSch);

    // Fetch courses with sessions and enrollments
    await fetchCourses();
    setLoading(false);
  }

  async function fetchCourses() {
    const { data: coursesData } = await supabase
      .from('exam_prep_courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (!coursesData) { setCourses([]); return; }

    const courseIds = coursesData.map((c: any) => c.id);
    if (courseIds.length === 0) { setCourses([]); return; }

    const [sessRes, enrRes] = await Promise.all([
      supabase.from('exam_prep_sessions').select('*').in('course_id', courseIds).order('session_number'),
      supabase.from('exam_prep_enrollments').select('*').in('course_id', courseIds),
    ]);

    const sessionsByCourse: Record<string, ExamPrepSession[]> = {};
    for (const s of (sessRes.data || []) as any[]) {
      if (!sessionsByCourse[s.course_id]) sessionsByCourse[s.course_id] = [];
      sessionsByCourse[s.course_id].push(s);
    }

    const enrollByCourse: Record<string, ExamPrepEnrollment[]> = {};
    for (const e of (enrRes.data || []) as any[]) {
      if (!enrollByCourse[e.course_id]) enrollByCourse[e.course_id] = [];
      enrollByCourse[e.course_id].push(e);
    }

    setCourses(coursesData.map((c: any) => ({
      ...c,
      sessions: sessionsByCourse[c.id] || [],
      enrollments: enrollByCourse[c.id] || [],
    })));
  }

  // Filter students by selected subject + teacher
  const filteredStudents = useMemo(() => {
    if (!formSubject || !formTeacherId) return [];
    const studentIds = new Set(
      classInfos
        .filter(ci => ci.subject === formSubject && ci.teacher_id === formTeacherId)
        .map(ci => ci.student_id)
    );
    return students.filter(s => studentIds.has(s.id));
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
    // Sort keys
    const sorted = Object.entries(groups).sort(([a], [b]) => {
      const aLevel = SCHOOL_LEVEL_ORDER[a[0]] || 99;
      const bLevel = SCHOOL_LEVEL_ORDER[b[0]] || 99;
      if (aLevel !== bLevel) return aLevel - bLevel;
      const aYear = parseInt(a.slice(1)) || 0;
      const bYear = parseInt(b.slice(1)) || 0;
      return aYear - bYear;
    });
    return sorted;
  }, [filteredStudents]);

  // Detect conflicts for selected students across sessions
  const conflicts = useMemo(() => {
    const result: Array<{ studentId: string; sessionLabel: string; conflictWith: string }> = [];
    for (const sid of selectedStudents) {
      for (const sess of sessions) {
        if (!sess.date || !sess.startTime || !sess.endTime) continue;
        const d = new Date(sess.date + 'T00:00:00');
        const dow = d.getDay();
        const studentScheds = existingSchedules.filter(es => es.student_id === sid && es.day_of_week === dow);
        for (const es of studentScheds) {
          if (sess.startTime < es.end_time && sess.endTime > es.start_time) {
            const studentName = studentMap[sid]?.name || sid;
            result.push({
              studentId: sid,
              sessionLabel: sess.label,
              conflictWith: `${es.class_name} ${es.start_time.slice(0, 5)}-${es.end_time.slice(0, 5)}`,
            });
          }
        }
        // Also check against other exam_prep_courses sessions for enrolled students
        for (const course of courses) {
          const enrolled = course.enrollments.some(e => e.student_id === sid);
          if (!enrolled) continue;
          for (const cs of course.sessions) {
            if (cs.schedule_date === sess.date && sess.startTime < cs.end_time && sess.endTime > cs.start_time) {
              result.push({
                studentId: sid,
                sessionLabel: sess.label,
                conflictWith: `${course.title || course.subject + ' 특강'} ${cs.session_label} ${cs.start_time.slice(0, 5)}-${cs.end_time.slice(0, 5)}`,
              });
            }
          }
        }
      }
    }
    return result;
  }, [selectedStudents, sessions, existingSchedules, courses, studentMap]);

  // Conflict map: studentId -> set of session labels with conflicts
  const conflictsByStudent = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of conflicts) {
      if (!map[c.studentId]) map[c.studentId] = [];
      map[c.studentId].push(`${c.sessionLabel}: ${c.conflictWith}`);
    }
    return map;
  }, [conflicts]);

  function updateSession(index: number, field: keyof SessionEntry, value: string) {
    setSessions(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function addSession() {
    setSessions(prev => [...prev, { label: `${prev.length + 1}회차`, date: '', startTime: '', endTime: '' }]);
  }

  function removeSession(index: number) {
    setSessions(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const filledSessions = sessions.filter(s => s.date && s.startTime && s.endTime);
    if (!formDeadline || !formTeacherId || selectedStudents.length === 0 || filledSessions.length === 0) {
      toast({ title: '필수 항목을 모두 입력해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // 1. Create course
    const { data: course, error: courseErr } = await supabase
      .from('exam_prep_courses')
      .insert({
        subject: formSubject,
        teacher_id: formTeacherId,
        title: formTitle || `${formSubject} 내신 특강`,
        description: formDescription || null,
        deadline_date: formDeadline,
        created_by: user?.id || null,
      })
      .select('id')
      .single();

    if (courseErr || !course) {
      toast({ title: '저장 실패', description: courseErr?.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Create sessions
    const sessionRows = filledSessions.map((s, i) => ({
      course_id: course.id,
      session_number: i + 1,
      session_label: s.label,
      schedule_date: s.date,
      start_time: s.startTime,
      end_time: s.endTime,
    }));

    const { error: sessErr } = await supabase.from('exam_prep_sessions').insert(sessionRows);
    if (sessErr) {
      toast({ title: '세션 저장 실패', description: sessErr.message, variant: 'destructive' });
      // Cleanup course
      await supabase.from('exam_prep_courses').delete().eq('id', course.id);
      setSaving(false);
      return;
    }

    // 3. Create enrollments
    const enrollRows = selectedStudents.map(sid => ({
      course_id: course.id,
      student_id: sid,
    }));

    const { error: enrErr } = await supabase.from('exam_prep_enrollments').insert(enrollRows);
    if (enrErr) {
      toast({ title: '학생 등록 실패', description: enrErr.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    toast({ title: `${selectedStudents.length}명의 특강이 등록되었습니다 (${filledSessions.length}회차)` });
    setDialogOpen(false);
    resetForm();
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

  function resetForm() {
    setSelectedStudents([]);
    setFormSubject('수학');
    setFormTeacherId('');
    setFormTitle('');
    setFormDescription('');
    setFormDeadline('');
    setSessions(DEFAULT_SESSIONS.map(s => ({ ...s })));
  }

  function toggleStudent(sid: string) {
    setSelectedStudents(prev =>
      prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]
    );
  }

  function selectAllFiltered() {
    const allIds = filteredStudents.map(s => s.id);
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      allIds.forEach(id => newSet.add(id));
      return [...newSet];
    });
  }

  function deselectAllFiltered() {
    const filterIds = new Set(filteredStudents.map(s => s.id));
    setSelectedStudents(prev => prev.filter(id => !filterIds.has(id)));
  }

  // Stats
  const allEnrollments = courses.flatMap(c => c.enrollments);
  const pendingCount = allEnrollments.filter(e => e.status === 'pending').length;
  const confirmedCount = allEnrollments.filter(e => e.status === 'confirmed').length;
  const autoCount = allEnrollments.filter(e => e.status === 'auto_confirmed').length;

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

      {/* Add Button */}
      <div className="flex justify-end">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> 내신 특강 등록
        </Button>
      </div>

      {/* Course List */}
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
                    <span className="text-xs text-muted-foreground">|</span>
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
                    {/* Sessions */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">일정</p>
                      <div className="grid gap-1.5">
                        {course.sessions.map(sess => (
                          <div key={sess.id} className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 rounded text-sm">
                            <Badge variant="outline" className="text-[10px] min-w-[50px] justify-center">{sess.session_label}</Badge>
                            <span className="font-mono text-xs">{sess.schedule_date}</span>
                            <span className="font-mono text-xs">{sess.start_time.slice(0, 5)}-{sess.end_time.slice(0, 5)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Enrollments */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">학생 ({course.enrollments.length}명)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {course.enrollments.map(enr => {
                          const s = studentMap[enr.student_id];
                          return (
                            <Badge
                              key={enr.id}
                              variant={STATUS_MAP[enr.status]?.variant || 'outline'}
                              className="text-xs"
                            >
                              {s?.name || '—'} · {STATUS_MAP[enr.status]?.label || enr.status}
                            </Badge>
                          );
                        })}
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5" /> 내신 특강 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Subject + Teacher */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">과목</Label>
                <Select value={formSubject} onValueChange={v => { setFormSubject(v); setSelectedStudents([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">담당 선생님</Label>
                <Select value={formTeacherId} onValueChange={v => { setFormTeacherId(v); setSelectedStudents([]); }}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs">특강 제목 (선택)</Label>
              <Input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder={`${formSubject} 내신 특강`}
              />
            </div>

            {/* Sessions - multi-row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 회차별 일정
                </Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={addSession}>
                  <Plus className="w-3 h-3 mr-1" /> 회차 추가
                </Button>
              </div>
              <div className="space-y-2">
                {sessions.map((sess, i) => (
                  <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                    <Input
                      value={sess.label}
                      onChange={e => updateSession(i, 'label', e.target.value)}
                      className="w-[80px] h-7 text-xs font-medium"
                    />
                    <Input type="date" value={sess.date} onChange={e => updateSession(i, 'date', e.target.value)} className="h-7 text-xs flex-1" />
                    <Input type="time" value={sess.startTime} onChange={e => updateSession(i, 'startTime', e.target.value)} className="h-7 text-xs w-[100px]" />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input type="time" value={sess.endTime} onChange={e => updateSession(i, 'endTime', e.target.value)} className="h-7 text-xs w-[100px]" />
                    {sessions.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeSession(i)}>
                        <X className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 확인 마지노선 날짜
              </Label>
              <Input type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">이 날짜가 지나면 미확인 학생의 일정이 자동 확정됩니다.</p>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">설명 (선택)</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="특강 내용, 준비물 등"
                rows={2}
              />
            </div>

            {/* Student Picker - auto filtered */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> 학생 배치 ({selectedStudents.length}명 선택)
                </Label>
                {filteredStudents.length > 0 && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectAllFiltered}>전체 선택</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={deselectAllFiltered}>전체 해제</Button>
                  </div>
                )}
              </div>

              {!formTeacherId ? (
                <p className="text-xs text-muted-foreground py-4 text-center bg-muted/30 rounded-lg">
                  과목과 선생님을 먼저 선택하면 해당 수업의 학생 목록이 자동으로 표시됩니다.
                </p>
              ) : filteredStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center bg-muted/30 rounded-lg">
                  해당 과목/선생님 수업에 등록된 학생이 없습니다.
                </p>
              ) : (
                <div className="border rounded-lg max-h-[280px] overflow-y-auto">
                  {groupedStudents.map(([groupKey, groupStudents]) => {
                    const levelChar = groupKey[0];
                    const yearNum = groupKey.slice(1);
                    const levelLabel = levelChar === '초' ? '초등' : levelChar === '중' ? '중학' : levelChar === '고' ? '고등' : groupKey;
                    const groupLabel = yearNum && yearNum !== '0' ? `${levelLabel} ${yearNum}학년` : levelLabel;

                    return (
                      <div key={groupKey}>
                        <div className="sticky top-0 bg-muted/70 backdrop-blur-sm px-3 py-1.5 border-b">
                          <span className="text-[11px] font-semibold text-muted-foreground">{groupLabel} ({groupStudents.length}명)</span>
                        </div>
                        {groupStudents.map(s => {
                          const hasConflict = !!conflictsByStudent[s.id];
                          const isSelected = selectedStudents.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b last:border-0 transition-colors ${
                                isSelected
                                  ? hasConflict
                                    ? 'bg-destructive/10'
                                    : 'bg-primary/5'
                                  : 'hover:bg-accent/50'
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleStudent(s.id)}
                              />
                              <span className={hasConflict && isSelected ? 'text-destructive font-medium' : ''}>{s.name}</span>
                              {s.school && <span className="text-[10px] text-muted-foreground">{s.school}</span>}
                              {hasConflict && isSelected && (
                                <div className="ml-auto flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-destructive" />
                                  <span className="text-[10px] text-destructive">충돌</span>
                                </div>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Conflict Details */}
            {conflicts.length > 0 && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-1.5">
                  <AlertTriangle className="w-4 h-4" /> 시간 충돌 감지 ({conflicts.length}건)
                </div>
                <ul className="text-xs text-destructive/80 space-y-0.5 pl-6 list-disc">
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{studentMap[c.studentId]?.name}</span> {c.sessionLabel} ↔ {c.conflictWith}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving || selectedStudents.length === 0}>
              {saving ? '저장 중...' : `${selectedStudents.length}명 · ${sessions.filter(s => s.date).length}회차 등록`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
