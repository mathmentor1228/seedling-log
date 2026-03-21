// STUDY-SESSION-V1: Teacher/admin management for 자습/클리닉/테스트 sessions
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Trash2, BookOpen, ClipboardCheck, Clock, Users, CheckCircle2, Circle, Loader2, Play,
} from 'lucide-react';

interface Student { id: string; name: string; }
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
  const [saving, setSaving] = useState(false);

  // Realtime task updates
  const [realtimeTasks, setRealtimeTasks] = useState<Record<string, SessionTask[]>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [sessRes, studRes, teachRes] = await Promise.all([
      supabase.from('study_sessions')
        .select('*')
        .eq('session_date', selectedDate)
        .order('start_time'),
      supabase.from('students').select('id, name').eq('enrollment_status', '재원').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);

    const sessData = (sessRes.data || []) as StudySession[];
    setStudents(studRes.data || []);
    setTeachers(teachRes.data || []);

    // Fetch student names and tasks for sessions
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
      setRealtimeTasks(taskMap);
    } else {
      setSessions([]);
    }
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription for task updates
  useEffect(() => {
    const channel = supabase
      .channel('study-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_session_tasks' }, (payload) => {
        fetchData(); // Refresh on any task change
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' }, (payload) => {
        fetchData();
      })
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

    // Create sessions for each student
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

      // Add tasks if self-study/clinic
      if (session && taskContents.length > 0 && (formType === '자습' || formType === '클리닉')) {
        const taskInserts = taskContents.map((content, idx) => ({
          session_id: session.id,
          sort_order: idx,
          content,
        }));
        await supabase.from('study_session_tasks').insert(taskInserts as any);
      }
    }

    toast({ title: `${formStudentIds.length}명의 ${formType} 세션이 생성되었습니다` });
    setShowCreate(false);
    setFormStudentIds([]);
    setFormTasks(['']);
    setFormNotes('');
    fetchData();
    setSaving(false);
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('이 세션을 삭제하시겠습니까?')) return;
    await supabase.from('study_sessions').delete().eq('id', id);
    fetchData();
  };

  // Group sessions by student
  const grouped = sessions.reduce<Record<string, typeof sessions>>((acc, s) => {
    const key = s.student_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const toggleStudentSelection = (id: string) => {
    setFormStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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
        <Button size="sm" className="gap-1.5" onClick={() => { setFormDate(selectedDate); setShowCreate(true); }}>
          <Plus className="w-4 h-4" /> 세션 등록
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : sessions.length === 0 ? (
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

                    return (
                      <div key={session.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={session.session_type === '테스트' ? 'destructive' : 'default'} className="text-xs">
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
                            <Badge variant={
                              session.status === 'completed' ? 'default' :
                              session.status === 'in_progress' ? 'secondary' : 'outline'
                            } className="text-[10px]">
                              {session.status === 'completed' ? '완료' :
                               session.status === 'in_progress' ? '진행중' : '예정'}
                            </Badge>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDeleteSession(session.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        {/* Time tracking */}
                        {session.actual_start_at && (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Play className="w-3 h-3 text-green-500" />
                            실제 학습: {new Date(session.actual_start_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            {session.actual_end_at && ` ~ ${new Date(session.actual_end_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                            {session.actual_start_at && session.actual_end_at && (() => {
                              const mins = Math.round((new Date(session.actual_end_at).getTime() - new Date(session.actual_start_at).getTime()) / 60000);
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

                        {session.notes && <p className="text-xs text-muted-foreground">{session.notes}</p>}
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

            {/* Student selection */}
            <div>
              <Label className="text-xs">학생 선택 ({formStudentIds.length}명)</Label>
              <div className="border rounded-lg p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
                {students.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded" onClick={() => toggleStudentSelection(s.id)}>
                    <Checkbox checked={formStudentIds.includes(s.id)} />
                    <span>{s.name}</span>
                  </div>
                ))}
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

            {/* Notes for 테스트 */}
            {formType === '테스트' && (
              <div>
                <Label className="text-xs">비고 (테스트 내용 등)</Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="예: 단원평가 3단원" className="h-8 text-sm" />
              </div>
            )}

            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {formStudentIds.length}명 세션 생성
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
