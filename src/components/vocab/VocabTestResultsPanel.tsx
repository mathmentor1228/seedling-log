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
import { Loader2, CheckCircle2, XCircle, CalendarDays, ClipboardList } from 'lucide-react';

interface Schedule {
  id: string;
  student_id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  schedule_type: string;
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
  notes: string | null;
}

export function VocabTestResultsPanel() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Result input dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [totalWords, setTotalWords] = useState<number>(0);
  const [correctWords, setCorrectWords] = useState<number>(0);
  const [resultNotes, setResultNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Retest dialog
  const [retestDialogOpen, setRetestDialogOpen] = useState(false);
  const [retestResult, setRetestResult] = useState<TestResult | null>(null);
  const [retestDate, setRetestDate] = useState<Date | undefined>();

  useEffect(() => {
    fetchSchedulesAndResults();
  }, [selectedDate]);

  const fetchSchedulesAndResults = async () => {
    setLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const startOfMonth = format(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), 'yyyy-MM-dd');
    const endOfMonth = format(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0), 'yyyy-MM-dd');

    const [schedRes, resRes] = await Promise.all([
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
    ]);

    if (schedRes.data) setSchedules(schedRes.data as any);
    if (resRes.data) setResults(resRes.data as any);
    setLoading(false);
  };

  const todaySchedules = schedules.filter(s => s.test_date === format(selectedDate, 'yyyy-MM-dd'));
  const getResult = (scheduleId: string) => results.find(r => r.schedule_id === scheduleId);

  const openResultInput = (sched: Schedule) => {
    const existing = getResult(sched.id);
    setActiveSchedule(sched);
    setTotalWords(existing?.total_words || 0);
    setCorrectWords(existing?.correct_words || 0);
    setResultNotes(existing?.notes || '');
    setDialogOpen(true);
  };

  const handleSaveResult = async () => {
    if (!activeSchedule || !user) return;
    setSaving(true);

    // Fetch cutline for this student
    const { data: setting } = await supabase
      .from('vocab_settings')
      .select('cutline_percent')
      .eq('student_id', activeSchedule.student_id)
      .single();

    const cutline = setting?.cutline_percent || 80;
    const scorePercent = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;
    const passed = scorePercent >= cutline;

    const existing = getResult(activeSchedule.id);
    const payload = {
      schedule_id: activeSchedule.id,
      student_id: activeSchedule.student_id,
      test_date: activeSchedule.test_date,
      day_number: activeSchedule.day_number,
      book_name: activeSchedule.book_name,
      total_words: totalWords,
      correct_words: correctWords,
      score_percent: scorePercent,
      passed,
      recorded_by: user.id,
      notes: resultNotes || null,
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
      setDialogOpen(false);
      fetchSchedulesAndResults();
    }
    setSaving(false);
  };

  const openRetestDialog = (result: TestResult) => {
    setRetestResult(result);
    setRetestDate(undefined);
    setRetestDialogOpen(true);
  };

  const handleScheduleRetest = async () => {
    if (!retestResult || !retestDate) return;
    setSaving(true);

    // Update result with retest info
    const { error: updateErr } = await supabase
      .from('vocab_test_results')
      .update({
        retest_scheduled: true,
        retest_date: format(retestDate, 'yyyy-MM-dd'),
        retest_requested_at: new Date().toISOString(),
      })
      .eq('id', retestResult.id);

    if (updateErr) {
      toast.error(updateErr.message);
      setSaving(false);
      return;
    }

    // Create retest schedule entry
    const { error: insertErr } = await supabase.from('vocab_schedules').insert({
      student_id: retestResult.student_id,
      setting_id: (await supabase.from('vocab_settings').select('id').eq('student_id', retestResult.student_id).single()).data?.id || '',
      test_date: format(retestDate, 'yyyy-MM-dd'),
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
  const scheduleDates = [...new Set(schedules.map(s => s.test_date))];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">시험 일정 & 결과</h2>
        <p className="text-xs text-muted-foreground mt-0.5">날짜를 선택하면 해당일 시험 목록이 표시됩니다</p>
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
            <Badge variant="secondary" className="text-xs">{todaySchedules.length}건</Badge>
          </div>

          {todaySchedules.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                해당 날짜에 예정된 시험이 없습니다
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>교재</TableHead>
                    <TableHead className="text-center">DAY</TableHead>
                    <TableHead className="text-center">유형</TableHead>
                    <TableHead className="text-center">결과</TableHead>
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
                          <Badge variant="secondary" className="font-mono text-xs">Day {sched.day_number}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={sched.schedule_type === 'retest' ? 'destructive' : 'outline'} className="text-xs">
                            {sched.schedule_type === 'retest' ? '재시험' : '정규'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {result ? (
                            <div className="flex items-center justify-center gap-1">
                              {result.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive" />
                              )}
                              <span className="text-xs font-mono">{result.score_percent}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">미입력</span>
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Failed tests needing retest */}
          {results.filter(r => !r.passed && !r.retest_scheduled).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-destructive flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                재시험 필요
              </h3>
              <Card className="border-destructive/30">
                <Table>
                  <TableBody>
                    {results
                      .filter(r => !r.passed && !r.retest_scheduled)
                      .map(r => {
                        const sched = schedules.find(s => s.id === r.schedule_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm font-medium">{(sched as any)?.students?.name || '—'}</TableCell>
                            <TableCell className="text-sm">{r.book_name} Day {r.day_number}</TableCell>
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
                  {activeSchedule.book_name} · Day {activeSchedule.day_number}
                </p>
              </div>

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
                      onSelect={setRetestDate}
                      locale={ko}
                      disabled={(d) => d < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button onClick={handleScheduleRetest} disabled={saving || !retestDate} className="w-full">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                재시험 등록
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
