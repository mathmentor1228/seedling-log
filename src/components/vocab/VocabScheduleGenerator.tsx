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
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Loader2, Wand2, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: `${i + 1}월`,
}));

const DAY_CODE_TO_JS: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const DAY_LABELS: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토',
};

function normalizeTestDays(testDays: string[]): string[] {
  if (!testDays || testDays.length === 0) return ['mon', 'wed'];
  const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  if (testDays.every(d => ALL_DAYS.includes(d))) return testDays;
  const combo = testDays[0];
  const COMBO_MAP: Record<string, string[]> = {
    mon_wed: ['mon', 'wed'], tue_thu: ['tue', 'thu'],
    mon_wed_fri: ['mon', 'wed', 'fri'], tue_thu_fri: ['tue', 'thu', 'fri'],
    mon_tue_wed_thu: ['mon', 'tue', 'wed', 'thu'],
    mon_tue_wed_thu_fri: ['mon', 'tue', 'wed', 'thu', 'fri'],
    mon: ['mon'], tue: ['tue'], wed: ['wed'], thu: ['thu'], fri: ['fri'], sat: ['sat'],
  };
  return COMBO_MAP[combo] || ['mon', 'wed'];
}

interface StudentScheduleInfo {
  settingId: string;
  studentId: string;
  studentName: string;
  grade: string | null;
  bookName: string;
  testDays: string[];
  currentDay: number;
  daysPerTest: number;
  bundleDays: boolean;
  totalDays: number | null;
  teacherId: string;
  assignedTeacher: string | null;
  scheduleCount: number;
  expectedTestCount: number;
}

interface IndividualSchedule {
  id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  schedule_type: string;
}

