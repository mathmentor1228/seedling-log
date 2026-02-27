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
import { Loader2, Plus, Trash2, Calendar, FileText, ArrowUpDown, RotateCcw, Pencil } from 'lucide-react';

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
  result_score: string | null;
  result_passed: boolean | null;
  result_notes: string | null;
  result_recorded_at: string | null;
  result_recorded_by: string | null;
  students?: { name: string; grade: string | null; school: string | null } | null;
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
  const [editingSchedule, setEditingSchedule] = useState<TestSchedule | null>(null);

  // Form state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [testDate, setTestDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [testTime, setTestTime] = useState('');
  const [subject, setSubject] = useState('수학');
  const [testType, setTestType] = useState('guerrilla');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');

  // Filter & Sort
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('upcoming'); // upcoming | past7 | past30 | all
  const [sortBy, setSortBy] = useState<'date' | 'student' | 'time'>('date');
  const [studentSearch, setStudentSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [resultClearId, setResultClearId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch teachers for filter
      const { data: teacherData } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setTeachers(teacherData || []);

      // Get teacher's students
      let studentQuery = supabase.from('students').select('id, name, grade, school').eq('enrollment_status', '재원').order('name');
      
      // If teacher (not admin), filter to own students
      if (role === 'teacher') {
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

      // Get all schedules (no date filter - filtered in UI)
      let scheduleQuery = supabase
        .from('test_schedules')
        .select('*, students(name, grade, school)')
        .order('test_date', { ascending: false });

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

  async function handleClearResult() {
    if (!resultClearId) return;
    try {
      const { error } = await supabase.from('test_schedules').update({
        result_score: null,
        result_passed: null,
        result_notes: null,
        result_recorded_at: null,
        result_recorded_by: null,
      }).eq('id', resultClearId);
      if (error) throw error;
      toast.success('시험 결과가 삭제되었습니다');
      setResultClearId(null);
      fetchData();
    } catch (err: any) {
      toast.error('결과 삭제 실패: ' + err.message);
    }
  }

  function openEdit(sch: TestSchedule) {
    setEditingSchedule(sch);
    setTestDate(sch.test_date);
    setTestTime(sch.test_time?.slice(0, 5) || '');
    setSubject(sch.subject);
    setTestType(sch.test_type);
    setContent(sch.content || '');
    setNotes(sch.notes || '');
    setDialogOpen(true);
  }

  async function handleUpdate() {
    if (!editingSchedule) return;
    if (!content.trim()) {
      toast.error('시험 내용/범위를 입력해주세요');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('test_schedules').update({
        test_date: testDate,
        test_time: testTime || null,
        subject,
        test_type: testType,
        content: content.trim(),
        notes: notes.trim() || null,
      }).eq('id', editingSchedule.id);
      if (error) throw error;
      toast.success('시험 일정이 수정되었습니다');
      setDialogOpen(false);
      setEditingSchedule(null);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error('수정 실패: ' + err.message);
    } finally {
      setSaving(false);
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

  const getStudentGradeGroup = (sch: TestSchedule) => {
    const st = (sch.students as any);
    if (!st?.grade) return null;
    const grade = st.grade as string;
    // Direct match (e.g., grade already contains "중1")
    for (const g of ['중1','중2','중3','고1','고2','고3','초1','초2','초3','초4','초5','초6']) {
      if (grade.includes(g)) return g;
    }
    // Infer from school name + grade year (e.g., school="신길중", grade="2학년" → "중2")
    const yearMatch = grade.match(/(\d)/);
    if (yearMatch) {
      const year = yearMatch[1];
      const school = (st.school || '') as string;
      if (school.includes('중')) return `중${year}`;
      if (school.includes('고')) return `고${year}`;
      if (school.includes('초')) return `초${year}`;
    }
    return null;
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const filteredSchedules = schedules
    .filter(s => {
      // Period filter
      if (filterPeriod === 'upcoming') return s.test_date >= todayStr;
      if (filterPeriod === 'past7') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        return s.test_date >= format(d, 'yyyy-MM-dd') && s.test_date < todayStr;
      }
      if (filterPeriod === 'past30') {
        const d = new Date(); d.setDate(d.getDate() - 30);
        return s.test_date >= format(d, 'yyyy-MM-dd') && s.test_date < todayStr;
      }
      return true; // 'all'
    })
    .filter(s => filterSubject === 'all' || s.subject === filterSubject)
    .filter(s => filterTeacher === 'all' || s.teacher_id === filterTeacher)
    .filter(s => {
      if (filterGrade === 'all') return true;
      return getStudentGradeGroup(s) === filterGrade;
    })
    .sort((a, b) => {
      if (sortBy === 'student') {
        const na = (a.students as any)?.name || '';
        const nb = (b.students as any)?.name || '';
        return na.localeCompare(nb, 'ko');
      }
      if (sortBy === 'time') {
        return (a.test_time || '99:99').localeCompare(b.test_time || '99:99');
      }
      return a.test_date.localeCompare(b.test_date);
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
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">예정된 시험</SelectItem>
              <SelectItem value="past7">지난 7일</SelectItem>
              <SelectItem value="past30">지난 30일</SelectItem>
              <SelectItem value="all">전체 기간</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 과목</SelectItem>
              {SUBJECTS.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterGrade} onValueChange={setFilterGrade}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 학년</SelectItem>
              {['중1','중2','중3','고1','고2','고3'].map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {role === 'admin' && (
          <Select value={filterTeacher} onValueChange={setFilterTeacher}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 선생님</SelectItem>
              {teachers.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">날짜순</SelectItem>
              <SelectItem value="student">이름순</SelectItem>
              <SelectItem value="time">시간순</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs">
            {filteredSchedules.length}건
          </Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setEditingSchedule(null); setDialogOpen(true); }}>
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
                  {role === 'admin' && <TableHead className="text-xs w-16">선생님</TableHead>}
                  <TableHead className="text-xs w-16">학생</TableHead>
                  <TableHead className="text-xs w-14">학년</TableHead>
                  <TableHead className="text-xs">내용</TableHead>
                  <TableHead className="text-xs w-20">결과</TableHead>
                  <TableHead className="text-xs w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchedules.map(sch => {
                  const hasResult = sch.result_score != null || sch.result_passed != null;
                  const isPast = sch.test_date < todayStr;
                  return (
                    <TableRow key={sch.id} className={isPast ? 'opacity-60' : ''}>
                      <TableCell className="text-xs font-mono">{sch.test_date.slice(5)}</TableCell>
                      <TableCell className="text-xs">{sch.test_time?.slice(0, 5) || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{sch.subject}</Badge>
                      </TableCell>
                      {role === 'admin' && (
                        <TableCell className="text-xs text-muted-foreground">
                          {teachers.find(t => t.id === sch.teacher_id)?.full_name || '-'}
                        </TableCell>
                      )}
                      <TableCell className="text-xs font-medium">
                        {(sch.students as any)?.name || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getStudentGradeGroup(sch) || (sch.students as any)?.grade || '-'}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[160px]" title={sch.content || ''}>
                        {sch.content || '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {hasResult ? (
                          <span className={sch.result_passed ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                            {sch.result_score || (sch.result_passed ? '합격' : '불합격')}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="수정" onClick={() => openEdit(sch)}>
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        {hasResult && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="결과 삭제" onClick={() => setResultClearId(sch.id)}>
                            <RotateCcw className="w-3.5 h-3.5 text-orange-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="삭제" onClick={() => setDeleteId(sch.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingSchedule(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {editingSchedule ? '시험 일정 수정' : '시험 일정 등록'}
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

            {/* Student Selection - hide in edit mode */}
            {!editingSchedule && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">대상 학생 *</Label>
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={selectAll}>
                  {selectedStudents.size === students.length ? '전체 해제' : '전체 선택'}
                </Button>
              </div>
              <Input
                placeholder="이름 검색..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="text-sm mb-2"
              />
              <div className="flex gap-1 flex-wrap mb-2">
                {['all', '중1', '중2', '중3', '고1', '고2', '고3'].map(g => (
                  <Button
                    key={g}
                    variant={gradeFilter === g ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setGradeFilter(g)}
                  >
                    {g === 'all' ? '전체' : g}
                  </Button>
                ))}
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                {(() => {
                  const GRADE_GROUPS = ['중1', '중2', '중3', '고1', '고2', '고3'];
                  const getGradeGroup = (grade: string | null, school: string | null) => {
                    if (!grade) return null;
                    for (const g of GRADE_GROUPS) {
                      if (grade.includes(g)) return g;
                    }
                    if (school) {
                      const level = school.includes('중') ? '중' : school.includes('고') ? '고' : null;
                      if (level) {
                        const yearMatch = grade.match(/(\d)/);
                        if (yearMatch) return `${level}${yearMatch[1]}`;
                      }
                    }
                    return null;
                  };

                  let filtered = students.filter(s => {
                    if (studentSearch && !s.name.includes(studentSearch)) return false;
                    if (gradeFilter !== 'all') {
                      const group = getGradeGroup(s.grade, s.school);
                      if (group !== gradeFilter) return false;
                    }
                    return true;
                  });

                  if (gradeFilter === 'all' && !studentSearch) {
                    // Group by grade
                    const grouped: Record<string, Student[]> = {};
                    const ungrouped: Student[] = [];
                    for (const s of filtered) {
                      const g = getGradeGroup(s.grade, s.school);
                      if (g) {
                        if (!grouped[g]) grouped[g] = [];
                        grouped[g].push(s);
                      } else {
                        ungrouped.push(s);
                      }
                    }
                    return (
                      <>
                        {GRADE_GROUPS.map(g => grouped[g] && (
                          <div key={g}>
                            <p className="text-[10px] font-semibold text-muted-foreground px-1 pt-1">{g}</p>
                            {grouped[g].map(s => (
                              <label key={s.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer">
                                <Checkbox checked={selectedStudents.has(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                                <span className="text-sm">{s.name}</span>
                                {s.grade && <span className="text-xs text-muted-foreground">{s.grade}</span>}
                              </label>
                            ))}
                          </div>
                        ))}
                        {ungrouped.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground px-1 pt-1">기타</p>
                            {ungrouped.map(s => (
                              <label key={s.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer">
                                <Checkbox checked={selectedStudents.has(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                                <span className="text-sm">{s.name}</span>
                                {s.grade && <span className="text-xs text-muted-foreground">{s.grade}</span>}
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  }

                  return filtered.map(s => (
                    <label key={s.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer">
                      <Checkbox checked={selectedStudents.has(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                      <span className="text-sm">{s.name}</span>
                      {s.grade && <span className="text-xs text-muted-foreground">{s.grade}</span>}
                    </label>
                  ));
                })()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedStudents.size}명 선택됨
              </p>
            </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={editingSchedule ? handleUpdate : handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {editingSchedule ? '수정' : '등록'}
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

      {/* Clear Result Confirm */}
      <AlertDialog open={!!resultClearId} onOpenChange={() => setResultClearId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험 결과 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 시험의 결과 데이터(점수, 합격여부, 비고)를 삭제하시겠습니까? 일정 자체는 유지됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearResult}>결과 삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
