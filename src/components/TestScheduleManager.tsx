import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2, Plus, Trash2, Calendar, FileText } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

interface TestSchedule {
  id: string;
  student_id: string;
  teacher_id: string;
  test_date: string;
  test_time: string | null;
  subject: string;
  test_type: string;
  content: string | null;
  notes: string | null;
  created_at: string;
  students?: { name: string; grade: string | null } | null;
}

const SUBJECTS = ['수학', '영어', '국어', '과학', '기타'];

export function TestScheduleManager() {
  const { user, role } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<TestSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [testDate, setTestDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [testTime, setTestTime] = useState('');
  const [subject, setSubject] = useState('수학');
  const [testType, setTestType] = useState('guerrilla');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');

  // Filter
  const [filterSubject, setFilterSubject] = useState<string>('all');

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  async function fetchData() {
    setLoading(true);
    try {
      // Get teacher's students
      let studentQuery = supabase.from('students').select('id, name, grade, school').eq('enrollment_status', '재원').order('name');
      
      // If teacher (not admin), filter to own students
      if (role === 'teacher') {
        // Gather student IDs from all ownership sources
        const [sstRes, csRes, lrRes] = await Promise.all([
          supabase.from('student_subject_teachers').select('student_id').eq('teacher_id', user!.id),
          supabase.from('class_students').select('student_id, classes!inner(teacher_id)').eq('classes.teacher_id', user!.id),
          supabase.from('lesson_records').select('student_id').eq('teacher_id', user!.id),
        ]);
        
        const idSet = new Set<string>();
        (sstRes.data || []).forEach(r => idSet.add(r.student_id));
        (csRes.data || []).forEach(r => idSet.add(r.student_id));
        (lrRes.data || []).forEach(r => idSet.add(r.student_id));
        
        const studentIds = Array.from(idSet);
        if (studentIds.length > 0) {
          studentQuery = studentQuery.in('id', studentIds);
        } else {
          setStudents([]);
          setSchedules([]);
          setLoading(false);
          return;
        }
      }

      const { data: studentsData } = await studentQuery;
      setStudents(studentsData || []);

      // Get existing schedules
      let scheduleQuery = supabase
        .from('test_schedules')
        .select('*, students(name, grade)')
        .gte('test_date', format(new Date(), 'yyyy-MM-dd'))
        .order('test_date');

      if (role === 'teacher') {
        scheduleQuery = scheduleQuery.eq('teacher_id', user!.id);
      }

      const { data: schedulesData } = await scheduleQuery;
      setSchedules((schedulesData as any[]) || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSelectedStudents(new Set());
    setTestDate(format(new Date(), 'yyyy-MM-dd'));
    setTestTime('');
    setSubject('수학');
    setTestType('guerrilla');
    setContent('');
    setNotes('');
  }

  async function handleSave() {
    if (selectedStudents.size === 0) {
      toast.error('대상 학생을 선택해주세요');
      return;
    }
    if (!content.trim()) {
      toast.error('시험 내용/범위를 입력해주세요');
      return;
    }

    setSaving(true);
    try {
      const rows = Array.from(selectedStudents).map(studentId => ({
        student_id: studentId,
        teacher_id: user!.id,
        test_date: testDate,
        test_time: testTime || null,
        subject,
        test_type: testType,
        content: content.trim(),
        notes: notes.trim() || null,
      }));

      const { error } = await supabase.from('test_schedules').insert(rows);
      if (error) throw error;

      toast.success(`${selectedStudents.size}명의 시험 일정이 등록되었습니다`);
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error('저장 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('test_schedules').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('삭제되었습니다');
      setDeleteId(null);
      fetchData();
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message);
    }
  }

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudents(next);
  };

  const selectAll = () => {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map(s => s.id)));
    }
  };

  const filteredSchedules = filterSubject === 'all'
    ? schedules
    : schedules.filter(s => s.subject === filterSubject);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">불러오는 중...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {SUBJECTS.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs">
            {filteredSchedules.length}건
          </Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-3.5 h-3.5" />
          시험 등록
        </Button>
      </div>

      {/* Schedules Table */}
      {filteredSchedules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">등록된 시험 일정이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-20">날짜</TableHead>
                  <TableHead className="text-xs w-14">시간</TableHead>
                  <TableHead className="text-xs w-14">과목</TableHead>
                  <TableHead className="text-xs w-16">학생</TableHead>
                  <TableHead className="text-xs">내용</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchedules.map(sch => (
                  <TableRow key={sch.id}>
                    <TableCell className="text-xs font-mono">{sch.test_date.slice(5)}</TableCell>
                    <TableCell className="text-xs">{sch.test_time?.slice(0, 5) || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{sch.subject}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {(sch.students as any)?.name || '-'}
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[160px]" title={sch.content || ''}>
                      {sch.content || '-'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(sch.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              시험 일정 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시험 날짜 *</Label>
                <Input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">시험 시간</Label>
                <Input type="time" value={testTime} onChange={e => setTestTime(e.target.value)} className="text-sm" />
              </div>
            </div>

            {/* Subject & Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">과목 *</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">유형</Label>
                <Select value={testType} onValueChange={setTestType}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guerrilla">게릴라</SelectItem>
                    <SelectItem value="regular">정규</SelectItem>
                    <SelectItem value="retest">재시험</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Content */}
            <div>
              <Label className="text-xs">시험 내용/범위 *</Label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="예: p.50~60, 1단원 복습, 기출 20문제 등"
                className="text-sm"
                rows={2}
              />
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="선택사항" className="text-sm" />
            </div>

            {/* Student Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">대상 학생 *</Label>
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={selectAll}>
                  {selectedStudents.size === students.length ? '전체 해제' : '전체 선택'}
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                {students.map(s => (
                  <label key={s.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={selectedStudents.has(s.id)}
                      onCheckedChange={() => toggleStudent(s.id)}
                    />
                    <span className="text-sm">{s.name}</span>
                    {s.grade && <span className="text-xs text-muted-foreground">{s.grade}</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedStudents.size}명 선택됨
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험 일정 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 시험 일정을 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
