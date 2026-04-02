import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils';
import { ASSISTANTS, ROOMS, SUBJECTS, TEST_TYPES, isSpecialRoom } from './constants';
import { useTeachersList } from './useTeachersList';
import { Plus, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UnifiedRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  defaultDate?: string;
  defaultStudentId?: string;
  defaultTypes?: ('test' | 'self_study' | 'clinic')[];
}

interface StudentOption {
  id: string;
  name: string;
}

interface StudyTask {
  id: string;
  task: string;
  done: boolean;
}

type RecordType = 'test' | 'self_study' | 'clinic';

export function UnifiedRecordModal({
  open,
  onOpenChange,
  onSaved,
  defaultDate,
  defaultStudentId,
  defaultTypes = [],
}: UnifiedRecordModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { teachers } = useTeachersList();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [studentPopoverOpen, setStudentPopoverOpen] = useState(false);

  // Common
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayKST());
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('general');
  const [selectedTypes, setSelectedTypes] = useState<Set<RecordType>>(new Set());

  // Test
  const [testSubject, setTestSubject] = useState('');
  const [testType, setTestType] = useState('guerrilla');
  const [testStartTime, setTestStartTime] = useState('');
  const [testEndTime, setTestEndTime] = useState('');
  const [testContent, setTestContent] = useState('');
  const [testScore, setTestScore] = useState('');
  const [testPassed, setTestPassed] = useState<boolean | null>(null);
  const [testAssistant, setTestAssistant] = useState('');

  // Self-study
  const [studySubject, setStudySubject] = useState('');
  const [studyStartTime, setStudyStartTime] = useState('');
  const [studyEndTime, setStudyEndTime] = useState('');
  const [studyTasks, setStudyTasks] = useState<StudyTask[]>([]);
  const [studyMemo, setStudyMemo] = useState('');

  // Clinic
  const [clinicSubject, setClinicSubject] = useState('');
  const [clinicStartTime, setClinicStartTime] = useState('');
  const [clinicEndTime, setClinicEndTime] = useState('');
  const [clinicContent, setClinicContent] = useState('');
  const [clinicNextMemo, setClinicNextMemo] = useState('');
  const [clinicTeacherNote, setClinicTeacherNote] = useState('');

  // Auto-calculate study duration
  const studyDurationMinutes = useMemo(() => {
    if (!studyStartTime || !studyEndTime) return null;
    const [sh, sm] = studyStartTime.split(':').map(Number);
    const [eh, em] = studyEndTime.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff : null;
  }, [studyStartTime, studyEndTime]);

  useEffect(() => {
    if (open) {
      fetchStudents();
      resetForm();
      if (defaultDate) setSelectedDate(defaultDate);
      if (defaultStudentId) setSelectedStudentId(defaultStudentId);
      if (defaultTypes.length > 0) setSelectedTypes(new Set(defaultTypes));
      if (user) setSelectedTeacherId(user.id);
    }
  }, [open]);

  function resetForm() {
    setSelectedStudentId('');
    setSelectedDate(getTodayKST());
    setSelectedTeacherId('');
    setSelectedRoom('general');
    setSelectedTypes(new Set());
    setTestSubject(''); setTestType('guerrilla'); setTestStartTime(''); setTestEndTime('');
    setTestContent(''); setTestScore(''); setTestPassed(null); setTestAssistant('');
    setStudySubject(''); setStudyStartTime(''); setStudyEndTime('');
    setStudyTasks([]); setStudyMemo('');
    setClinicSubject(''); setClinicStartTime(''); setClinicEndTime('');
    setClinicContent(''); setClinicNextMemo(''); setClinicTeacherNote('');
  }

  async function fetchStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, name')
      .eq('enrollment_status', '재학')
      .order('name');
    setStudents(data || []);
  }

  function toggleType(type: RecordType) {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function addTask() {
    setStudyTasks(prev => [...prev, { id: crypto.randomUUID(), task: '', done: false }]);
  }

  function removeTask(id: string) {
    setStudyTasks(prev => prev.filter(t => t.id !== id));
  }

  function updateTask(id: string, field: 'task' | 'done', value: string | boolean) {
    setStudyTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  const selectedStudentName = students.find(s => s.id === selectedStudentId)?.name || '';

  async function handleSave() {
    if (!selectedStudentId) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }
    if (selectedTypes.size === 0) {
      toast({ title: '기록 유형을 하나 이상 선택해주세요', variant: 'destructive' });
      return;
    }
    if (selectedTypes.has('test') && !testContent.trim()) {
      toast({ title: '테스트 범위/내용을 입력해주세요', variant: 'destructive' });
      return;
    }
    if (selectedTypes.has('clinic') && !clinicContent.trim()) {
      toast({ title: '클리닉 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const teacherId = selectedTeacherId || user?.id;

      // Upsert lesson_record for linking
      async function upsertLessonRecord(types: string[], subject: string): Promise<string | null> {
        const { data: existing } = await supabase
          .from('lesson_records')
          .select('id, lesson_types')
          .eq('student_id', selectedStudentId)
          .eq('lesson_date', selectedDate)
          .maybeSingle();

        if (existing) {
          const merged = [...new Set([...(existing.lesson_types || []), ...types])];
          await supabase
            .from('lesson_records')
            .update({ lesson_types: merged as any })
            .eq('id', existing.id);
          return existing.id;
        } else {
          const { data: newRecord } = await supabase
            .from('lesson_records')
            .insert({
              student_id: selectedStudentId,
              teacher_id: teacherId!,
              lesson_date: selectedDate,
              subject: subject as any,
              lesson_types: types,
              understanding_score: 0,
              homework_status: 'none',
              lesson_range: types.join('+'),
              submitted: true,
              submitted_at: new Date().toISOString(),
            })
            .select('id')
            .single();
          return newRecord?.id || null;
        }
      }

      const typesArray = Array.from(selectedTypes);
      const firstSubject = testSubject || clinicSubject || studySubject || '기타';
      const lessonRecordId = await upsertLessonRecord(
        typesArray.map(t => t === 'test' ? '테스트' : t === 'self_study' ? '자습' : '클리닉'),
        firstSubject
      );

      if (selectedTypes.has('test')) {
        await supabase.from('test_records').insert({
          student_id: selectedStudentId,
          teacher_id: teacherId!,
          lesson_record_id: lessonRecordId,
          test_date: selectedDate,
          start_time: testStartTime || null,
          end_time: testEndTime || null,
          subject: testSubject,
          test_type: testType,
          content: testContent.trim(),
          score: testScore.trim() || null,
          passed: testPassed,
          assistant_name: testAssistant && testAssistant !== 'none' ? testAssistant : null,
          room: selectedRoom,
        });
      }

      if (selectedTypes.has('self_study')) {
        await supabase.from('self_study_records').insert({
          student_id: selectedStudentId,
          teacher_id: teacherId!,
          lesson_record_id: lessonRecordId,
          study_date: selectedDate,
          subject: studySubject.trim() || null,
          task_list: studyTasks as any,
          start_time: studyStartTime || null,
          end_time: studyEndTime || null,
          duration_minutes: studyDurationMinutes,
          room: selectedRoom,
          memo: studyMemo.trim() || null,
        });
      }

      if (selectedTypes.has('clinic')) {
        await supabase.from('clinic_records').insert({
          student_id: selectedStudentId,
          teacher_id: teacherId!,
          lesson_record_id: lessonRecordId,
          clinic_date: selectedDate,
          start_time: clinicStartTime || null,
          end_time: clinicEndTime || null,
          subject: clinicSubject,
          content: clinicContent.trim(),
          next_clinic_memo: clinicNextMemo.trim() || null,
          teacher_note: clinicTeacherNote.trim() || null,
          teacher_note_shown: false,
          room: selectedRoom,
        });
      }

      toast({ title: '저장되었습니다' });

      if (isSpecialRoom(selectedRoom)) {
        toast({ description: '조교 대시보드에 일정이 공유되었습니다' });
      }
      if (clinicTeacherNote.trim()) {
        toast({ description: '담당 선생님 수업 탭에 알림이 표시됩니다' });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>기록 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3">
            {/* Student combobox */}
            <div className="col-span-2">
              <Label>학생 *</Label>
              <Popover open={studentPopoverOpen} onOpenChange={setStudentPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={studentPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedStudentName || '학생 선택...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="학생 검색..." />
                    <CommandList>
                      <CommandEmpty>학생을 찾을 수 없습니다</CommandEmpty>
                      <CommandGroup>
                        {students.map(s => (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            onSelect={() => {
                              setSelectedStudentId(s.id);
                              setStudentPopoverOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', selectedStudentId === s.id ? 'opacity-100' : 'opacity-0')} />
                            {s.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>날짜 *</Label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>

            <div>
              <Label>담당 선생님</Label>
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>강의실</Label>
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Type selection */}
          <div>
            <Label className="mb-2 block">기록 유형 *</Label>
            <div className="flex gap-4">
              {([
                { type: 'test' as RecordType, label: '🔬 테스트' },
                { type: 'self_study' as RecordType, label: '📚 자습' },
                { type: 'clinic' as RecordType, label: '🏥 클리닉' },
              ]).map(({ type, label }) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedTypes.has(type)}
                    onCheckedChange={() => toggleType(type)}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Test section */}
          {selectedTypes.has('test') && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h3 className="text-sm font-semibold">🔬 테스트</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>과목</Label>
                  <Select value={testSubject} onValueChange={setTestSubject}>
                    <SelectTrigger><SelectValue placeholder="과목 선택" /></SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>유형</Label>
                  <Select value={testType} onValueChange={setTestType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>시작시간</Label>
                  <Input type="time" value={testStartTime} onChange={e => setTestStartTime(e.target.value)} />
                </div>
                <div>
                  <Label>종료시간</Label>
                  <Input type="time" value={testEndTime} onChange={e => setTestEndTime(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>범위/내용 *</Label>
                  <Input value={testContent} onChange={e => setTestContent(e.target.value)} placeholder="시험 범위 또는 내용" />
                </div>
                <div>
                  <Label>점수</Label>
                  <Input value={testScore} onChange={e => setTestScore(e.target.value)} placeholder="예: 85점, 17/20" />
                </div>
                <div>
                  <Label>통과 여부</Label>
                  <div className="flex gap-1">
                    {([
                      { val: true, label: '통과', style: 'bg-green-100 text-green-800 border-green-300' },
                      { val: false, label: '불통과', style: 'bg-red-100 text-red-800 border-red-300' },
                      { val: null, label: '미기록', style: 'bg-muted text-muted-foreground border-border' },
                    ] as const).map(opt => (
                      <Button
                        key={String(opt.val)}
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn('flex-1', testPassed === opt.val && opt.style)}
                        onClick={() => setTestPassed(opt.val)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>담당 조교</Label>
                  <Select value={testAssistant} onValueChange={setTestAssistant}>
                    <SelectTrigger><SelectValue placeholder="조교 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">없음</SelectItem>
                      {ASSISTANTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Self-study section */}
          {selectedTypes.has('self_study') && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h3 className="text-sm font-semibold">📚 자습</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>과목</Label>
                  <Input value={studySubject} onChange={e => setStudySubject(e.target.value)} placeholder="과목 (선택)" />
                </div>
                <div>
                  <Label>시작시간</Label>
                  <Input type="time" value={studyStartTime} onChange={e => setStudyStartTime(e.target.value)} />
                </div>
                <div>
                  <Label>종료시간</Label>
                  <Input type="time" value={studyEndTime} onChange={e => setStudyEndTime(e.target.value)} />
                </div>
              </div>
              {studyDurationMinutes && (
                <p className="text-xs text-muted-foreground">학습시간: {studyDurationMinutes}분</p>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>할일 목록</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addTask} className="gap-1">
                    <Plus className="w-3 h-3" /> 항목 추가
                  </Button>
                </div>
                <div className="space-y-2">
                  {studyTasks.map((task, idx) => (
                    <div key={task.id} className="flex items-center gap-2">
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
              <div>
                <Label>메모</Label>
                <Textarea value={studyMemo} onChange={e => setStudyMemo(e.target.value)} placeholder="메모 (선택)" />
              </div>
            </div>
          )}

          {/* Clinic section */}
          {selectedTypes.has('clinic') && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h3 className="text-sm font-semibold">🏥 클리닉</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>과목</Label>
                  <Select value={clinicSubject} onValueChange={setClinicSubject}>
                    <SelectTrigger><SelectValue placeholder="과목 선택" /></SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>시작시간</Label>
                  <Input type="time" value={clinicStartTime} onChange={e => setClinicStartTime(e.target.value)} />
                </div>
                <div>
                  <Label>종료시간</Label>
                  <Input type="time" value={clinicEndTime} onChange={e => setClinicEndTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>클리닉 내용 *</Label>
                <Textarea value={clinicContent} onChange={e => setClinicContent(e.target.value)} placeholder="클리닉 학습 내용" />
              </div>
              <div>
                <Label>다음 클리닉 예정</Label>
                <Input value={clinicNextMemo} onChange={e => setClinicNextMemo(e.target.value)} placeholder="다음 클리닉 계획" />
              </div>
              <div>
                <Label>선생님 특이사항</Label>
                <Textarea value={clinicTeacherNote} onChange={e => setClinicTeacherNote(e.target.value)} placeholder="선생님에게 전달할 특이사항" />
                {clinicTeacherNote.trim() && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ 입력 시 수업 탭 로스터에 🏥 알림이 표시됩니다
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
