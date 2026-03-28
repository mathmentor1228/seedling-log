import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils';
import { ASSISTANTS, ROOMS, TEST_TYPES, isSpecialRoom } from './constants';
import { useTeachersList } from './useTeachersList';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface UnifiedRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTypes?: ('test' | 'self_study' | 'clinic')[];
  editRecord?: { type: string; id: string } | null;
  onSaved?: () => void;
}

interface StudentOption {
  id: string;
  name: string;
}

interface TaskItem {
  id: string;
  task: string;
  done: boolean;
}

export function UnifiedRecordModal({ open, onOpenChange, defaultTypes = ['test'], editRecord, onSaved }: UnifiedRecordModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { teachers } = useTeachersList();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeType, setActiveType] = useState<string>(defaultTypes[0] || 'test');

  // Common fields
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [date, setDate] = useState(getTodayKST());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subject, setSubject] = useState('');
  const [room, setRoom] = useState('general');
  const [memo, setMemo] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Test fields
  const [testType, setTestType] = useState('guerrilla');
  const [content, setContent] = useState('');
  const [score, setScore] = useState('');
  const [passed, setPassed] = useState<boolean | null>(null);
  const [assistantName, setAssistantName] = useState('');

  // Self-study fields
  const [taskList, setTaskList] = useState<TaskItem[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');

  // Clinic fields
  const [clinicContent, setClinicContent] = useState('');
  const [nextClinicMemo, setNextClinicMemo] = useState('');
  const [teacherNote, setTeacherNote] = useState('');

  useEffect(() => {
    if (open) {
      fetchStudents();
      if (!editRecord) {
        resetForm();
        setActiveType(defaultTypes[0] || 'test');
        if (user) setTeacherId(user.id);
      }
    }
  }, [open]);

  useEffect(() => {
    if (editRecord && open) loadEditRecord();
  }, [editRecord, open]);

  function resetForm() {
    setStudentId(''); setDate(getTodayKST()); setStartTime(''); setEndTime('');
    setSubject(''); setRoom('general'); setMemo(''); setTestType('guerrilla');
    setContent(''); setScore(''); setPassed(null); setAssistantName('');
    setTaskList([]); setDurationMinutes(''); setClinicContent('');
    setNextClinicMemo(''); setTeacherNote(''); setStudentSearch('');
  }

  async function fetchStudents() {
    const { data } = await supabase.from('students').select('id, name').neq('enrollment_status', '퇴원').order('name');
    setStudents(data || []);
  }

  async function loadEditRecord() {
    if (!editRecord) return;

    setActiveType(editRecord.type);

    if (editRecord.type === 'test') {
      const { data } = await supabase.from('test_records').select('*').eq('id', editRecord.id).single();
      if (!data) return;
      setStudentId(data.student_id); setTeacherId(data.teacher_id);
      setDate(data.test_date); setStartTime(data.start_time?.slice(0, 5) || '');
      setEndTime(data.end_time?.slice(0, 5) || ''); setRoom(data.room || 'general');
      setMemo(data.memo || ''); setSubject(data.subject || '');
      setTestType(data.test_type || 'guerrilla'); setContent(data.content || '');
      setScore(data.score || ''); setPassed(data.passed);
      setAssistantName(data.assistant_name || '');
    } else if (editRecord.type === 'self_study') {
      const { data } = await supabase.from('self_study_records').select('*').eq('id', editRecord.id).single();
      if (!data) return;
      setStudentId(data.student_id); setTeacherId(data.teacher_id);
      setDate(data.study_date); setStartTime(data.start_time?.slice(0, 5) || '');
      setEndTime(data.end_time?.slice(0, 5) || ''); setRoom(data.room || 'general');
      setMemo(data.memo || ''); setSubject(data.subject || '');
      setTaskList(Array.isArray(data.task_list) ? (data.task_list as any as TaskItem[]) : []);
      setDurationMinutes(data.duration_minutes || '');
    } else {
      const { data } = await supabase.from('clinic_records').select('*').eq('id', editRecord.id).single();
      if (!data) return;
      setStudentId(data.student_id); setTeacherId(data.teacher_id);
      setDate(data.clinic_date); setStartTime(data.start_time?.slice(0, 5) || '');
      setEndTime(data.end_time?.slice(0, 5) || ''); setRoom(data.room || 'general');
      setSubject(data.subject || ''); setClinicContent(data.content || '');
      setNextClinicMemo(data.next_clinic_memo || ''); setTeacherNote(data.teacher_note || '');
    }
  }

  function addTask() {
    setTaskList(prev => [...prev, { id: crypto.randomUUID(), task: '', done: false }]);
  }

  function removeTask(id: string) {
    setTaskList(prev => prev.filter(t => t.id !== id));
  }

  function updateTask(id: string, field: 'task' | 'done', value: string | boolean) {
    setTaskList(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  async function handleSave() {
    if (!studentId || !teacherId || !date) {
      toast({ title: '필수 항목을 입력해주세요', variant: 'destructive' });
      return;
    }
    if (activeType === 'test' && (!subject || !content)) {
      toast({ title: '과목과 내용을 입력해주세요', variant: 'destructive' });
      return;
    }
    if (activeType === 'clinic' && (!subject || !clinicContent)) {
      toast({ title: '과목과 클리닉 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let lessonRecordId: string | null = null;

      // Find matching lesson_record
      const { data: existingLR } = await supabase
        .from('lesson_records')
        .select('id')
        .eq('student_id', studentId)
        .eq('lesson_date', date)
        .eq('subject', subject || '수학')
        .limit(1)
        .maybeSingle();
      if (existingLR) lessonRecordId = existingLR.id;

      if (activeType === 'test') {
        const record = {
          student_id: studentId,
          teacher_id: teacherId,
          lesson_record_id: lessonRecordId,
          test_date: date,
          start_time: startTime || null,
          end_time: endTime || null,
          subject,
          test_type: testType,
          content,
          score: score || null,
          passed,
          assistant_name: assistantName || null,
          room,
          memo: memo || null,
          updated_at: new Date().toISOString(),
        };

        if (editRecord) {
          await supabase.from('test_records').update(record).eq('id', editRecord.id);
        } else {
          await supabase.from('test_records').insert(record);
        }
      } else if (activeType === 'self_study') {
        const record = {
          student_id: studentId,
          teacher_id: teacherId,
          lesson_record_id: lessonRecordId,
          study_date: date,
          subject: subject || null,
          task_list: taskList,
          start_time: startTime || null,
          end_time: endTime || null,
          duration_minutes: durationMinutes || null,
          room,
          memo: memo || null,
          updated_at: new Date().toISOString(),
        };

        if (editRecord) {
          await supabase.from('self_study_records').update(record).eq('id', editRecord.id);
        } else {
          await supabase.from('self_study_records').insert(record);
        }
      } else {
        const record = {
          student_id: studentId,
          teacher_id: teacherId,
          lesson_record_id: lessonRecordId,
          clinic_date: date,
          start_time: startTime || null,
          end_time: endTime || null,
          subject,
          content: clinicContent,
          next_clinic_memo: nextClinicMemo || null,
          teacher_note: teacherNote || null,
          teacher_note_shown: false,
          room,
          updated_at: new Date().toISOString(),
        };

        if (editRecord) {
          await supabase.from('clinic_records').update(record).eq('id', editRecord.id);
        } else {
          await supabase.from('clinic_records').insert(record);
        }
      }

      toast({ title: '저장되었습니다' });

      if (isSpecialRoom(room)) {
        toast({ title: '조교 대시보드에 일정이 공유되었습니다', description: `강의실: ${ROOMS.find(r => r.value === room)?.label}` });
      }

      if (activeType === 'clinic' && teacherNote) {
        toast({ title: '담당 선생님 수업 탭에 알림이 표시됩니다' });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Save error:', err);
      toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const filteredStudents = students.filter(s =>
    !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editRecord ? '기록 수정' : '새 기록 추가'}</DialogTitle>
        </DialogHeader>

        {!editRecord && defaultTypes.length > 1 && (
          <Tabs value={activeType} onValueChange={setActiveType}>
            <TabsList className="w-full">
              {defaultTypes.includes('test') && <TabsTrigger value="test">테스트</TabsTrigger>}
              {defaultTypes.includes('self_study') && <TabsTrigger value="self_study">자습</TabsTrigger>}
              {defaultTypes.includes('clinic') && <TabsTrigger value="clinic">클리닉</TabsTrigger>}
            </TabsList>
          </Tabs>
        )}

        <div className="space-y-4">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>학생 *</Label>
              <Input
                placeholder="학생 검색..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="mb-1"
              />
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="학생 선택" /></SelectTrigger>
                <SelectContent>
                  {filteredStudents.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>담당 선생님 *</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>날짜 *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div>
              <Label>시작 시간</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>

            <div>
              <Label>종료 시간</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>

            <div>
              <Label>과목 {activeType !== 'self_study' ? '*' : ''}</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue placeholder="과목 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="수학">수학</SelectItem>
                  <SelectItem value="영어">영어</SelectItem>
                  <SelectItem value="국어">국어</SelectItem>
                  <SelectItem value="과학">과학</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>강의실</Label>
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Test-specific fields */}
          {activeType === 'test' && (
            <div className="space-y-3 border-t pt-3">
              <h4 className="text-sm font-semibold text-primary">테스트 정보</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>유형</Label>
                  <Select value={testType} onValueChange={setTestType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>담당 조교</Label>
                  <Select value={assistantName} onValueChange={setAssistantName}>
                    <SelectTrigger><SelectValue placeholder="조교 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">없음</SelectItem>
                      {ASSISTANTS.map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>범위/내용 *</Label>
                  <Input value={content} onChange={e => setContent(e.target.value)} placeholder="시험 범위 또는 내용" />
                </div>
                <div>
                  <Label>결과</Label>
                  <Input value={score} onChange={e => setScore(e.target.value)} placeholder="예: 85점, 17/20" />
                </div>
                <div>
                  <Label>통과 여부</Label>
                  <Select value={passed === null ? 'none' : passed ? 'pass' : 'fail'} onValueChange={v => setPassed(v === 'none' ? null : v === 'pass')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미기록</SelectItem>
                      <SelectItem value="pass">통과</SelectItem>
                      <SelectItem value="fail">불통과</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Self-study fields */}
          {activeType === 'self_study' && (
            <div className="space-y-3 border-t pt-3">
              <h4 className="text-sm font-semibold text-primary">자습 정보</h4>
              <div>
                <Label>학습 시간 (분)</Label>
                <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value ? parseInt(e.target.value) : '')} placeholder="예: 90" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>할 일 목록</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addTask} className="gap-1">
                    <Plus className="w-3 h-3" /> 추가
                  </Button>
                </div>
                <div className="space-y-2">
                  {taskList.map((task, idx) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <Checkbox checked={task.done} onCheckedChange={v => updateTask(task.id, 'done', !!v)} />
                      <Input
                        value={task.task}
                        onChange={e => updateTask(task.id, 'task', e.target.value)}
                        placeholder={`할 일 ${idx + 1}`}
                        className="flex-1"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeTask(task.id)} className="h-8 w-8 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Clinic fields */}
          {activeType === 'clinic' && (
            <div className="space-y-3 border-t pt-3">
              <h4 className="text-sm font-semibold text-primary">클리닉 정보</h4>
              <div>
                <Label>클리닉 내용 *</Label>
                <Textarea value={clinicContent} onChange={e => setClinicContent(e.target.value)} placeholder="클리닉 학습 내용" />
              </div>
              <div>
                <Label>다음 클리닉 예정</Label>
                <Input value={nextClinicMemo} onChange={e => setNextClinicMemo(e.target.value)} placeholder="다음 클리닉 계획" />
              </div>
              <div>
                <Label>담당 선생님 특이사항</Label>
                <Textarea value={teacherNote} onChange={e => setTeacherNote(e.target.value)} placeholder="선생님에게 전달할 특이사항" />
                {teacherNote && (
                  <p className="text-xs text-muted-foreground mt-1">
                    💡 저장 시 담당 선생님 수업 탭에 알림이 표시됩니다
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Memo (common) */}
          <div>
            <Label>메모</Label>
            <Textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="추가 메모" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
