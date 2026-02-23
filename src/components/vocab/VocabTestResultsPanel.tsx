import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle2, XCircle, CalendarDays, ClipboardList, Clock, Trash2, FileText, ArrowRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface Schedule {
  id: string;
  student_id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  schedule_type: string;
  setting_id: string;
  test_time: string | null;
  students?: { name: string; grade: string | null };
}

interface GeneralTestSchedule {
  id: string;
  student_id: string;
  test_date: string;
  subject: string;
  test_type: string;
  content: string | null;
  notes: string | null;
  teacher_id: string;
  test_time: string | null;
  result_score: string | null;
  result_passed: boolean | null;
  result_notes: string | null;
  result_recorded_by: string | null;
  result_recorded_at: string | null;
  students?: { name: string; grade: string | null };
}

interface TestResult {
  id: string;
  schedule_id: string;
  student_id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  total_words: number | null;
  correct_words: number | null;
  score_percent: number | null;
  passed: boolean;
  retest_scheduled: boolean;
  retest_date: string | null;
  retest_time: string | null;
  notes: string | null;
}

interface VocabSettingInfo {
  days_per_test: number;
  bundle_days: boolean;
  teacher_id: string;
}

interface Teacher {
  id: string;
  full_name: string;
}

export function VocabTestResultsPanel() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [generalSchedules, setGeneralSchedules] = useState<GeneralTestSchedule[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [settingsMap, setSettingsMap] = useState<Record<string, VocabSettingInfo>>({});
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // General test result input
  const [generalResultOpen, setGeneralResultOpen] = useState(false);
  const [activeGeneralTest, setActiveGeneralTest] = useState<GeneralTestSchedule | null>(null);
  const [generalScore, setGeneralScore] = useState('');
  const [generalPassed, setGeneralPassed] = useState<boolean | null>(null);
  const [generalNotes, setGeneralNotes] = useState('');

  // Result input dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [totalWords, setTotalWords] = useState<number>(0);
  const [correctWords, setCorrectWords] = useState<number>(0);
  const [resultNotes, setResultNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncToLesson, setSyncToLesson] = useState(false);
  const [isOralTest, setIsOralTest] = useState(false);
  const [oralPassed, setOralPassed] = useState(true);

  // Retest dialog
  const [retestDialogOpen, setRetestDialogOpen] = useState(false);
  const [retestResult, setRetestResult] = useState<TestResult | null>(null);
  const [retestDate, setRetestDate] = useState<Date | undefined>();
  const [retestTime, setRetestTime] = useState('');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  // Postpone dialog
  const [postponeTarget, setPostponeTarget] = useState<Schedule | null>(null);
  const [postponeDate, setPostponeDate] = useState<Date | undefined>();
  const [postponeSaving, setPostponeSaving] = useState(false);

  useEffect(() => {
    fetchSchedulesAndResults();
  }, [selectedDate]);

  // All failed results needing retest (not limited to current month)
  const [allFailedResults, setAllFailedResults] = useState<TestResult[]>([]);
  const [allFailedSchedules, setAllFailedSchedules] = useState<Schedule[]>([]);

  const fetchSchedulesAndResults = async () => {
    setLoading(true);
    const startOfMonth = format(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), 'yyyy-MM-dd');
    const endOfMonth = format(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0), 'yyyy-MM-dd');

    const [schedRes, resRes, settingsRes, generalRes, allFailedRes] = await Promise.all([
      supabase
        .from('vocab_schedules')
        .select('*, students(name, grade)')
        .gte('test_date', startOfMonth)
        .lte('test_date', endOfMonth)
        .order('test_date'),
      supabase
        .from('vocab_test_results')
        .select('*')
        .gte('test_date', startOfMonth)
        .lte('test_date', endOfMonth)
        .order('test_date'),
      supabase
        .from('vocab_settings')
        .select('id, days_per_test, bundle_days, teacher_id'),
      supabase
        .from('test_schedules')
        .select('*, students(name, grade)')
        .gte('test_date', startOfMonth)
        .lte('test_date', endOfMonth)
        .order('test_date'),
      // Fetch ALL failed results that still need retest scheduling (regardless of month)
      supabase
        .from('vocab_test_results')
        .select('*')
        .eq('passed', false)
        .eq('retest_scheduled', false)
        .order('test_date', { ascending: false }),
    ]);

    if (schedRes.data) setSchedules(schedRes.data as any);
    if (resRes.data) setResults(resRes.data as any);
    if (generalRes.data) setGeneralSchedules(generalRes.data as any);

    // Fetch schedules for all failed results (to get student names)
    if (allFailedRes.data && allFailedRes.data.length > 0) {
      setAllFailedResults(allFailedRes.data as any);
      const scheduleIds = [...new Set(allFailedRes.data.map((r: any) => r.schedule_id))];
      const { data: failedScheds } = await supabase
        .from('vocab_schedules')
        .select('*, students(name, grade)')
        .in('id', scheduleIds);
      if (failedScheds) setAllFailedSchedules(failedScheds as any);
    } else {
      setAllFailedResults([]);
      setAllFailedSchedules([]);
    }

    if (settingsRes.data) {
      const map: Record<string, VocabSettingInfo> = {};
      const teacherIds = new Set<string>();
      for (const s of settingsRes.data) {
        map[s.id] = {
          days_per_test: s.days_per_test,
          bundle_days: (s as any).bundle_days || false,
          teacher_id: s.teacher_id,
        };
        teacherIds.add(s.teacher_id);
      }
      // Also collect teacher IDs from general schedules
      if (generalRes.data) {
        for (const g of generalRes.data) {
          teacherIds.add(g.teacher_id);
        }
      }
      setSettingsMap(map);

      // Fetch teacher names
      if (teacherIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(teacherIds));
        if (profiles) setTeachers(profiles);
      }
    }

    setLoading(false);
  };

  // Filter schedules by teacher
  const filteredSchedules = selectedTeacher === 'all'
    ? schedules
    : schedules.filter(s => {
        const setting = settingsMap[s.setting_id];
        return setting?.teacher_id === selectedTeacher;
      });

  const filteredGeneralSchedules = selectedTeacher === 'all'
    ? generalSchedules
    : generalSchedules.filter(s => s.teacher_id === selectedTeacher);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const todaySchedules = filteredSchedules.filter(s => s.test_date === dateStr);
  const todayGeneralSchedules = filteredGeneralSchedules.filter(s => s.test_date === dateStr);
  const filteredResults = selectedTeacher === 'all'
    ? results
    : results.filter(r => {
        const sched = schedules.find(s => s.id === r.schedule_id);
        if (!sched) return false;
        const setting = settingsMap[sched.setting_id];
        return setting?.teacher_id === selectedTeacher;
      });

  const getResult = (scheduleId: string) => results.find(r => r.schedule_id === scheduleId);

  // Save general test result
  const handleSaveGeneralResult = async () => {
    if (!activeGeneralTest || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from('test_schedules')
      .update({
        result_score: generalScore || null,
        result_passed: generalPassed,
        result_notes: generalNotes || null,
        result_recorded_by: user.id,
        result_recorded_at: new Date().toISOString(),
      })
      .eq('id', activeGeneralTest.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('결과 저장 완료');
      setGeneralResultOpen(false);
      fetchSchedulesAndResults();
    }
    setSaving(false);
  };

  const formatDayLabel = (sched: Schedule) => {
    const setting = settingsMap[sched.setting_id];
    if (setting?.bundle_days && setting.days_per_test > 1) {
      const endDay = sched.day_number + setting.days_per_test - 1;
      return `Day ${sched.day_number}~${endDay}`;
    }
    return `Day ${sched.day_number}`;
  };

  const openResultInput = (sched: Schedule) => {
    const existing = getResult(sched.id);
    setActiveSchedule(sched);
    const existingNotes = existing?.notes || '';
    const wasOral = existingNotes.startsWith('[구두테스트]');
    setIsOralTest(wasOral);
    setOralPassed(existing ? existing.passed : true);
    setTotalWords(existing?.total_words || 0);
    setCorrectWords(existing?.correct_words || 0);
    setResultNotes(wasOral ? existingNotes.replace('[구두테스트] ', '') : existingNotes);
    setSyncToLesson(false);
    setDialogOpen(true);
  };

  const handleSaveResult = async () => {
    if (!activeSchedule || !user) return;
    setSaving(true);

    let scorePercent: number;
    let passed: boolean;
    let finalTotalWords: number | null;
    let finalCorrectWords: number | null;
    let finalNotes: string | null;

    if (isOralTest) {
      passed = oralPassed;
      scorePercent = oralPassed ? 100 : 0;
      finalTotalWords = null;
      finalCorrectWords = null;
      finalNotes = `[구두테스트] ${resultNotes}`.trim();
    } else {
      const { data: setting } = await supabase
        .from('vocab_settings')
        .select('cutline_percent')
        .eq('student_id', activeSchedule.student_id)
        .single();

      const cutline = setting?.cutline_percent || 80;
      scorePercent = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;
      passed = scorePercent >= cutline;
      finalTotalWords = totalWords;
      finalCorrectWords = correctWords;
      finalNotes = resultNotes || null;
    }

    const existing = getResult(activeSchedule.id);
    const payload = {
      schedule_id: activeSchedule.id,
      student_id: activeSchedule.student_id,
      test_date: activeSchedule.test_date,
      day_number: activeSchedule.day_number,
      book_name: activeSchedule.book_name,
      total_words: finalTotalWords,
      correct_words: finalCorrectWords,
      score_percent: scorePercent,
      passed,
      recorded_by: user.id,
      notes: finalNotes,
    };

    let error;
    if (existing) {
      ({ error } = await supabase.from('vocab_test_results').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('vocab_test_results').insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`결과 저장 완료 — ${passed ? '통과 ✓' : '불통과 ✗'}`);
      if (!passed) {
        toast.info('불통과 — 재시험 일정을 잡아주세요');
      }

      // Sync to lesson_records if requested
      if (syncToLesson && activeSchedule) {
        const dayLabel = formatDayLabel(activeSchedule);
        const testContent = `${activeSchedule.book_name} ${dayLabel}`;
        const testResultText = `${correctWords}/${totalWords} (${scorePercent}%)`;

        // Check if there's already a lesson record for this student on this date
        const { data: existingLesson } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', activeSchedule.student_id)
          .eq('lesson_date', activeSchedule.test_date)
          .eq('subject', '영어')
          .limit(1)
          .maybeSingle();

        if (existingLesson) {
          // Update existing lesson record's test fields
          await supabase
            .from('lesson_records')
            .update({
              test_title: '단어시험',
              test_content: testContent,
              test_result: passed ? 'pass' : 'fail',
              test_result_text: testResultText,
              english_pass_fail: passed ? 'pass' : 'fail',
            })
            .eq('id', existingLesson.id);
          toast.success('기존 수업일지에 테스트 결과 연동 완료');
        } else {
          // Create new lesson record as '테스트방문' type
          const { error: lessonErr } = await supabase
            .from('lesson_records')
            .insert({
              student_id: activeSchedule.student_id,
              teacher_id: user!.id,
              subject: '영어' as any,
              lesson_date: activeSchedule.test_date,
              lesson_range: testContent,
              homework_status: 'none_assigned',
              test_title: '단어시험',
              test_content: testContent,
              test_result: passed ? 'pass' : 'fail',
              test_result_text: testResultText,
              english_pass_fail: passed ? 'pass' : 'fail',
              lesson_types: ['테스트방문'],
              submitted: true,
              submitted_at: new Date().toISOString(),
              notes: resultNotes || null,
            });
          if (lessonErr) {
            toast.error(`수업일지 생성 실패: ${lessonErr.message}`);
          } else {
            toast.success('새 수업일지(테스트방문) 생성 완료');
          }
        }
      }

      setDialogOpen(false);
      fetchSchedulesAndResults();
    }
    setSaving(false);
  };

  const openRetestDialog = (result: TestResult) => {
    setRetestResult(result);
    setRetestDate(undefined);
    setRetestTime('');
    setConflictWarning(null);
    setRetestDialogOpen(true);
  };

  // Check for schedule conflicts when retest date changes
  const checkRetestConflict = async (date: Date) => {
    setRetestDate(date);
    setConflictWarning(null);
    if (!retestResult) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    const { data: existing } = await supabase
      .from('vocab_schedules')
      .select('*, students(name)')
      .eq('student_id', retestResult.student_id)
      .eq('test_date', dateStr);

    if (existing && existing.length > 0) {
      const types = existing.map((e: any) => e.schedule_type === 'retest' ? '재시험' : '정규시험').join(', ');
      setConflictWarning(`이 날짜에 이미 ${existing.length}건의 시험(${types})이 있습니다. 그래도 등록하시겠습니까?`);
    }
  };

  // Delete a schedule
  const handleDeleteSchedule = async () => {
    if (!deleteTarget) return;
    setSaving(true);

    // Also delete any results linked to this schedule
    await supabase.from('vocab_test_results').delete().eq('schedule_id', deleteTarget.id);
    const { error } = await supabase.from('vocab_schedules').delete().eq('id', deleteTarget.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('스케줄이 삭제되었습니다');
      fetchSchedulesAndResults();
    }
    setDeleteTarget(null);
    setSaving(false);
  };

  const handlePostpone = async () => {
    if (!postponeTarget || !postponeDate) return;
    setPostponeSaving(true);
    const newDate = format(postponeDate, 'yyyy-MM-dd');
    const { error } = await supabase
      .from('vocab_schedules')
      .update({ test_date: newDate })
      .eq('id', postponeTarget.id);

    const existingResult = getResult(postponeTarget.id);
    if (!error && existingResult) {
      await supabase
        .from('vocab_test_results')
        .update({ test_date: newDate })
        .eq('id', existingResult.id);
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`시험이 ${newDate}로 변경되었습니다`);
      setPostponeTarget(null);
      fetchSchedulesAndResults();
    }
    setPostponeSaving(false);
  };

  const handleScheduleRetest = async () => {
    if (!retestResult || !retestDate || !retestTime) return;
    setSaving(true);

    const { error: updateErr } = await supabase
      .from('vocab_test_results')
      .update({
        retest_scheduled: true,
        retest_date: format(retestDate, 'yyyy-MM-dd'),
        retest_time: retestTime,
        retest_requested_at: new Date().toISOString(),
      })
      .eq('id', retestResult.id);

    if (updateErr) {
      toast.error(updateErr.message);
      setSaving(false);
      return;
    }

    const { error: insertErr } = await supabase.from('vocab_schedules').insert({
      student_id: retestResult.student_id,
      setting_id: (await supabase.from('vocab_settings').select('id').eq('student_id', retestResult.student_id).single()).data?.id || '',
      test_date: format(retestDate, 'yyyy-MM-dd'),
      test_time: retestTime,
      day_number: retestResult.day_number,
      book_name: retestResult.book_name,
      schedule_type: 'retest',
    });

    if (insertErr) {
      toast.error(insertErr.message);
    } else {
      toast.success('재시험 일정이 등록되었습니다');
      setRetestDialogOpen(false);
      fetchSchedulesAndResults();
    }
    setSaving(false);
  };

  // Dates with schedules (for calendar highlighting)
  const scheduleDates = [...new Set([
    ...filteredSchedules.map(s => s.test_date),
    ...filteredGeneralSchedules.map(s => s.test_date),
  ])];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold">시험 일정 & 결과</h2>
          <p className="text-xs text-muted-foreground mt-0.5">날짜를 선택하면 해당일 시험 목록이 표시됩니다</p>
        </div>
        {teachers.length > 1 && (
          <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="담당 선생님" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {teachers.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
        {/* Calendar */}
        <Card className="w-fit">
          <CardContent className="p-2">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              locale={ko}
              modifiers={{
                hasSchedule: scheduleDates.map(d => new Date(d + 'T00:00:00')),
              }}
              modifiersClassNames={{
                hasSchedule: 'bg-primary/10 font-semibold text-primary',
              }}
            />
          </CardContent>
        </Card>

        {/* Today's schedules */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {format(selectedDate, 'M월 d일 (EEE)', { locale: ko })} 시험
            </span>
            <Badge variant="secondary" className="text-xs">{todaySchedules.length + todayGeneralSchedules.length}건</Badge>
          </div>

          {todaySchedules.length === 0 && todayGeneralSchedules.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                해당 날짜에 예정된 시험이 없습니다
              </CardContent>
            </Card>
          ) : (<>
            {todaySchedules.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>교재</TableHead>
                    <TableHead className="text-center">DAY</TableHead>
                     <TableHead className="text-center">유형</TableHead>
                     <TableHead className="text-center">시간</TableHead>
                     <TableHead className="text-center">결과</TableHead>
                     <TableHead className="text-center">결석</TableHead>
                     <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todaySchedules.map(sched => {
                    const result = getResult(sched.id);
                    return (
                      <TableRow key={sched.id}>
                        <TableCell className="font-medium text-sm">
                          {(sched as any).students?.name || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{sched.book_name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono text-xs">{formatDayLabel(sched)}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={sched.schedule_type === 'retest' ? 'destructive' : 'outline'} className="text-xs">
                            {sched.schedule_type === 'retest' ? '재시험' : '정규'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono text-muted-foreground">
                          {sched.test_time ? sched.test_time.slice(0, 5) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {result ? (
                            result.notes?.startsWith('[구두테스트]') ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-xs">🗣️</span>
                                {result.passed ? (
                                  <Badge variant="outline" className="text-xs text-success border-success/30">Pass</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-destructive border-destructive/30">Non-Pass</Badge>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                {result.passed ? (
                                  <CheckCircle2 className="w-4 h-4 text-success" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-destructive" />
                                )}
                                <span className="text-xs font-mono">{result.score_percent}%</span>
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">미입력</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {(sched as any).absence_reason ? (
                            <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                              {(sched as any).absence_reason}
                            </Badge>
                          ) : !result ? (
                            <Select
                              value=""
                              onValueChange={async (val) => {
                                await supabase.from('vocab_schedules').update({ absence_reason: val }).eq('id', sched.id);
                                toast.success('결석 사유가 등록되었습니다');
                                fetchSchedulesAndResults();
                              }}
                            >
                              <SelectTrigger className="h-7 w-[90px] text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="인정결석">인정결석</SelectItem>
                                <SelectItem value="무단결석">무단결석</SelectItem>
                                <SelectItem value="기타결석">기타결석</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openResultInput(sched)}>
                              <ClipboardList className="w-3.5 h-3.5 mr-1" />
                              {result ? '수정' : '입력'}
                            </Button>
                            {result && !result.passed && !result.retest_scheduled && (
                              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => openRetestDialog(result)}>
                                재시험
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-warning" onClick={() => { setPostponeTarget(sched); setPostponeDate(undefined); }} title="날짜 미루기">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(sched)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
            )}

          {/* General test schedules */}
          {todayGeneralSchedules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-muted-foreground" />
                일반 시험 <Badge variant="secondary" className="text-xs">{todayGeneralSchedules.length}건</Badge>
              </h3>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>학생</TableHead>
                      <TableHead className="text-center">과목</TableHead>
                      <TableHead>내용</TableHead>
                      <TableHead className="text-center">결과</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayGeneralSchedules.map(gs => (
                      <TableRow key={gs.id}>
                        <TableCell className="font-medium text-sm">
                          {(gs.students as any)?.name || '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs">{gs.subject}</Badge>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]" title={gs.content || ''}>
                          {gs.content || '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {gs.result_passed !== null ? (
                            <div className="flex items-center justify-center gap-1">
                              {gs.result_passed ? (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive" />
                              )}
                              {gs.result_score && <span className="text-xs font-mono">{gs.result_score}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">미입력</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                            setActiveGeneralTest(gs);
                            setGeneralScore(gs.result_score || '');
                            setGeneralPassed(gs.result_passed);
                            setGeneralNotes(gs.result_notes || '');
                            setGeneralResultOpen(true);
                          }}>
                            <ClipboardList className="w-3.5 h-3.5 mr-1" />
                            {gs.result_passed !== null ? '수정' : '입력'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
          </>)}

          {/* Failed tests needing retest — all months, not just current */}
          {allFailedResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-destructive flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                재시험 필요 <Badge variant="destructive" className="text-xs">{allFailedResults.length}건</Badge>
              </h3>
              <Card className="border-destructive/30">
                <Table>
                  <TableBody>
                    {allFailedResults.map(r => {
                        const sched = allFailedSchedules.find(s => s.id === r.schedule_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm font-medium">{(sched as any)?.students?.name || '—'}</TableCell>
                            <TableCell className="text-sm">{r.book_name} Day {r.day_number}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.test_date.slice(5)}</TableCell>
                            <TableCell className="text-center text-xs font-mono text-destructive">{r.score_percent}%</TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openRetestDialog(r)}>
                                일정 잡기
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Result input dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>시험 결과 입력</DialogTitle>
          </DialogHeader>
          {activeSchedule && (
            <div className="space-y-4 pt-2">
              <div className="bg-muted rounded-md p-3 text-sm">
                <p className="font-medium">{(activeSchedule as any).students?.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeSchedule.book_name} · {formatDayLabel(activeSchedule)}
                </p>
               </div>

              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox id="oral-test" checked={isOralTest} onCheckedChange={(v) => setIsOralTest(!!v)} />
                <label htmlFor="oral-test" className="text-xs cursor-pointer font-medium">🗣️ 구두테스트로 대체</label>
              </div>

              {isOralTest ? (
                <div className="space-y-3">
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant={oralPassed ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setOralPassed(true)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Pass
                    </Button>
                    <Button
                      variant={!oralPassed ? 'destructive' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setOralPassed(false)}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Non-Pass
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">메모</Label>
                    <Input value={resultNotes} onChange={e => setResultNotes(e.target.value)} placeholder="구두테스트 관련 메모" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">전체 단어 수</Label>
                      <Input type="number" min={0} value={totalWords} onChange={e => setTotalWords(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">맞은 단어 수</Label>
                      <Input type="number" min={0} max={totalWords} value={correctWords} onChange={e => setCorrectWords(Number(e.target.value))} />
                    </div>
                  </div>

                  {totalWords > 0 && (
                    <div className="text-center py-2">
                      <span className="text-2xl font-bold font-mono">
                        {Math.round((correctWords / totalWords) * 100)}%
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">메모</Label>
                    <Input value={resultNotes} onChange={e => setResultNotes(e.target.value)} placeholder="선택 사항" />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox id="sync-lesson" checked={syncToLesson} onCheckedChange={(v) => setSyncToLesson(!!v)} />
                <label htmlFor="sync-lesson" className="text-xs cursor-pointer flex-1">
                  <span className="font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> 수업일지 연동</span>
                  <span className="text-muted-foreground block mt-0.5">기존 수업이 있으면 테스트칸 업데이트, 없으면 테스트방문으로 새로 생성</span>
                </label>
              </div>

              <Button onClick={handleSaveResult} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                저장
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Retest scheduling dialog */}
      <Dialog open={retestDialogOpen} onOpenChange={setRetestDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>재시험 일정 지정</DialogTitle>
          </DialogHeader>
          {retestResult && (
            <div className="space-y-4 pt-2">
              <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3 text-sm">
                <p className="font-medium">{retestResult.book_name} · Day {retestResult.day_number}</p>
                <p className="text-xs text-destructive mt-0.5">
                  점수: {retestResult.score_percent}% (불통과)
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">재시험 날짜</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-sm font-normal">
                      <CalendarDays className="w-4 h-4 mr-2" />
                      {retestDate ? format(retestDate, 'yyyy-MM-dd') : '날짜 선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={retestDate}
                      onSelect={(d) => d && checkRetestConflict(d)}
                      locale={ko}
                      disabled={(d) => d < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">재시험 시간 <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={retestTime}
                    onChange={e => setRetestTime(e.target.value)}
                    className="pl-9"
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              {conflictWarning && (
                <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-xs text-warning-foreground">
                  ⚠️ {conflictWarning}
                </div>
              )}

              <Button onClick={handleScheduleRetest} disabled={saving || !retestDate || !retestTime} className="w-full">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                {conflictWarning ? '그래도 등록' : '재시험 등록'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스케줄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{(deleteTarget as any).students?.name}</strong>의{' '}
                  {deleteTarget.book_name} Day {deleteTarget.day_number} ({deleteTarget.test_date}) 시험 일정을 삭제하시겠습니까?
                  {getResult(deleteTarget.id) && (
                    <span className="block mt-1 text-destructive">⚠️ 입력된 시험 결과도 함께 삭제됩니다.</span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSchedule} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Postpone dialog */}
      <Dialog open={!!postponeTarget} onOpenChange={(open) => !open && setPostponeTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>시험 날짜 변경</DialogTitle>
          </DialogHeader>
          {postponeTarget && (
            <div className="space-y-4 pt-2">
              <div className="bg-muted rounded-md p-3 text-sm">
                <p className="font-medium">{(postponeTarget as any).students?.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {postponeTarget.book_name} · Day {postponeTarget.day_number}
                </p>
                <p className="text-xs text-muted-foreground">현재: {postponeTarget.test_date}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">변경할 날짜</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-sm font-normal">
                      <CalendarDays className="w-4 h-4 mr-2" />
                      {postponeDate ? format(postponeDate, 'yyyy-MM-dd') : '날짜 선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={postponeDate}
                      onSelect={(d) => d && setPostponeDate(d)}
                      locale={ko}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button onClick={handlePostpone} disabled={postponeSaving || !postponeDate} className="w-full">
                {postponeSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                날짜 변경
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* General test result dialog */}
      <Dialog open={generalResultOpen} onOpenChange={setGeneralResultOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>시험 결과 입력</DialogTitle>
          </DialogHeader>
          {activeGeneralTest && (
            <div className="space-y-4 pt-2">
              <div className="bg-muted rounded-md p-3 text-sm">
                <p className="font-medium">{(activeGeneralTest.students as any)?.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeGeneralTest.subject} · {activeGeneralTest.content || '—'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">점수/결과</Label>
                <Input value={generalScore} onChange={e => setGeneralScore(e.target.value)} placeholder="예: 85점, 8/10 등" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">통과 여부</Label>
                <div className="flex gap-2">
                  <Button
                    variant={generalPassed === true ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setGeneralPassed(true)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    통과
                  </Button>
                  <Button
                    variant={generalPassed === false ? 'destructive' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setGeneralPassed(false)}
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    불통과
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">메모</Label>
                <Input value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="선택사항" />
              </div>

              <Button onClick={handleSaveGeneralResult} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                저장
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
