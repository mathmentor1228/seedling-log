// STUDY-SESSION-V2: Teacher/admin management for 자습/클리닉/테스트 sessions
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Trash2, BookOpen, ClipboardCheck, Clock, Users, CheckCircle2, Circle, Loader2, Play,
  Search, Edit2, Save, AlertTriangle,
} from 'lucide-react';

interface Student {
  id: string;
  name: string;
  school_level: string | null;
  grade_year: number | null;
  grade: string | null;
}
interface Profile { id: string; full_name: string; }

interface StudySession {
  id: string;
  session_type: string;
  session_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  supervisor_id: string | null;
  supervisor_name: string | null;
  student_id: string;
  notes: string | null;
  status: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  created_at: string;
  test_content: string | null;
  test_result: string | null;
  linked_lesson_id: string | null;
}

interface SessionTask {
  id: string;
  session_id: string;
  sort_order: number;
  content: string;
  is_completed: boolean;
  completed_at: string | null;
}

const SESSION_TYPES = ['자습', '클리닉', '테스트'];
const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '기타'];

const SCHOOL_ORDER: Record<string, number> = { '초': 0, '중': 1, '고': 2 };

function gradeLabel(s: Student): string {
  if (s.school_level && s.grade_year) return `${s.school_level}${s.grade_year}`;
  return s.grade || '-';
}

