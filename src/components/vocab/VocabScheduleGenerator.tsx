import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Loader2, Wand2, Trash2, RefreshCw } from 'lucide-react';

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
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');

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
      scheduleCount: countMap[s.student_id] || 0,
    }));

    // Build teacher name map for display
    const teacherIds = new Set(infos.map(i => i.teacherId));
    if (teacherIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(teacherIds));
      const map: Record<string, string> = {};
      (profiles || []).forEach(p => { map[p.id] = p.full_name; });
      setTeacherMap(map);
    }

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
    const allDays = eachDayOfInterval({ start: startOfMonth(target), end: endOfMonth(target) });

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

  // Filter by teacher category
  const displayInfos = selectedTeacher === 'all'
    ? studentInfos
    : studentInfos.filter(s => {
        const tName = teacherMap[s.teacherId] || '';
        if (selectedTeacher === 'seo') return tName.includes('서미정');
        if (selectedTeacher === 'kim') return tName.includes('김민희');
        return false;
      });

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
    </div>
  );
}
