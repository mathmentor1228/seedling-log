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
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, addDays, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Loader2, Plus, Trash2, Settings, Users, CalendarPlus, RefreshCw } from 'lucide-react';

const SUBJECTS = ['수학', '영어', '국어', '과학', '기타'];
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

interface Teacher {
  id: string;
  full_name: string;
}

interface Routine {
  id: string;
  teacher_id: string;
  subject: string;
  day_of_week: number;
  test_time: string | null;
  test_type: string;
  content_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RoutineStudent {
  id: string;
  routine_id: string;
  student_id: string;
}

export function TestRoutineManager() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineStudents, setRoutineStudents] = useState<RoutineStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formSubject, setFormSubject] = useState('수학');
  const [formDay, setFormDay] = useState(1);
  const [formTime, setFormTime] = useState('');
  const [formType, setFormType] = useState('guerrilla');
  const [formContent, setFormContent] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');

  // Student assignment dialog
  const [studentDialogRoutine, setStudentDialogRoutine] = useState<Routine | null>(null);
  const [assignedStudentIds, setAssignedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  // Generate dialog
  const [generateRoutine, setGenerateRoutine] = useState<Routine | null>(null);
  const [genWeeks, setGenWeeks] = useState(4);
  const [genStartDate, setGenStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [generating, setGenerating] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) fetchData();
  }, [user?.id]);

  async function fetchData() {
    setLoading(true);
    try {
      const [routinesRes, routineStudentsRes, studentsRes] = await Promise.all([
        supabase.from('test_routines').select('*').order('day_of_week'),
        supabase.from('test_routine_students').select('*'),
        supabase.from('students').select('id, name, grade, school').eq('enrollment_status', '재원').order('name'),
      ]);
      
      let teachersData: Teacher[] = [];
      if (isAdmin) {
        const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
        teachersData = data || [];
      }
      
      let routinesData = routinesRes.data || [];
      // For teachers, filter to own routines
      if (!isAdmin && role !== 'assistant') {
        routinesData = routinesData.filter((r: any) => r.teacher_id === user!.id);
      }
      setRoutines(routinesData as Routine[]);
      setRoutineStudents((routineStudentsRes.data || []) as RoutineStudent[]);
      setStudents(studentsRes.data || []);
      if (isAdmin) {
        setTeachers(teachersData);
      }
    } catch (err) {
      console.error('Failed to fetch routine data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRoutine() {
    const teacherId = isAdmin ? formTeacherId : user!.id;
    if (!teacherId) {
      toast.error('선생님을 선택해주세요');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('test_routines').insert({
        teacher_id: teacherId,
        subject: formSubject,
        day_of_week: formDay,
        test_time: formTime || null,
        test_type: formType,
        content_template: formContent.trim() || null,
      });
      if (error) throw error;
      toast.success('시험 루틴이 생성되었습니다');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error('생성 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormSubject('수학');
    setFormDay(1);
    setFormTime('');
    setFormType('guerrilla');
    setFormContent('');
    setFormTeacherId('');
  }

  async function handleToggleActive(routine: Routine) {
    try {
      const { error } = await supabase.from('test_routines')
        .update({ is_active: !routine.is_active, updated_at: new Date().toISOString() })
        .eq('id', routine.id);
      if (error) throw error;
      setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, is_active: !r.is_active } : r));
    } catch (err: any) {
      toast.error('변경 실패: ' + err.message);
    }
  }

  async function handleDeleteRoutine() {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('test_routines').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('루틴이 삭제되었습니다');
      setDeleteId(null);
      fetchData();
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message);
    }
  }

  // Student assignment
  function openStudentDialog(routine: Routine) {
    const assigned = routineStudents
      .filter(rs => rs.routine_id === routine.id)
      .map(rs => rs.student_id);
    setAssignedStudentIds(new Set(assigned));
    setStudentDialogRoutine(routine);
    setStudentSearch('');
    setGradeFilter('all');
  }

  async function handleSaveStudents() {
    if (!studentDialogRoutine) return;
    setSaving(true);
    try {
      const routineId = studentDialogRoutine.id;
      // Delete existing
      await supabase.from('test_routine_students').delete().eq('routine_id', routineId);
      // Insert new
      if (assignedStudentIds.size > 0) {
        const rows = Array.from(assignedStudentIds).map(sid => ({
          routine_id: routineId,
          student_id: sid,
        }));
        const { error } = await supabase.from('test_routine_students').insert(rows);
        if (error) throw error;
      }
      toast.success(`${assignedStudentIds.size}명 배정 완료`);
      setStudentDialogRoutine(null);
      fetchData();
    } catch (err: any) {
      toast.error('학생 배정 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // Generate schedules
  async function handleGenerate() {
    if (!generateRoutine) return;
    setGenerating(true);
    try {
      const routineId = generateRoutine.id;
      const studentIds = routineStudents
        .filter(rs => rs.routine_id === routineId)
        .map(rs => rs.student_id);

      if (studentIds.length === 0) {
        toast.error('배정된 학생이 없습니다. 먼저 학생을 배정해주세요.');
        setGenerating(false);
        return;
      }

      // Calculate dates for the target day_of_week within the range
      const start = new Date(genStartDate);
      const targetDay = generateRoutine.day_of_week;
      const dates: string[] = [];

      // Find the first occurrence of targetDay on or after start
      let current = new Date(start);
      const currentDow = getDay(current);
      const diff = (targetDay - currentDow + 7) % 7;
      current = addDays(current, diff);

      for (let w = 0; w < genWeeks; w++) {
        dates.push(format(addDays(current, w * 7), 'yyyy-MM-dd'));
      }

      // Create test_schedules entries (skip duplicates)
      const rows = dates.flatMap(date =>
        studentIds.map(sid => ({
          student_id: sid,
          teacher_id: generateRoutine.teacher_id,
          test_date: date,
          test_time: generateRoutine.test_time,
          subject: generateRoutine.subject,
          test_type: generateRoutine.test_type,
          content: generateRoutine.content_template || null,
        }))
      );

      if (rows.length === 0) {
        toast.error('생성할 일정이 없습니다');
        setGenerating(false);
        return;
      }

      const { error } = await supabase.from('test_schedules').insert(rows);
      if (error) throw error;

      toast.success(`${dates.length}주 × ${studentIds.length}명 = ${rows.length}건 일정 생성 완료`);
      setGenerateRoutine(null);
    } catch (err: any) {
      toast.error('일정 생성 실패: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  function getTeacherName(teacherId: string) {
    const t = teachers.find(t => t.id === teacherId);
    return t?.full_name || '나';
  }

  function getStudentCount(routineId: string) {
    return routineStudents.filter(rs => rs.routine_id === routineId).length;
  }

  const filteredStudents = students.filter(s => {
    if (studentSearch && !s.name.includes(studentSearch)) return false;
    if (gradeFilter !== 'all' && !(s.grade || '').includes(gradeFilter)) return false;
    return true;
  });

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">시험 루틴 설정</h3>
          <p className="text-xs text-muted-foreground">특정 요일/시간에 반복되는 시험 일정을 자동 생성합니다</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-3.5 h-3.5" />
          루틴 추가
        </Button>
      </div>

      {routines.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Settings className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">등록된 시험 루틴이 없습니다</p>
            <p className="text-xs mt-1">루틴을 추가하면 특정 요일/시간에 학생들의 시험 일정을 자동으로 생성할 수 있습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {routines.map(routine => {
            const studentCount = getStudentCount(routine.id);
            return (
              <Card key={routine.id} className={!routine.is_active ? 'opacity-50' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{routine.subject}</Badge>
                        <Badge className="text-xs">{DAY_LABELS[routine.day_of_week]}요일</Badge>
                        {routine.test_time && (
                          <Badge variant="secondary" className="text-xs font-mono">
                            {routine.test_time.slice(0, 5)}
                          </Badge>
                        )}
                        <Badge variant={routine.test_type === 'guerrilla' ? 'default' : 'secondary'} className="text-[10px]">
                          {routine.test_type === 'guerrilla' ? '게릴라' : '정기'}
                        </Badge>
                        {isAdmin && (
                          <span className="text-xs text-muted-foreground">
                            ({getTeacherName(routine.teacher_id)})
                          </span>
                        )}
                      </div>
                      {routine.content_template && (
                        <p className="text-xs text-muted-foreground truncate max-w-md">
                          📋 {routine.content_template}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{studentCount}명 배정</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Switch
                        checked={routine.is_active}
                        onCheckedChange={() => handleToggleActive(routine)}
                        className="scale-75"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => openStudentDialog(routine)}
                      >
                        <Users className="w-3 h-3" />
                        학생
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setGenerateRoutine(routine);
                          setGenWeeks(4);
                          setGenStartDate(format(new Date(), 'yyyy-MM-dd'));
                        }}
                        disabled={!routine.is_active || studentCount === 0}
                      >
                        <CalendarPlus className="w-3 h-3" />
                        일정생성
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteId(routine.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Routine Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              시험 루틴 추가
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isAdmin && (
              <div>
                <Label className="text-xs">담당 선생님</Label>
                <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="선생님 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">과목</Label>
                <Select value={formSubject} onValueChange={setFormSubject}>
                  <SelectTrigger className="h-9 text-sm">
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
                <Label className="text-xs">요일</Label>
                <Select value={String(formDay)} onValueChange={v => setFormDay(Number(v))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>{label}요일</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시험 시간 (선택)</Label>
                <Input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">시험 유형</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guerrilla">게릴라</SelectItem>
                    <SelectItem value="regular">정기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">기본 시험 내용/범위 (선택)</Label>
              <Input
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="예: 3단원 복습"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button size="sm" onClick={handleCreateRoutine} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Assignment Dialog */}
      <Dialog open={!!studentDialogRoutine} onOpenChange={open => { if (!open) setStudentDialogRoutine(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              학생 배정 — {studentDialogRoutine?.subject} {DAY_LABELS[studentDialogRoutine?.day_of_week || 0]}요일
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="학생 검색"
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {['중1','중2','중3','고1','고2','고3'].map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Checkbox
                checked={filteredStudents.length > 0 && filteredStudents.every(s => assignedStudentIds.has(s.id))}
                onCheckedChange={() => {
                  const allSelected = filteredStudents.every(s => assignedStudentIds.has(s.id));
                  const next = new Set(assignedStudentIds);
                  filteredStudents.forEach(s => {
                    if (allSelected) next.delete(s.id);
                    else next.add(s.id);
                  });
                  setAssignedStudentIds(next);
                }}
              />
              <span className="text-xs text-muted-foreground">전체 선택 ({assignedStudentIds.size}명 선택됨)</span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2">
              {filteredStudents.map(s => (
                <label key={s.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded cursor-pointer">
                  <Checkbox
                    checked={assignedStudentIds.has(s.id)}
                    onCheckedChange={() => {
                      const next = new Set(assignedStudentIds);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      setAssignedStudentIds(next);
                    }}
                  />
                  <span className="text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{s.grade || '-'}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStudentDialogRoutine(null)}>취소</Button>
            <Button size="sm" onClick={handleSaveStudents} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Dialog */}
      <Dialog open={!!generateRoutine} onOpenChange={open => { if (!open) setGenerateRoutine(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <CalendarPlus className="w-4 h-4" />
              일정 자동 생성
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>{generateRoutine?.subject}</strong> — {DAY_LABELS[generateRoutine?.day_of_week || 0]}요일
              {generateRoutine?.test_time && ` ${generateRoutine.test_time.slice(0, 5)}`}
              {' / '}
              {getStudentCount(generateRoutine?.id || '')}명
            </p>
            <div>
              <Label className="text-xs">시작일</Label>
              <Input
                type="date"
                value={genStartDate}
                onChange={e => setGenStartDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">생성 주수</Label>
              <Select value={String(genWeeks)} onValueChange={v => setGenWeeks(Number(v))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 6, 8].map(w => (
                    <SelectItem key={w} value={String(w)}>{w}주</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGenerateRoutine(null)}>취소</Button>
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              생성하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>루틴을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 루틴과 배정된 학생 정보가 삭제됩니다. 이미 생성된 시험 일정은 영향받지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoutine}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