function groupStudentsByGrade(students: Student[]) {
  const groups: Record<string, Student[]> = {};
  for (const s of students) {
    const key = s.school_level && s.grade_year
      ? `${s.school_level}${s.grade_year}`
      : '미분류';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  // Sort groups
  const sorted = Object.entries(groups).sort(([a], [b]) => {
    if (a === '미분류') return 1;
    if (b === '미분류') return -1;
    const aLevel = SCHOOL_ORDER[a[0]] ?? 9;
    const bLevel = SCHOOL_ORDER[b[0]] ?? 9;
    if (aLevel !== bLevel) return aLevel - bLevel;
    return parseInt(a.slice(1)) - parseInt(b.slice(1));
  });
  return sorted;
}

export function StudySessionManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<(StudySession & { student_name?: string; tasks?: SessionTask[] })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Create form
  const [formType, setFormType] = useState('자습');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('16:00');
  const [formEndTime, setFormEndTime] = useState('18:00');
  const [formSubject, setFormSubject] = useState('수학');
  const [formSupervisorId, setFormSupervisorId] = useState('');
  const [formStudentIds, setFormStudentIds] = useState<string[]>([]);
  const [formTasks, setFormTasks] = useState<string[]>(['']);
  const [formNotes, setFormNotes] = useState('');
  const [formStudentSearch, setFormStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit test detail
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTestContent, setEditTestContent] = useState('');
  const [editTestResult, setEditTestResult] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Merge prompt
  const [mergePrompt, setMergePrompt] = useState<{ sessionId: string; lessonId: string; studentName: string } | null>(null);

  // Filter by teacher
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [sessRes, studRes, teachRes] = await Promise.all([
      supabase.from('study_sessions')
        .select('*')
        .eq('session_date', selectedDate)
        .order('start_time'),
      supabase.from('students').select('id, name, school_level, grade_year, grade').eq('enrollment_status', '재원').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);

    const sessData = (sessRes.data || []) as unknown as StudySession[];
    setStudents(studRes.data || []);
    setTeachers(teachRes.data || []);

    if (sessData.length > 0) {
      const studentIds = [...new Set(sessData.map(s => s.student_id))];
      const sessionIds = sessData.map(s => s.id);
      const [namesRes, tasksRes] = await Promise.all([
        supabase.from('students').select('id, name').in('id', studentIds),
        supabase.from('study_session_tasks').select('*').in('session_id', sessionIds).order('sort_order'),
      ]);
      const nameMap = (namesRes.data || []).reduce<Record<string, string>>((m, s) => { m[s.id] = s.name; return m; }, {});
      const taskMap: Record<string, SessionTask[]> = {};
      for (const t of (tasksRes.data || []) as SessionTask[]) {
        if (!taskMap[t.session_id]) taskMap[t.session_id] = [];
        taskMap[t.session_id].push(t);
      }
      setSessions(sessData.map(s => ({ ...s, student_name: nameMap[s.student_id], tasks: taskMap[s.id] || [] })));
    } else {
      setSessions([]);
    }
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('study-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_session_tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleCreate = async () => {
    if (formStudentIds.length === 0) {
      toast({ title: '학생을 선택하세요', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const supervisor = teachers.find(t => t.id === formSupervisorId);
    const taskContents = formTasks.filter(t => t.trim());

    for (const studentId of formStudentIds) {
      const { data: session, error: sessionErr } = await supabase.from('study_sessions').insert({
        session_type: formType,
        session_date: formDate,
        start_time: formStartTime,
        end_time: formEndTime,
        subject: formSubject,
        supervisor_id: formSupervisorId || null,
        supervisor_name: supervisor?.full_name || null,
        student_id: studentId,
        notes: formNotes.trim() || null,
        created_by: user?.id,
      } as any).select().single();

      if (sessionErr) {
        toast({ title: '생성 실패', description: sessionErr.message, variant: 'destructive' });
        continue;
      }

      if (session && taskContents.length > 0 && (formType === '자습' || formType === '클리닉')) {
        const taskInserts = taskContents.map((content, idx) => ({
          session_id: session.id,
          sort_order: idx,
          content,
        }));
        await supabase.from('study_session_tasks').insert(taskInserts as any);
      }

      // For test type, check if there's an existing lesson record and prompt merge
      if (session && formType === '테스트') {
        const { data: existingLesson } = await supabase.from('lesson_records')
          .select('id')
          .eq('student_id', studentId)
          .eq('lesson_date', formDate)
          .eq('subject', formSubject as any)
          .eq('submitted', true)
          .limit(1)
          .maybeSingle();

        if (existingLesson) {
          const studentName = students.find(s => s.id === studentId)?.name || '학생';
          setMergePrompt({ sessionId: session.id, lessonId: existingLesson.id, studentName });
        }
      }
    }

    toast({ title: `${formStudentIds.length}명의 ${formType} 세션이 생성되었습니다` });
    setShowCreate(false);
    setFormStudentIds([]);
    setFormTasks(['']);
    setFormNotes('');
    setFormStudentSearch('');
    fetchData();
    setSaving(false);
  };

  const handleMergeConfirm = async () => {
    if (!mergePrompt) return;
    await supabase.from('study_sessions')
      .update({ linked_lesson_id: mergePrompt.lessonId } as any)
      .eq('id', mergePrompt.sessionId);
    toast({ title: '기존 수업일지와 연결되었습니다' });
    setMergePrompt(null);
    fetchData();
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('이 세션을 삭제하시겠습니까?')) return;
    await supabase.from('study_sessions').delete().eq('id', id);
    fetchData();
  };

  const handleSaveTestDetail = async () => {
    if (!editingSessionId) return;
    await supabase.from('study_sessions')
      .update({
        test_content: editTestContent.trim() || null,
        test_result: editTestResult.trim() || null,
        notes: editNotes.trim() || null,
      } as any)
      .eq('id', editingSessionId);
    toast({ title: '테스트 정보가 저장되었습니다' });
    setEditingSessionId(null);
    fetchData();
  };

  const openTestEdit = (session: StudySession) => {
    setEditingSessionId(session.id);
    setEditTestContent((session as any).test_content || '');
    setEditTestResult((session as any).test_result || '');
    setEditNotes(session.notes || '');
  };

  const toggleStudentSelection = (id: string) => {
    setFormStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Filter students by search
  const filteredStudents = formStudentSearch.trim()
    ? students.filter(s => s.name.includes(formStudentSearch.trim()))
    : students;

  const groupedStudents = groupStudentsByGrade(filteredStudents);

  // Filter sessions by teacher
  const displaySessions = filterTeacherId === 'all'
    ? sessions
    : sessions.filter(s => s.supervisor_id === filterTeacherId);

  // Group sessions by student
  const grouped = displaySessions.reduce<Record<string, typeof displaySessions>>((acc, s) => {
    const key = s.student_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  // Select all students in a grade group
  const toggleGradeGroup = (groupStudents: Student[]) => {
    const ids = groupStudents.map(s => s.id);
    const allSelected = ids.every(id => formStudentIds.includes(id));
    if (allSelected) {
      setFormStudentIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setFormStudentIds(prev => [...new Set([...prev, ...ids])]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" /> 자습/클리닉/테스트 관리
          </h2>
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Filter by teacher */}
          <Select value={filterTeacherId} onValueChange={setFilterTeacherId}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="담당 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={() => { setFormDate(selectedDate); setShowCreate(true); }}>
            <Plus className="w-4 h-4" /> 세션 등록
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : displaySessions.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>등록된 세션이 없습니다</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([studentId, studentSessions]) => {
            const studentName = studentSessions[0]?.student_name || '이름 없음';
            return (
              <Card key={studentId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" /> {studentName}
                    <Badge variant="secondary" className="text-xs">{studentSessions.length}세션</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {studentSessions.map(session => {
                    const completedTasks = session.tasks?.filter(t => t.is_completed).length || 0;
                    const totalTasks = session.tasks?.length || 0;
                    const isTest = session.session_type === '테스트';

                    return (
                      <div key={session.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={isTest ? 'destructive' : 'default'} className="text-xs">
                              {session.session_type}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{session.subject}</Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
                            </span>
                            {session.supervisor_name && (
                              <span className="text-xs text-muted-foreground">담당: {session.supervisor_name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {(session as any).linked_lesson_id && (
                              <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">일지연결</Badge>
                            )}
                            <Badge variant={
                              session.status === 'completed' ? 'default' :
                              session.status === 'in_progress' ? 'secondary' : 'outline'
                            } className="text-[10px]">
                              {session.status === 'completed' ? '완료' :
                               session.status === 'in_progress' ? '진행중' : '예정'}
                            </Badge>
                            {isTest && (
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openTestEdit(session)}>
                                <Edit2 className="w-3 h-3 text-primary" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDeleteSession(session.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        {/* Test content display */}
                        {isTest && (session as any).test_content && (
                          <div className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                            <span className="font-medium">테스트 내용:</span> {(session as any).test_content}
                            {(session as any).test_result && (
                              <span className="ml-2 font-medium">결과: {(session as any).test_result}</span>
                            )}
                          </div>
                        )}

                        {/* Time tracking */}
                        {session.actual_start_at && (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Play className="w-3 h-3 text-green-500" />
                            실제 학습: {new Date(session.actual_start_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            {session.actual_end_at && ` ~ ${new Date(session.actual_end_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                            {session.actual_start_at && session.actual_end_at && (() => {
                              const mins = Math.round((new Date(session.actual_end_at!).getTime() - new Date(session.actual_start_at!).getTime()) / 60000);
                              return ` (${Math.floor(mins / 60)}시간 ${mins % 60}분)`;
                            })()}
                          </div>
                        )}

                        {/* Task checklist progress */}
                        {totalTasks > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-medium">체크리스트</span>
                              <Badge variant={completedTasks === totalTasks ? 'default' : 'secondary'} className="text-[10px]">
                                {completedTasks}/{totalTasks} 완료
                              </Badge>
                            </div>
                            <div className="space-y-0.5">
                              {session.tasks?.map(task => (
                                <div key={task.id} className={`flex items-center gap-2 text-xs p-1 rounded ${task.is_completed ? 'text-muted-foreground line-through' : ''}`}>
                                  {task.is_completed ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                  {task.content}
                                  {task.completed_at && <span className="text-[10px] ml-auto">{new Date(task.completed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {session.notes && !isTest && <p className="text-xs text-muted-foreground">{session.notes}</p>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Session Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>세션 등록</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">유형</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SESSION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">과목</Label>
                <Select value={formSubject} onValueChange={setFormSubject}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">날짜</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">시작 시간</Label>
                <Input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">종료 시간</Label>
                <Input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs">담당자</Label>
              <Select value={formSupervisorId} onValueChange={setFormSupervisorId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="담당자 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Student selection with search & grade grouping */}
            <div>
              <Label className="text-xs">학생 선택 ({formStudentIds.length}명)</Label>
              <div className="relative mt-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  value={formStudentSearch}
                  onChange={e => setFormStudentSearch(e.target.value)}
                  placeholder="학생 이름 검색..."
                  className="h-8 text-sm pl-8"
                />
              </div>
              <div className="border rounded-lg p-2 max-h-52 overflow-y-auto space-y-2 mt-1">
                {groupedStudents.map(([gradeKey, gradeStudents]) => {
                  const allSelected = gradeStudents.every(s => formStudentIds.includes(s.id));
                  const someSelected = gradeStudents.some(s => formStudentIds.includes(s.id));
                  return (
                    <div key={gradeKey}>
                      <div
                        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground py-1 px-1 cursor-pointer hover:text-foreground sticky top-0 bg-background z-10 border-b"
                        onClick={() => toggleGradeGroup(gradeStudents)}
                      >
                        <Checkbox checked={allSelected} className="h-3.5 w-3.5" />
                        <span>{gradeKey}</span>
                        <Badge variant="secondary" className="text-[10px] h-4">{gradeStudents.length}</Badge>
                        {someSelected && !allSelected && <span className="text-[10px] text-primary">일부 선택</span>}
                      </div>
                      <div className="pl-2">
                        {gradeStudents.map(s => (
                          <div key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded" onClick={() => toggleStudentSelection(s.id)}>
                            <Checkbox checked={formStudentIds.includes(s.id)} className="h-3.5 w-3.5" />
                            <span>{s.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {groupedStudents.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">검색 결과 없음</p>
                )}
              </div>
            </div>

            {/* Task list (only for 자습/클리닉) */}
            {(formType === '자습' || formType === '클리닉') && (
              <div>
                <Label className="text-xs">학습 리스트</Label>
                <div className="space-y-1.5 mt-1">
                  {formTasks.map((task, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                      <Input
                        value={task}
                        onChange={e => {
                          const updated = [...formTasks];
                          updated[idx] = e.target.value;
                          setFormTasks(updated);
                        }}
                        placeholder={`할 일 ${idx + 1}`}
                        className="h-8 text-sm flex-1"
                      />
                      {formTasks.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => setFormTasks(prev => prev.filter((_, i) => i !== idx))}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setFormTasks(prev => [...prev, ''])}>
                    <Plus className="w-3 h-3" /> 항목 추가
                  </Button>
                </div>
              </div>
            )}

            {/* Notes */}
            {formType !== '테스트' && (
              <div>
                <Label className="text-xs">메모</Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="메모" className="h-8 text-sm" />
              </div>
            )}

            {formType === '테스트' && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <span>테스트 세부 내용(시험 내용, 결과 등)은 세션 생성 후 편집 버튼(✏️)을 통해 입력할 수 있습니다. 같은 날짜에 기존 수업일지가 있으면 연결 여부를 물어봅니다.</span>
              </div>
            )}

            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {formStudentIds.length}명 세션 생성
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Detail Edit Dialog */}
      <Dialog open={!!editingSessionId} onOpenChange={() => setEditingSessionId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>테스트 정보 수정</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">테스트 내용/범위</Label>
              <Input value={editTestContent} onChange={e => setEditTestContent(e.target.value)} placeholder="예: 중2 1단원 단원평가" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">테스트 결과</Label>
              <Input value={editTestResult} onChange={e => setEditTestResult(e.target.value)} placeholder="예: 85점 / Pass" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="메모" className="text-sm min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSessionId(null)}>취소</Button>
            <Button onClick={handleSaveTestDetail} className="gap-1.5">
              <Save className="w-4 h-4" /> 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Prompt Dialog */}
      <Dialog open={!!mergePrompt} onOpenChange={() => setMergePrompt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>기존 수업일지 연결</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{mergePrompt?.studentName}</strong> 학생의 같은 날짜/과목 수업일지가 이미 존재합니다. 이 테스트 세션을 기존 수업일지와 연결하시겠습니까?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergePrompt(null)}>아니요</Button>
            <Button onClick={handleMergeConfirm}>연결하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