export function VocabScheduleGenerator() {
  const { user, role } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth()));
  const [studentInfos, setStudentInfos] = useState<StudentScheduleInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');

  // Expanded rows for individual schedule management
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [studentSchedules, setStudentSchedules] = useState<Record<string, IndividualSchedule[]>>({});
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [loadingSchedules, setLoadingSchedules] = useState<Set<string>>(new Set());
  const [deletingIndividual, setDeletingIndividual] = useState(false);

  const TEACHER_CATEGORIES = [
    { label: '김다빈', key: 'seo' },
    { label: '김민희', key: 'kim' },
  ];

  const [deleteMode, setDeleteMode] = useState<'selected' | 'all' | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const [deleteSettingId, setDeleteSettingId] = useState<string | null>(null);
  const [deleteSettingName, setDeleteSettingName] = useState('');
  const [deletingSettings, setDeletingSettings] = useState(false);
  const [bulkDeleteSettings, setBulkDeleteSettings] = useState(false);

  // Individual schedule delete confirmation
  const [showIndividualDeleteDialog, setShowIndividualDeleteDialog] = useState(false);

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
    const target = new Date(Number(year), Number(month), 1);

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

    const countMap: Record<string, number> = {};
    for (const s of schedules) {
      countMap[s.student_id] = (countMap[s.student_id] || 0) + 1;
    }

    // Estimate expected test count for the month
    const allMonthDays = eachDayOfInterval({ start: startOfMonth(target), end: endOfMonth(target) });

    const infos: StudentScheduleInfo[] = settings.map((s: any) => {
      const daysCodes = normalizeTestDays(s.test_days || ['mon', 'wed']);
      const allowedDays = daysCodes.map(d => DAY_CODE_TO_JS[d]).filter(Boolean);
      const expectedTestCount = allMonthDays.filter(d => allowedDays.includes(getDay(d))).length;

      return {
        settingId: s.id,
        studentId: s.student_id,
        studentName: s.students?.name || '—',
        grade: s.students?.grade || null,
        bookName: s.book_name,
        testDays: s.test_days || ['mon', 'wed'],
        currentDay: s.current_day_number,
        daysPerTest: s.days_per_test,
        bundleDays: s.bundle_days || false,
        totalDays: s.total_days || null,
        teacherId: s.teacher_id,
        assignedTeacher: s.assigned_teacher || null,
        scheduleCount: countMap[s.student_id] || 0,
        expectedTestCount,
      };
    });

    setStudentInfos(infos);
    setSelectedIds(new Set());
    setExpandedStudents(new Set());
    setSelectedScheduleIds(new Set());
    setStudentSchedules({});
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

    const deleteFrom = format(rangeStart > startOfMonth(target) ? rangeStart : startOfMonth(target), 'yyyy-MM-dd');
    for (const info of targetSettings) {
      const { data: existingIds } = await supabase
        .from('vocab_schedules')
        .select('id')
        .eq('student_id', info.studentId)
        .eq('schedule_type', 'regular')
        .gte('test_date', deleteFrom)
        .lte('test_date', end);

      if (existingIds && existingIds.length > 0) {
        await supabase.from('vocab_test_results').delete().in('schedule_id', existingIds.map(s => s.id));
        await supabase.from('vocab_schedules').delete().in('id', existingIds.map(s => s.id));
      }
    }

    const inserts: any[] = [];
    const skippedStudents: string[] = [];
    for (const info of targetSettings) {
      const daysCodes = normalizeTestDays(info.testDays);
      const allowedDays = daysCodes.map(d => DAY_CODE_TO_JS[d]).filter(Boolean);
      const testDates = allDays.filter(d => allowedDays.includes(getDay(d)));

      let dayNumber = info.currentDay;
      const { data: lastSched } = await supabase
        .from('vocab_schedules')
        .select('day_number')
        .eq('setting_id', info.settingId)
        .lt('test_date', deleteFrom)
        .order('day_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSched) {
        dayNumber = lastSched.day_number + (info.bundleDays ? info.daysPerTest : 1);
      }

      for (const testDate of testDates) {
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

  const confirmDeleteSetting = async () => {
    setDeletingSettings(true);
    try {
      const targetIds = bulkDeleteSettings
        ? Array.from(selectedIds).map(sid => studentInfos.find(s => s.studentId === sid)?.settingId).filter(Boolean) as string[]
        : deleteSettingId ? [deleteSettingId] : [];

      if (targetIds.length === 0) return;

      for (const settingId of targetIds) {
        const { data: schedIds } = await supabase
          .from('vocab_schedules')
          .select('id')
          .eq('setting_id', settingId);

        if (schedIds && schedIds.length > 0) {
          await supabase.from('vocab_test_results').delete().in('schedule_id', schedIds.map(s => s.id));
          await supabase.from('vocab_schedules').delete().in('id', schedIds.map(s => s.id));
        }

        await supabase.from('vocab_settings').delete().eq('id', settingId);
      }

      toast.success(`${targetIds.length}개 설정이 삭제되었습니다`);
      setDeleteSettingId(null);
      setBulkDeleteSettings(false);
      await fetchStudentScheduleInfo();
    } catch (err: any) {
      toast.error('설정 삭제 실패: ' + err.message);
    } finally {
      setDeletingSettings(false);
    }
  };

  // --- Individual schedule management ---
  const toggleExpand = async (studentId: string) => {
    const next = new Set(expandedStudents);
    if (next.has(studentId)) {
      next.delete(studentId);
      // Clear selected schedule ids for this student
      const studentScheds = studentSchedules[studentId] || [];
      setSelectedScheduleIds(prev => {
        const n = new Set(prev);
        studentScheds.forEach(s => n.delete(s.id));
        return n;
      });
    } else {
      next.add(studentId);
      if (!studentSchedules[studentId]) {
        await fetchIndividualSchedules(studentId);
      }
    }
    setExpandedStudents(next);
  };

  const fetchIndividualSchedules = async (studentId: string) => {
    const { start, end } = getMonthRange();
    setLoadingSchedules(prev => new Set(prev).add(studentId));
    const { data } = await supabase
      .from('vocab_schedules')
      .select('id, test_date, day_number, book_name, schedule_type')
      .eq('student_id', studentId)
      .gte('test_date', start)
      .lte('test_date', end)
      .order('test_date')
      .order('day_number');

    const schedIds = (data || []).map(s => s.id);
    let resultMap: Record<string, { passed: boolean }> = {};
    if (schedIds.length > 0) {
      const { data: resultsData } = await supabase
        .from('vocab_test_results')
        .select('schedule_id, passed')
        .in('schedule_id', schedIds);
      if (resultsData) {
        for (const r of resultsData) resultMap[r.schedule_id] = { passed: r.passed };
      }
    }

    setStudentSchedules(prev => ({
      ...prev,
      [studentId]: (data || []).map(s => ({ ...s, result: resultMap[s.id] || null })) as any,
    }));
    setLoadingSchedules(prev => {
      const n = new Set(prev);
      n.delete(studentId);
      return n;
    });
  };

  const toggleScheduleSelect = (schedId: string) => {
    setSelectedScheduleIds(prev => {
      const next = new Set(prev);
      if (next.has(schedId)) next.delete(schedId);
      else next.add(schedId);
      return next;
    });
  };

  const toggleSelectAllSchedulesForStudent = (studentId: string) => {
    const scheds = studentSchedules[studentId] || [];
    const allSelected = scheds.every(s => selectedScheduleIds.has(s.id));
    setSelectedScheduleIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        scheds.forEach(s => next.delete(s.id));
      } else {
        scheds.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  const confirmDeleteIndividualSchedules = async () => {
    setDeletingIndividual(true);
    try {
      const ids = Array.from(selectedScheduleIds);
      if (ids.length === 0) return;

      // Delete results then schedules
      await supabase.from('vocab_test_results').delete().in('schedule_id', ids);
      await supabase.from('vocab_schedules').delete().in('id', ids);

      toast.success(`${ids.length}건의 스케줄이 삭제되었습니다`);
      setSelectedScheduleIds(new Set());
      setShowIndividualDeleteDialog(false);

      // Refresh expanded students' schedules and counts
      const affectedStudents = new Set<string>();
      for (const [studentId, scheds] of Object.entries(studentSchedules)) {
        if (scheds.some(s => ids.includes(s.id))) {
          affectedStudents.add(studentId);
        }
      }
      await fetchStudentScheduleInfo();
      // Re-fetch for still-expanded students
      for (const sid of affectedStudents) {
        if (expandedStudents.has(sid)) {
          await fetchIndividualSchedules(sid);
        }
      }
    } catch (err: any) {
      toast.error('삭제 실패: ' + err.message);
    } finally {
      setDeletingIndividual(false);
    }
  };

  const displayInfos = selectedTeacher === 'all'
    ? studentInfos
    : studentInfos.filter(s => s.assignedTeacher === selectedTeacher);

  const allSelected = displayInfos.length > 0 && displayInfos.every(s => selectedIds.has(s.studentId));
  const someSelected = selectedIds.size > 0;

  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

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
              선택 스케줄 삭제
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={() => openDeleteConfirm('all')}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              전체 스케줄 삭제
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deletingSettings || !someSelected}
              onClick={() => {
                setBulkDeleteSettings(true);
                setDeleteSettingId(null);
                setDeleteSettingName(`선택된 ${selectedIds.size}명`);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              선택 설정 삭제
            </Button>
          </div>

          {/* Individual schedule delete button */}
          {selectedScheduleIds.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-md border border-destructive/20">
              <Badge variant="destructive" className="text-xs">
                {selectedScheduleIds.size}건 선택됨
              </Badge>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowIndividualDeleteDialog(true)}
                disabled={deletingIndividual}
              >
                {deletingIndividual ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                선택 스케줄 개별 삭제
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedScheduleIds(new Set())}
              >
                선택 해제
              </Button>
            </div>
          )}
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
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayInfos.map(info => {
                const isExpanded = expandedStudents.has(info.studentId);
                const scheds = studentSchedules[info.studentId] || [];
                const isLoadingScheds = loadingSchedules.has(info.studentId);
                const studentSchedIds = scheds.map(s => s.id);
                const allSchedsSelected = scheds.length > 0 && scheds.every(s => selectedScheduleIds.has(s.id));

                return (
                  <>
                    <TableRow key={info.studentId}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(info.studentId)}
                          onCheckedChange={() => toggleSelect(info.studentId)}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {info.assignedTeacher === 'seo' ? '김다빈' : info.assignedTeacher === 'kim' ? '김민희' : '—'}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {info.studentName}
                        {info.grade && <span className="text-xs text-muted-foreground ml-1">({info.grade})</span>}
                      </TableCell>
                      <TableCell className="text-sm">{info.bookName}</TableCell>
                      <TableCell className="text-center text-xs">{normalizeTestDays(info.testDays).map(d => DAY_LABELS[d] || d).join('/')}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs font-mono">Day {info.currentDay}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs font-mono">
                        {info.totalDays ? `${info.totalDays}일` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {info.scheduleCount > 0 ? (
                          <div className="space-y-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              onClick={() => toggleExpand(info.studentId)}
                            >
                              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <Badge variant="outline" className="text-xs">{info.scheduleCount}건</Badge>
                            </Button>
                            <Progress
                              value={info.expectedTestCount > 0 ? Math.min(100, (info.scheduleCount / info.expectedTestCount) * 100) : 0}
                              className="h-1.5"
                            />
                            <span className="text-[9px] text-muted-foreground">{info.scheduleCount}/{info.expectedTestCount}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">없음</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => {
                            setDeleteSettingId(info.settingId);
                            setDeleteSettingName(info.studentName);
                            setBulkDeleteSettings(false);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {/* Expanded individual schedules */}
                    {isExpanded && (
                      <TableRow key={`${info.studentId}-expanded`}>
                        <TableCell colSpan={9} className="p-0">
                          <div className="bg-muted/30 border-t px-4 py-2">
                            {isLoadingScheds ? (
                              <div className="flex items-center gap-2 py-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-xs text-muted-foreground">로딩...</span>
                              </div>
                            ) : scheds.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">스케줄이 없습니다.</p>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={allSchedsSelected}
                                    onCheckedChange={() => toggleSelectAllSchedulesForStudent(info.studentId)}
                                  />
                                  <span className="text-[10px] font-semibold text-muted-foreground">전체 선택</span>
                                  {studentSchedIds.some(id => selectedScheduleIds.has(id)) && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {studentSchedIds.filter(id => selectedScheduleIds.has(id)).length}건 선택
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 overflow-x-auto">
                                  {scheds.map(sched => {
                                    const d = new Date(sched.test_date + 'T00:00:00');
                                    const dayName = DAY_NAMES[d.getDay()];
                                    const isSelected = selectedScheduleIds.has(sched.id);
                                    const result = (sched as any).result;
                                    const chipColor = isSelected
                                      ? 'bg-destructive/10 border-destructive/40 text-destructive'
                                      : result
                                        ? result.passed
                                          ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-700'
                                          : 'bg-destructive/10 border-destructive/30 text-destructive'
                                        : 'bg-muted/50 border-border text-foreground hover:bg-accent/50';
                                    return (
                                      <label
                                        key={sched.id}
                                        className={cn(
                                          'inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs cursor-pointer transition-colors whitespace-nowrap',
                                          chipColor
                                        )}
                                      >
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => toggleScheduleSelect(sched.id)}
                                          className="h-3 w-3"
                                        />
                                        <span className="font-mono">
                                          {format(d, 'M/d')}({dayName})
                                        </span>
                                        <span className="opacity-70">Day{sched.day_number}</span>
                                        {result && (
                                          <span className="text-[9px] font-semibold">
                                            {result.passed ? '✓' : '✗'}
                                          </span>
                                        )}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delete confirmation (bulk by student) */}
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

      {/* Setting delete confirmation */}
      <AlertDialog open={!!deleteSettingId || bulkDeleteSettings} onOpenChange={(open) => { if (!open) { setDeleteSettingId(null); setBulkDeleteSettings(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>설정 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteSettingName}</strong>의 단어 시험 설정을 삭제하시겠습니까?
              <span className="block mt-1 text-destructive">⚠️ 해당 학생의 모든 스케줄과 시험 결과가 함께 삭제됩니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSetting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              설정 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Individual schedule delete confirmation */}
      <AlertDialog open={showIndividualDeleteDialog} onOpenChange={setShowIndividualDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>개별 스케줄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <strong>{selectedScheduleIds.size}건</strong>의 스케줄을 삭제하시겠습니까?
              <span className="block mt-1 text-destructive">⚠️ 연결된 시험 결과도 함께 삭제됩니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteIndividualSchedules}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingIndividual && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
