import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Loader2, Wand2, Trash2, RefreshCw, Plus } from 'lucide-react';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: `${i + 1}월`,
}));

const DAY_MAP: Record<string, number[]> = {
  mon_wed: [1, 3],
  tue_thu: [2, 4],
};

const TEST_DAY_LABELS: Record<string, string> = {
  mon_wed: '월/수',
  tue_thu: '화/목',
};

interface StudentScheduleInfo {
  settingId: string;
  studentId: string;
  studentName: string;
  grade: string | null;
  bookName: string;
  testDays: string;
  currentDay: number;
  daysPerTest: number;
  bundleDays: boolean;
  totalDays: number | null;
  teacherId: string;
  assignedTeacher: string | null;
  scheduleCount: number;
}

export function VocabScheduleGenerator() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth()));
  const [studentInfos, setStudentInfos] = useState<StudentScheduleInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');

  // Guerrilla test dialog
  const [guerrillaOpen, setGuerrillaOpen] = useState(false);
  const [guerrillaStudentId, setGuerrillaStudentId] = useState('');
  const [guerrillaDate, setGuerrillaDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [guerrillaDayStart, setGuerrillaDayStart] = useState(1);
  const [guerrillaDayEnd, setGuerrillaDayEnd] = useState(1);
  const [guerrillaSaving, setGuerrillaSaving] = useState(false);

  // Hardcoded teacher categories
  const TEACHER_CATEGORIES = [
    { label: '서미정', key: 'seo' },
    { label: '김민희', key: 'kim' },
  ];

  // Delete confirmation
  const [deleteMode, setDeleteMode] = useState<'selected' | 'all' | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchStudentScheduleInfo();
  }, [year, month]);

  const getMonthRange = () => {
    const target = new Date(Number(year), Number(month), 1);
    return {
      start: format(startOfMonth(target), 'yyyy-MM-dd'),
      end: format(endOfMonth(target), 'yyyy-MM-dd'),
    };
  };

  const fetchStudentScheduleInfo = async () => {
    setLoading(true);
    const { start, end } = getMonthRange();

    const [settingsRes, schedulesRes] = await Promise.all([
      supabase
        .from('vocab_settings')
        .select('*, students(name, grade)')
        .eq('is_active', true)
        .order('created_at'),
      supabase
        .from('vocab_schedules')
        .select('id, student_id')
        .gte('test_date', start)
        .lte('test_date', end),
    ]);

    const settings = settingsRes.data || [];
    const schedules = schedulesRes.data || [];

    // Count schedules per student
    const countMap: Record<string, number> = {};
    for (const s of schedules) {
      countMap[s.student_id] = (countMap[s.student_id] || 0) + 1;
    }

    const infos: StudentScheduleInfo[] = settings.map((s: any) => ({
      settingId: s.id,
      studentId: s.student_id,
      studentName: s.students?.name || '—',
      grade: s.students?.grade || null,
      bookName: s.book_name,
      testDays: s.test_days?.[0] || 'mon_wed',
      currentDay: s.current_day_number,
      daysPerTest: s.days_per_test,
      bundleDays: s.bundle_days || false,
      totalDays: s.total_days || null,
      teacherId: s.teacher_id,
      assignedTeacher: s.assigned_teacher || null,
      scheduleCount: countMap[s.student_id] || 0,
    }));

    setStudentInfos(infos);
    setSelectedIds(new Set());
    setLoading(false);
  };

  const toggleSelect = (studentId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const displayIds = displayInfos.map(s => s.studentId);
    const allChecked = displayIds.every(id => selectedIds.has(id));
    if (allChecked) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        displayIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        displayIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const generateForStudents = async (targetStudentIds: string[]) => {
    setGenerating(true);
    const { start, end } = getMonthRange();
    const target = new Date(Number(year), Number(month), 1);
    const rangeStart = startDate ? new Date(startDate) : startOfMonth(target);
    const allDays = eachDayOfInterval({ start: rangeStart > startOfMonth(target) ? rangeStart : startOfMonth(target), end: endOfMonth(target) });

    const targetSettings = studentInfos.filter(s => targetStudentIds.includes(s.studentId));

    // Delete existing regular schedules for these students in this month
    for (const info of targetSettings) {
      const { data: existingIds } = await supabase
        .from('vocab_schedules')
        .select('id')
        .eq('student_id', info.studentId)
        .eq('schedule_type', 'regular')
        .gte('test_date', start)
        .lte('test_date', end);

      if (existingIds && existingIds.length > 0) {
        await supabase.from('vocab_test_results').delete().in('schedule_id', existingIds.map(s => s.id));
        await supabase.from('vocab_schedules').delete().in('id', existingIds.map(s => s.id));
      }
    }

    // Generate new schedules
    const inserts: any[] = [];
    const skippedStudents: string[] = [];
    for (const info of targetSettings) {
      const allowedDays = DAY_MAP[info.testDays] || [1, 3];
      const testDates = allDays.filter(d => allowedDays.includes(getDay(d)));
      let dayNumber = info.currentDay;

      for (const testDate of testDates) {
        // Check total_days cap
        if (info.totalDays && dayNumber > info.totalDays) {
          if (!skippedStudents.includes(info.studentName)) skippedStudents.push(info.studentName);
          break;
        }

        if (info.bundleDays) {
          inserts.push({
            student_id: info.studentId,
            setting_id: info.settingId,
            test_date: format(testDate, 'yyyy-MM-dd'),
            day_number: dayNumber,
            book_name: info.bookName,
            schedule_type: 'regular',
          });
          dayNumber += info.daysPerTest;
        } else {
          for (let i = 0; i < info.daysPerTest; i++) {
            if (info.totalDays && dayNumber > info.totalDays) break;
            inserts.push({
              student_id: info.studentId,
              setting_id: info.settingId,
              test_date: format(testDate, 'yyyy-MM-dd'),
              day_number: dayNumber,
              book_name: info.bookName,
              schedule_type: 'regular',
            });
            dayNumber++;
          }
        }
      }
    }

    if (inserts.length === 0) {
      toast.info('생성할 스케줄이 없습니다');
      setGenerating(false);
      return;
    }

    const { error } = await supabase.from('vocab_schedules').insert(inserts);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${inserts.length}건의 스케줄이 생성되었습니다`);
      if (skippedStudents.length > 0) {
        toast.info(`${skippedStudents.join(', ')} — 총 일차 초과로 일부 스케줄 제외`);
      }
    }
    await fetchStudentScheduleInfo();
    setGenerating(false);
  };

  const openDeleteConfirm = async (mode: 'selected' | 'all') => {
    const { start, end } = getMonthRange();
    const targetIds = mode === 'all'
      ? studentInfos.map(s => s.studentId)
      : Array.from(selectedIds);

    if (targetIds.length === 0) {
      toast.info('학생을 선택해주세요');
      return;
    }

    const { data } = await supabase
      .from('vocab_schedules')
      .select('id')
      .in('student_id', targetIds)
      .gte('test_date', start)
      .lte('test_date', end);

    if (!data || data.length === 0) {
      toast.info('삭제할 스케줄이 없습니다');
      return;
    }

    setDeleteCount(data.length);
    setDeleteMode(mode);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const { start, end } = getMonthRange();
    const targetIds = deleteMode === 'all'
      ? studentInfos.map(s => s.studentId)
      : Array.from(selectedIds);

    const { data: schedIds } = await supabase
      .from('vocab_schedules')
      .select('id')
      .in('student_id', targetIds)
      .gte('test_date', start)
      .lte('test_date', end);

    if (schedIds && schedIds.length > 0) {
      await supabase.from('vocab_test_results').delete().in('schedule_id', schedIds.map(s => s.id));
      await supabase.from('vocab_schedules').delete().in('id', schedIds.map(s => s.id));
    }

    toast.success(`${deleteCount}건의 스케줄이 삭제되었습니다`);
    setDeleteMode(null);
    setDeleting(false);
    await fetchStudentScheduleInfo();
  };

  // Filter by teacher category using assigned_teacher field
  const displayInfos = selectedTeacher === 'all'
    ? studentInfos
    : studentInfos.filter(s => s.assignedTeacher === selectedTeacher);

  const allSelected = displayInfos.length > 0 && displayInfos.every(s => selectedIds.has(s.studentId));
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Wand2 className="w-4 h-4" />
            스케줄 생성 / 삭제
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">년도</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(now.getFullYear())}>{now.getFullYear()}</SelectItem>
                  <SelectItem value={String(now.getFullYear() + 1)}>{now.getFullYear() + 1}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">월</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={fetchStudentScheduleInfo} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <div className="space-y-1.5">
              <Label className="text-xs">선생님</Label>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="선생님" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {TEACHER_CATEGORIES.map(t => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-[150px]"
                placeholder="미입력 시 월초"
              />
              {startDate && (
                <p className="text-[10px] text-muted-foreground">{startDate}부터 생성</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              disabled={generating || !someSelected}
              onClick={() => generateForStudents(Array.from(selectedIds))}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
              선택 학생 생성
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={generating}
              onClick={() => generateForStudents(studentInfos.map(s => s.studentId))}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
              전체 생성
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleting || !someSelected}
              onClick={() => openDeleteConfirm('selected')}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              선택 삭제
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={() => openDeleteConfirm('all')}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              전체 삭제
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGuerrillaOpen(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              게릴라 시험 추가
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Student list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : studentInfos.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            활성화된 학생 설정이 없습니다. '학생 설정' 탭에서 먼저 추가해주세요.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                </TableHead>
                <TableHead>선생님</TableHead>
                <TableHead>학생</TableHead>
                <TableHead>교재</TableHead>
                <TableHead className="text-center">요일</TableHead>
                <TableHead className="text-center">시작 DAY</TableHead>
                <TableHead className="text-center">총 일차</TableHead>
                <TableHead className="text-center">{Number(month) + 1}월 스케줄</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayInfos.map(info => (
                <TableRow key={info.studentId}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(info.studentId)}
                      onCheckedChange={() => toggleSelect(info.studentId)}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {info.assignedTeacher === 'seo' ? '서미정' : info.assignedTeacher === 'kim' ? '김민희' : '—'}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {info.studentName}
                    {info.grade && <span className="text-xs text-muted-foreground ml-1">({info.grade})</span>}
                  </TableCell>
                  <TableCell className="text-sm">{info.bookName}</TableCell>
                  <TableCell className="text-center text-xs">{TEST_DAY_LABELS[info.testDays] || info.testDays}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs font-mono">Day {info.currentDay}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono">
                    {info.totalDays ? `${info.totalDays}일` : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {info.scheduleCount > 0 ? (
                      <Badge variant="outline" className="text-xs">{info.scheduleCount}건</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">없음</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteMode} onOpenChange={(open) => !open && setDeleteMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스케줄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === 'all' ? '전체' : `선택된 ${selectedIds.size}명`} 학생의 {Number(month) + 1}월 스케줄 <strong>{deleteCount}건</strong>을 삭제하시겠습니까?
              <span className="block mt-1 text-destructive">⚠️ 연결된 시험 결과도 함께 삭제됩니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Guerrilla test dialog */}
      <Dialog open={guerrillaOpen} onOpenChange={(o) => { setGuerrillaOpen(o); if (!o) { setGuerrillaStudentId(''); setGuerrillaDayStart(1); setGuerrillaDayEnd(1); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>게릴라 시험 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">학생</Label>
              <Select value={guerrillaStudentId} onValueChange={(v) => {
                setGuerrillaStudentId(v);
                const info = studentInfos.find(s => s.studentId === v);
                if (info) { setGuerrillaDayStart(info.currentDay); setGuerrillaDayEnd(info.currentDay); }
              }}>
                <SelectTrigger><SelectValue placeholder="학생 선택" /></SelectTrigger>
                <SelectContent>
                  {studentInfos.map(s => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.studentName} {s.grade ? `(${s.grade})` : ''} — {s.bookName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">시험 날짜</Label>
              <Input type="date" value={guerrillaDate} onChange={e => setGuerrillaDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">시작 DAY</Label>
                <Input type="number" min={1} value={guerrillaDayStart} onChange={e => {
                  const v = Number(e.target.value);
                  setGuerrillaDayStart(v);
                  if (v > guerrillaDayEnd) setGuerrillaDayEnd(v);
                }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">끝 DAY</Label>
                <Input type="number" min={guerrillaDayStart} value={guerrillaDayEnd} onChange={e => setGuerrillaDayEnd(Number(e.target.value))} />
              </div>
            </div>
            {guerrillaDayStart !== guerrillaDayEnd && (
              <p className="text-xs text-muted-foreground">Day {guerrillaDayStart}~{guerrillaDayEnd} ({guerrillaDayEnd - guerrillaDayStart + 1}개 DAY) 시험이 등록됩니다</p>
            )}
            <Button
              className="w-full"
              disabled={guerrillaSaving || !guerrillaStudentId || !guerrillaDate}
              onClick={async () => {
                setGuerrillaSaving(true);
                const info = studentInfos.find(s => s.studentId === guerrillaStudentId);
                if (!info) { toast.error('학생 정보를 찾을 수 없습니다'); setGuerrillaSaving(false); return; }
                if (info.totalDays && guerrillaDayEnd > info.totalDays) {
                  toast.error(`총 일차(${info.totalDays})를 초과할 수 없습니다`);
                  setGuerrillaSaving(false);
                  return;
                }
                const inserts = [];
                for (let d = guerrillaDayStart; d <= guerrillaDayEnd; d++) {
                  inserts.push({
                    student_id: info.studentId,
                    setting_id: info.settingId,
                    test_date: guerrillaDate,
                    day_number: d,
                    book_name: info.bookName,
                    schedule_type: 'guerrilla',
                  });
                }
                const { error } = await supabase.from('vocab_schedules').insert(inserts);
                if (error) { toast.error(error.message); }
                else {
                  const label = guerrillaDayStart === guerrillaDayEnd
                    ? `Day ${guerrillaDayStart}`
                    : `Day ${guerrillaDayStart}~${guerrillaDayEnd}`;
                  toast.success(`게릴라 시험 추가 완료 (${label})`);
                  setGuerrillaOpen(false);
                  setGuerrillaStudentId('');
                  fetchStudentScheduleInfo();
                }
                setGuerrillaSaving(false);
              }}
            >
              {guerrillaSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
