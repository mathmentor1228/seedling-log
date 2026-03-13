import { useState, useEffect } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, AlertTriangle, CalendarCheck, Clock, Users, Search } from 'lucide-react';
import { format } from 'date-fns';

interface Student {
  id: string;
  name: string;
  grade: string | null;
}

interface Teacher {
  id: string;
  full_name: string;
}

interface ExamPrepSchedule {
  id: string;
  student_id: string;
  subject: string;
  teacher_id: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  deadline_date: string;
  status: string;
  confirmed_at: string | null;
  created_at: string;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '미확인', variant: 'destructive' },
  confirmed: { label: '확인완료', variant: 'default' },
  auto_confirmed: { label: '시스템 확정', variant: 'secondary' },
};

export function ExamPrepScheduleManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<ExamPrepSchedule[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');

  // Form state
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [formSubject, setFormSubject] = useState('수학');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Student name map for display
  const studentMap = students.reduce<Record<string, Student>>((acc, s) => { acc[s.id] = s; return acc; }, {});
  const teacherMap = teachers.reduce<Record<string, string>>((acc, t) => { acc[t.id] = t.full_name; return acc; }, {});

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [schedRes, studRes, teachRes] = await Promise.all([
      supabase.from('exam_prep_schedules').select('*').order('schedule_date').order('start_time'),
      supabase.from('students').select('id, name, grade').neq('enrollment_status', '퇴원').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    setSchedules((schedRes.data || []) as unknown as ExamPrepSchedule[]);
    setStudents(studRes.data || []);
    setTeachers(teachRes.data || []);
    setLoading(false);
  }

  // Check for time conflicts when date/time/students change
  useEffect(() => {
    if (!formDate || !formStartTime || !formEndTime || selectedStudents.length === 0) {
      setConflicts([]);
      return;
    }
    const conflictNames: string[] = [];
    for (const sid of selectedStudents) {
      const existing = schedules.filter(
        s => s.student_id === sid && s.schedule_date === formDate
      );
      for (const ex of existing) {
        if (formStartTime < ex.end_time && formEndTime > ex.start_time) {
          const sName = studentMap[sid]?.name || sid;
          conflictNames.push(`${sName}: ${ex.subject} ${ex.start_time.slice(0, 5)}-${ex.end_time.slice(0, 5)}`);
        }
      }
    }
    setConflicts(conflictNames);
  }, [formDate, formStartTime, formEndTime, selectedStudents, schedules]);

  async function handleSave() {
    if (!formDate || !formStartTime || !formEndTime || !formDeadline || !formTeacherId || selectedStudents.length === 0) {
      toast({ title: '필수 항목을 모두 입력해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const rows = selectedStudents.map(sid => ({
      student_id: sid,
      subject: formSubject,
      teacher_id: formTeacherId,
      schedule_date: formDate,
      start_time: formStartTime,
      end_time: formEndTime,
      description: formDescription || null,
      deadline_date: formDeadline,
      created_by: user?.id || null,
    }));

    const { error } = await supabase.from('exam_prep_schedules').insert(rows);
    if (error) {
      toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedStudents.length}명의 특강 일정이 등록되었습니다` });
      setDialogOpen(false);
      resetForm();
      fetchAll();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('exam_prep_schedules').delete().eq('id', id);
    if (!error) {
      setSchedules(prev => prev.filter(s => s.id !== id));
      toast({ title: '삭제되었습니다' });
    }
  }

  function resetForm() {
    setSelectedStudents([]);
    setFormSubject('수학');
    setFormTeacherId('');
    setFormDate('');
    setFormStartTime('');
    setFormEndTime('');
    setFormDescription('');
    setFormDeadline('');
    setConflicts([]);
  }

  const toggleStudent = (sid: string) => {
    setSelectedStudents(prev =>
      prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]
    );
  };

  const filteredSchedules = schedules.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterSubject !== 'all' && s.subject !== filterSubject) return false;
    return true;
  });

  const filteredStudentsForPicker = students.filter(s =>
    studentSearch ? s.name.toLowerCase().includes(studentSearch.toLowerCase()) : true
  ).slice(0, 50);

  // Stats
  const pendingCount = schedules.filter(s => s.status === 'pending').length;
  const confirmedCount = schedules.filter(s => s.status === 'confirmed').length;
  const autoCount = schedules.filter(s => s.status === 'auto_confirmed').length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
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

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="pending">미확인</SelectItem>
              <SelectItem value="confirmed">확인완료</SelectItem>
              <SelectItem value="auto_confirmed">시스템 확정</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 과목</SelectItem>
              {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> 특강 일정 등록
        </Button>
      </div>

      {/* Schedule Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">등록된 특강 일정이 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">날짜</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>선생님</TableHead>
                    <TableHead>마지노선</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map(sch => (
                    <TableRow key={sch.id}>
                      <TableCell className="text-xs font-mono">{sch.schedule_date}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {sch.start_time.slice(0, 5)}-{sch.end_time.slice(0, 5)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{sch.subject}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{studentMap[sch.student_id]?.name || '—'}</TableCell>
                      <TableCell className="text-xs">{teacherMap[sch.teacher_id] || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{sch.deadline_date}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_MAP[sch.status]?.variant || 'outline'} className="text-xs">
                          {STATUS_MAP[sch.status]?.label || sch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sch.status === 'pending' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(sch.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5" /> 내신 특강 일정 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Schedule Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">과목</Label>
                <Select value={formSubject} onValueChange={setFormSubject}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">담당 선생님</Label>
                <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">수업 날짜</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">시작 시간</Label>
                <Input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">종료 시간</Label>
                <Input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 확인 마지노선 날짜
              </Label>
              <Input type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">이 날짜가 지나면 미확인 학생의 일정이 자동 확정됩니다.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">설명 (선택)</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="특강 내용, 준비물 등"
                rows={2}
              />
            </div>

            {/* Student Picker */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> 학생 선택 ({selectedStudents.length}명)
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="학생 이름 검색..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <div className="border rounded-lg max-h-[200px] overflow-y-auto p-2 space-y-0.5">
                {filteredStudentsForPicker.map(s => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm hover:bg-accent/50 transition-colors ${
                      selectedStudents.includes(s.id) ? 'bg-primary/10 font-medium' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(s.id)}
                      onChange={() => toggleStudent(s.id)}
                      className="rounded"
                    />
                    <span>{s.name}</span>
                    {s.grade && <span className="text-xs text-muted-foreground">{s.grade}</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-1">
                  <AlertTriangle className="w-4 h-4" /> 시간 충돌 감지
                </div>
                <ul className="text-xs text-destructive/80 space-y-0.5 pl-6 list-disc">
                  {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving || selectedStudents.length === 0}>
              {saving ? '저장 중...' : `${selectedStudents.length}명 일정 등록`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
