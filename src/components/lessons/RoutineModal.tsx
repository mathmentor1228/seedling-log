import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { ASSISTANTS, ROOMS } from './constants';
import { useTeachersList } from './useTeachersList';
import { Plus, Trash2, Calendar, Loader2, Pencil } from 'lucide-react';
import { startOfWeek, addDays, format } from 'date-fns';

interface RoutineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'test' | 'self_study' | 'clinic';
}

interface StudentOption { id: string; name: string; }

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function RoutineModal({ open, onOpenChange, type }: RoutineModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { teachers } = useTeachersList();
  const [routines, setRoutines] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);

  // Form
  const [days, setDays] = useState<number[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [subject, setSubject] = useState('');
  const [testType, setTestType] = useState('수학');
  const [autoCreate, setAutoCreate] = useState(true);
  const [room, setRoom] = useState('general');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [templateContent, setTemplateContent] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Generate preview
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) { fetchRoutines(); fetchStudents(); }
  }, [open, type]);

  async function fetchRoutines() {
    setLoading(true);
    const { data } = await supabase.from('routine_schedules').select('*').eq('type', type).order('day_of_week');
    setRoutines(data || []);
    setLoading(false);
  }

  async function fetchStudents() {
    const { data } = await supabase.from('students').select('id, name').neq('enrollment_status', '퇴원').order('name');
    setStudents(data || []);
  }

  function toggleDay(d: number) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }

  function toggleStudent(id: string) {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function startEditing(routine: any) {
    setEditingRoutineId(routine.id);
    setDays([routine.day_of_week]);
    setTeacherId(routine.teacher_id || '');
    setSubject(routine.subject || '');
    setTestType(routine.subject || '수학');
    setAutoCreate(routine.auto_create_test ?? true);
    setRoom(routine.room || 'general');
    setStartTime(routine.start_time?.slice(0, 5) || '');
    setEndTime(routine.end_time?.slice(0, 5) || '');
    setSelectedStudents(Array.isArray(routine.student_ids) ? routine.student_ids : []);
    setTemplateContent(routine.template_content || '');
    setAssistantName(routine.assistant_name || '');
    setShowForm(true);
  }

  async function handleSaveRoutine() {
    if (days.length === 0 || !teacherId || selectedStudents.length === 0) {
      toast({ title: '요일, 선생님, 학생을 선택해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const payload = {
      type,
      teacher_id: teacherId,
      start_time: startTime || null,
      end_time: endTime || null,
      student_ids: selectedStudents,
      subject: type === 'test' ? testType : subject || null,
      room,
      template_content: templateContent || null,
      auto_create_test: type === 'test' ? autoCreate : false,
      test_content: type === 'test' ? templateContent || null : null,
      assistant_name: type === 'test' ? (assistantName && assistantName !== 'none' ? assistantName : null) : null,
    };

    if (editingRoutineId) {
      // Update existing routine
      const { error } = await supabase
        .from('routine_schedules')
        .update({ ...payload, day_of_week: days[0] })
        .eq('id', editingRoutineId);
      if (error) {
        toast({ title: '수정 실패', variant: 'destructive' });
      } else {
        toast({ title: '루틴이 수정되었습니다' });
        setShowForm(false);
        setEditingRoutineId(null);
        resetForm();
        fetchRoutines();
      }
    } else {
      // Insert new routines
      const inserts = days.map(d => ({ ...payload, day_of_week: d }));
      const { error } = await supabase.from('routine_schedules').insert(inserts);
      if (error) {
        toast({ title: '저장 실패', variant: 'destructive' });
      } else {
        toast({ title: '루틴이 저장되었습니다' });
        setShowForm(false);
        resetForm();
        fetchRoutines();
      }
    }
    setSaving(false);
  }

  function resetForm() {
    setDays([]); setTeacherId(''); setSubject(''); setTestType('수학'); setAutoCreate(true); setRoom('general');
    setStartTime(''); setEndTime(''); setSelectedStudents([]);
    setTemplateContent(''); setAssistantName(''); setStudentSearch('');
    setEditingRoutineId(null);
  }

  async function handleDeleteRoutine(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('routine_schedules').delete().eq('id', id);
    toast({ title: '삭제되었습니다' });
    fetchRoutines();
  }

  async function handleToggleActive(id: string, active: boolean) {
    await supabase.from('routine_schedules').update({ is_active: active }).eq('id', id);
    fetchRoutines();
  }

  function generatePreview() {
    const activeRoutines = routines.filter(r => r.is_active);
    if (activeRoutines.length === 0) {
      toast({ title: '활성화된 루틴이 없습니다', variant: 'destructive' });
      return;
    }
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const rows: any[] = [];
    for (const routine of activeRoutines) {
      const dayDate = addDays(monday, routine.day_of_week === 0 ? 6 : routine.day_of_week - 1);
      const dateStr = format(dayDate, 'yyyy-MM-dd');
      const studentIds: string[] = Array.isArray(routine.student_ids) ? routine.student_ids : [];
      for (const sid of studentIds) {
        const student = students.find(s => s.id === sid);
        rows.push({
          routineId: routine.id,
          date: dateStr,
          dayLabel: DAY_LABELS[routine.day_of_week],
          studentId: sid,
          studentName: student?.name || '알 수 없음',
          subject: routine.subject,
          room: routine.room,
          teacherId: routine.teacher_id,
          startTime: routine.start_time,
          endTime: routine.end_time,
          templateContent: routine.template_content,
          assistantName: routine.assistant_name,
        });
      }
    }
    setPreviewRows(rows);
    setShowPreview(true);
  }

  async function confirmGenerate() {
    setGenerating(true);

    if (type === 'test') {
      // Insert into test_schedules for proper integration
      const rows = previewRows.map(r => ({
        student_id: r.studentId,
        teacher_id: r.teacherId,
        test_date: r.date,
        test_time: r.startTime || null,
        subject: r.subject || '수학',
        test_type: 'regular',
        content: r.templateContent || null,
        title: r.templateContent || null,
        notes: null,
      }));
      const { error } = await supabase.from('test_schedules').insert(rows);
      if (error) {
        toast({ title: '생성 실패', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `${previewRows.length}건이 생성되었습니다` });
        setShowPreview(false);
      }
    } else {
      const table = type === 'self_study' ? 'self_study_records' : 'clinic_records';
      const inserts = previewRows.map(r => {
        if (type === 'self_study') {
          return {
            student_id: r.studentId,
            teacher_id: r.teacherId,
            study_date: r.date,
            start_time: r.startTime,
            end_time: r.endTime,
            subject: r.subject,
            room: r.room,
            task_list: [],
          };
        } else {
          return {
            student_id: r.studentId,
            teacher_id: r.teacherId,
            clinic_date: r.date,
            start_time: r.startTime,
            end_time: r.endTime,
            subject: r.subject || '수학',
            content: r.templateContent || '',
            room: r.room,
          };
        }
      });
      const { error } = await supabase.from(table).insert(inserts);
      if (error) {
        toast({ title: '생성 실패', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `${previewRows.length}건이 생성되었습니다` });
        setShowPreview(false);
      }
    }
    setGenerating(false);
  }

  const filteredStudents = students.filter(s =>
    !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const typeLabel = type === 'test' ? '테스트' : type === 'self_study' ? '자습' : '클리닉';
  const studentNameMap = Object.fromEntries(students.map(s => [s.id, s.name]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{typeLabel} 정기 루틴 설정</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">등록된 루틴</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          ) : routines.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 루틴이 없습니다</p>
          ) : routines.map(r => (
            <Card key={r.id}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{DAY_LABELS[r.day_of_week]}요일</Badge>
                    <span className="text-sm">{(Array.isArray(r.student_ids) ? r.student_ids : []).length}명</span>
                    {r.subject && <Badge variant="secondary" className="text-xs">{r.subject}</Badge>}
                    <span className="text-xs text-muted-foreground">{ROOMS.find(rm => rm.value === r.room)?.label}</span>
                    {r.start_time && <span className="text-xs text-muted-foreground">{r.start_time.slice(0, 5)}~{r.end_time?.slice(0, 5)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEditing(r)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Switch checked={r.is_active} onCheckedChange={v => handleToggleActive(r.id, v)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteRoutine(r.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {/* Show student names */}
                {Array.isArray(r.student_ids) && r.student_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {r.student_ids.map((sid: string) => studentNameMap[sid] || '?').join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {routines.length > 0 && (
          <Button variant="outline" onClick={generatePreview} className="gap-1">
            <Calendar className="w-4 h-4" /> 이번 주 생성
          </Button>
        )}

        {showPreview && (
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-semibold">생성 미리보기 ({previewRows.length}건)</h3>
            <div className="overflow-x-auto max-h-60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>요일</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>강의실</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{r.date}</TableCell>
                      <TableCell className="text-sm">{r.dayLabel}</TableCell>
                      <TableCell className="text-sm">{r.studentName}</TableCell>
                      <TableCell className="text-sm">{r.subject || '-'}</TableCell>
                      <TableCell className="text-sm">{ROOMS.find(rm => rm.value === r.room)?.label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2">
              <Button onClick={confirmGenerate} disabled={generating}>
                {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 생성 중...</> : '확정'}
              </Button>
              <Button variant="outline" onClick={() => setShowPreview(false)}>취소</Button>
            </div>
          </div>
        )}

        {!showForm ? (
          <Button onClick={() => setShowForm(true)} className="gap-1 w-fit">
            <Plus className="w-4 h-4" /> 새 루틴 추가
          </Button>
        ) : (
          <div className="space-y-3 border-t pt-3">
            <h3 className="text-sm font-semibold">
              {editingRoutineId ? '루틴 수정' : '새 루틴'}
            </h3>

            <div>
              <Label>요일 {editingRoutineId ? '(단일)' : '(복수 선택)'}</Label>
              <div className="flex gap-2 mt-1">
                {DAY_LABELS.map((label, idx) => (
                  <Button
                    key={idx}
                    type="button"
                    variant={days.includes(idx) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (editingRoutineId) {
                        setDays([idx]);
                      } else {
                        toggleDay(idx);
                      }
                    }}
                    className="w-10"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>담당 선생님 *</Label>
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>과목</Label>
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
                    {ROOMS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {type === 'test' && (
                <div>
                  <Label>담당 조교</Label>
                  <Select value={assistantName || 'none'} onValueChange={setAssistantName}>
                    <SelectTrigger><SelectValue placeholder="조교 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">없음</SelectItem>
                      {ASSISTANTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>시작 시간</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>종료 시간</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>템플릿 내용</Label>
              <Input value={templateContent} onChange={e => setTemplateContent(e.target.value)} placeholder="기본 범위/내용" />
            </div>

            <div>
              <Label>대상 학생 *</Label>
              <Input placeholder="학생 검색..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} className="mb-2" />
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {filteredStudents.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <Checkbox checked={selectedStudents.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
              {selectedStudents.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{selectedStudents.length}명 선택됨</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveRoutine} disabled={saving}>
                {saving ? '저장 중...' : editingRoutineId ? '수정 완료' : '루틴 저장'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>취소</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
