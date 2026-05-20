import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Loader2, CalendarDays, CheckCircle2, XCircle, ClipboardList, BookOpen, AlertTriangle, TrendingUp, CalendarPlus, CheckCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

const TEACHER_CATEGORIES = [
  { label: '김다빈', key: 'seo' },
  { label: '김민희', key: 'kim' },
];

interface Props {
  onTabChange?: (tab: string) => void;
}

export function VocabDashboard({ onTabChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState('all');
  const [failModalOpen, setFailModalOpen] = useState(false);

  // Raw data
  const [schedules, setSchedules] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [failStudents, setFailStudents] = useState<any[]>([]);

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  // Week: Mon-Sat
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [schedRes, resultsRes, completionsRes, settingsRes, studentsRes] = await Promise.all([
      supabase.from('vocab_schedules').select('*, students(name, grade)').gte('test_date', monthStart).lte('test_date', monthEnd).order('test_date'),
      supabase.from('vocab_test_results').select('*').gte('test_date', monthStart).lte('test_date', monthEnd),
      supabase.from('vocab_card_completions').select('*').gte('completed_at', monthStart + 'T00:00:00').lte('completed_at', monthEnd + 'T23:59:59'),
      supabase.from('vocab_settings').select('*, students(name, grade)').eq('is_active', true),
      supabase.from('students').select('id, name, grade').in('enrollment_status', ['재학', '재등원']),
    ]);
    setSchedules(schedRes.data || []);
    setResults(resultsRes.data || []);
    setCompletions(completionsRes.data || []);
    setSettings(settingsRes.data || []);
    setStudents(studentsRes.data || []);
    setLoading(false);
  };

  // Fetch fail students for modal
  const fetchFailStudents = async () => {
    const { data } = await supabase
      .from('test_schedules')
      .select('id, student_id, subject, test_date, content, result_passed, result_recorded_at, test_type, students!inner(name)')
      .eq('result_passed', false)
      .gte('test_date', monthStart)
      .order('test_date', { ascending: false });

    if (!data) { setFailStudents([]); return; }

    // Check for retest schedules
    const studentIds = [...new Set(data.map(d => d.student_id))];
    const { data: retests } = await supabase
      .from('test_schedules')
      .select('student_id, subject, test_date')
      .eq('test_type', 'retest')
      .in('student_id', studentIds)
      .gte('test_date', format(now, 'yyyy-MM-dd'));

    const retestMap = new Map<string, string>();
    for (const r of (retests || [])) {
      retestMap.set(`${r.student_id}-${r.subject}`, r.test_date);
    }

    setFailStudents(data.map(d => {
      const retestDate = retestMap.get(`${d.student_id}-${d.subject}`);
      return {
        id: d.id,
        studentId: d.student_id,
        name: (d.students as any)?.name || '—',
        subject: d.subject,
        testDate: d.test_date,
        content: d.content || '',
        retestScheduled: !!retestDate,
        retestDate: retestDate || null,
      };
    }));
  };

  useEffect(() => {
    if (failModalOpen) fetchFailStudents();
  }, [failModalOpen]);

  // Build setting map for teacher filter
  const settingMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of settings) m[s.id] = s;
    return m;
  }, [settings]);

  const studentNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of students) m[s.id] = s.name;
    for (const s of schedules) if (s.students?.name) m[s.student_id] = s.students.name;
    for (const s of settings) if (s.students?.name) m[s.student_id] = s.students.name;
    return m;
  }, [students, schedules, settings]);

  // Filter by teacher
  const filteredSchedules = useMemo(() => {
    if (selectedTeacher === 'all') return schedules;
    return schedules.filter(s => {
      const setting = settingMap[s.setting_id];
      return setting?.assigned_teacher === selectedTeacher;
    });
  }, [schedules, selectedTeacher, settingMap]);

  const filteredResults = useMemo(() => {
    if (selectedTeacher === 'all') return results;
    const schedIds = new Set(filteredSchedules.map(s => s.id));
    return results.filter(r => schedIds.has(r.schedule_id));
  }, [results, filteredSchedules, selectedTeacher]);

  const filteredSettings = useMemo(() => {
    if (selectedTeacher === 'all') return settings;
    return settings.filter(s => s.assigned_teacher === selectedTeacher);
  }, [settings, selectedTeacher]);

  const filteredCompletions = useMemo(() => {
    if (selectedTeacher === 'all') return completions;
    const studentIds = new Set(filteredSettings.map(s => s.student_id));
    return completions.filter(c => studentIds.has(c.student_id));
  }, [completions, filteredSettings, selectedTeacher]);

  // Stats
  const scheduleCount = filteredSchedules.length;
  const resultCount = filteredResults.length;
  const passedResults = filteredResults.filter(r => r.passed);
  const failedResults = filteredResults.filter(r => !r.passed);
  const completionCount = filteredCompletions.length;
  const passRate = resultCount > 0 ? Math.round((passedResults.length / resultCount) * 100) : 0;

  // Weekly calendar
  const weekSchedules = useMemo(() => {
    return weekDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayScheds = filteredSchedules.filter(s => s.test_date === dateStr);
      const dayResults = filteredResults.filter(r => r.test_date === dateStr);
      const resultMap: Record<string, any> = {};
      for (const r of dayResults) resultMap[r.schedule_id] = r;

      return {
        date: day,
        dateStr,
        schedules: dayScheds.map(s => ({
          ...s,
          studentName: s.students?.name || studentNameMap[s.student_id] || '—',
          result: resultMap[s.id] || null,
        })),
      };
    });
  }, [filteredSchedules, filteredResults, weekDays, studentNameMap]);

  // Attention students
  const attentionStudents = useMemo(() => {
    const studentIds = new Set(filteredSettings.map(s => s.student_id));
    const attention: Array<{ id: string; name: string; teacher: string; reasons: string[]; stats: any }> = [];

    for (const sid of studentIds) {
      const name = studentNameMap[sid] || '—';
      const setting = filteredSettings.find(s => s.student_id === sid);
      const teacher = TEACHER_CATEGORIES.find(t => t.key === setting?.assigned_teacher)?.label || '—';
      const studentScheds = filteredSchedules.filter(s => s.student_id === sid);
      const studentResults = filteredResults.filter(r => r.student_id === sid);
      const studentComps = filteredCompletions.filter(c => c.student_id === sid);

      const reasons: string[] = [];

      const failed = studentResults.filter(r => !r.passed);
      if (failed.length >= 2) reasons.push(`불통과 ${failed.length}회`);

      const resultSchedIds = new Set(studentResults.map(r => r.schedule_id));
      const noResult = studentScheds.filter(s => !resultSchedIds.has(s.id) && s.test_date <= format(now, 'yyyy-MM-dd'));
      if (noResult.length > 0) reasons.push(`결과 미입력 ${noResult.length}건`);

      if (studentComps.length === 0) reasons.push('숙제 미제출');

      if (reasons.length === 0) continue;

      const passed = studentResults.filter(r => r.passed);
      attention.push({
        id: sid,
        name,
        teacher,
        reasons,
        stats: {
          tests: studentResults.length,
          passed: passed.length,
          failed: failed.length,
          homework: studentComps.length,
        },
      });
    }
    return attention;
  }, [filteredSettings, filteredSchedules, filteredResults, filteredCompletions, studentNameMap]);

  // Monthly chart data
  const chartData = useMemo(() => {
    const studentIds = [...new Set(filteredSettings.map(s => s.student_id))];
    return studentIds.map(sid => {
      const name = studentNameMap[sid] || '—';
      const setting = filteredSettings.find(s => s.student_id === sid);
      const teacher = TEACHER_CATEGORIES.find(t => t.key === setting?.assigned_teacher)?.label || '—';
      const studentResults = filteredResults.filter(r => r.student_id === sid);
      const passed = studentResults.filter(r => r.passed).length;
      const total = studentResults.length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
      return { name, teacher, total, passed, failed: total - passed, passRate };
    }).sort((a, b) => a.passRate - b.passRate);
  }, [filteredSettings, filteredResults, studentNameMap]);

  const chartConfig = {
    passRate: { label: '통과율', color: 'hsl(var(--primary))' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Teacher filter */}
      <div className="flex items-center gap-3">
        <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="선생님" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 선생님</SelectItem>
            {TEACHER_CATEGORIES.map(t => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {format(now, 'yyyy년 M월', { locale: ko })}
        </Badge>
      </div>

      {/* Stat cards - clickable action cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: 시험 스케줄 */}
        <Card
          className="border-blue-500/20 bg-blue-500/5 cursor-pointer hover:border-blue-500/50 transition-colors"
          onClick={() => onTabChange?.('test-schedule')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">시험 스케줄</span>
              <CalendarDays className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">{scheduleCount}</div>
            <div className="text-xs text-muted-foreground mt-1">이번 달</div>
          </CardContent>
        </Card>

        {/* Card 2: 결과 입력 */}
        <Card
          className="border-amber-500/20 bg-amber-500/5 cursor-pointer hover:border-amber-500/50 transition-colors"
          onClick={() => onTabChange?.('results')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">결과 입력</span>
              <ClipboardList className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold">{resultCount}</div>
            <Progress value={scheduleCount > 0 ? (resultCount / scheduleCount) * 100 : 0} className="mt-2 h-1.5" />
            <div className="text-xs text-muted-foreground mt-1">{scheduleCount}건 중 · 클릭하여 입력</div>
          </CardContent>
        </Card>

        {/* Card 3: 통과율 */}
        <Card
          className={cn(
            'cursor-pointer transition-colors',
            passRate >= 80
              ? 'border-green-500/20 bg-green-500/5 hover:border-green-500/50'
              : passRate >= 60
              ? 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/50'
              : 'border-red-500/20 bg-red-500/5 hover:border-red-500/50'
          )}
          onClick={() => onTabChange?.('results')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">통과율</span>
              <CheckCircle2 className={cn(
                'w-4 h-4',
                passRate >= 80 ? 'text-green-500' : passRate >= 60 ? 'text-amber-500' : 'text-red-500'
              )} />
            </div>
            <div className={cn(
              'text-2xl font-bold',
              passRate >= 80 ? 'text-green-600' : passRate >= 60 ? 'text-amber-600' : 'text-red-600'
            )}>
              {resultCount > 0 ? `${passRate}%` : '—'}
            </div>
            <Progress value={passRate} className="mt-2 h-1.5" />
            <div className="text-xs text-muted-foreground mt-1">{passedResults.length} / {resultCount}건</div>
          </CardContent>
        </Card>

        {/* Card 4: 불통과 → 재시험 모달 */}
        <Card
          className="border-red-500/20 bg-red-500/5 cursor-pointer hover:border-red-500/50 transition-colors"
          onClick={() => setFailModalOpen(true)}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">불통과</span>
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-600">{failedResults.length}</div>
            <div className="text-xs text-red-500 mt-1 font-medium">
              {failedResults.length > 0 ? '클릭하여 재시험 관리 →' : '없음'}
            </div>
          </CardContent>
        </Card>

        {/* Card 5: 숙제 완료 */}
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">숙제 완료</span>
              <BookOpen className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold">{completionCount}</div>
            <div className="text-xs text-muted-foreground mt-1">이번 달</div>
          </CardContent>
        </Card>
      </div>

      {/* Fail retest management modal */}
      <Dialog open={failModalOpen} onOpenChange={setFailModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              불통과 학생 재시험 관리
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {failStudents.map(student => (
              <div
                key={student.id}
                className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{student.name}</span>
                    <Badge variant="outline" className="text-xs">{student.subject}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {student.testDate} · {student.content || '—'}
                  </div>
                  {student.retestScheduled ? (
                    <Badge className="mt-1 bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">
                      재시험 예정: {student.retestDate}
                    </Badge>
                  ) : (
                    <Badge className="mt-1 bg-red-500/15 text-red-600 border-red-500/30 text-xs">
                      재시험 미예약
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={student.retestScheduled ? 'outline' : 'default'}
                  className="shrink-0 gap-1.5 ml-2"
                  onClick={() => {
                    setFailModalOpen(false);
                    onTabChange?.('test-schedule');
                  }}
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  {student.retestScheduled ? '일정 수정' : '재시험 잡기'}
                </Button>
              </div>
            ))}
          </div>
          {failStudents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p>불통과 학생이 없습니다 🎉</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Weekly calendar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            이번 주 시험 캘린더
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-max pb-2">
              {weekSchedules.map(({ date, dateStr, schedules: dayScheds }) => {
                const today = isToday(date);
                const passCount = dayScheds.filter(s => s.result?.passed).length;
                const failCount = dayScheds.filter(s => s.result && !s.result.passed).length;
                const pendingCount = dayScheds.filter(s => !s.result).length;
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      'w-44 rounded-xl border p-3 flex-shrink-0 transition-colors',
                      today ? 'border-primary bg-primary/5' : 'border-border bg-card'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn('text-sm font-semibold', today ? 'text-primary' : 'text-foreground')}>
                        {format(date, 'M/d (EEE)', { locale: ko })}
                      </span>
                      {dayScheds.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {dayScheds.length}명
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {dayScheds.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/50">없음</p>
                      ) : dayScheds.map(s => (
                        <div key={s.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="truncate mr-2">{s.studentName}</span>
                          {!s.result ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">예정</Badge>
                          ) : s.result.passed ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[10px] px-1.5 shrink-0">통과</Badge>
                          ) : (
                            <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-[10px] px-1.5 shrink-0">불통과</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                    {dayScheds.length > 0 && (
                      <div className="mt-2 pt-2 border-t flex gap-2 text-[10px] text-muted-foreground">
                        <span className="text-green-600">✓ {passCount}</span>
                        <span className="text-red-600">✗ {failCount}</span>
                        <span>· {pendingCount}예정</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attention students */}
      {attentionStudents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="font-medium">주의 학생</span>
                <Badge variant="destructive" className="ml-1">{attentionStudents.length}명</Badge>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>결과 미입력 <strong className="text-foreground">{attentionStudents.filter(s => s.reasons.some(r => r.includes('결과'))).length}명</strong></span>
                <span>숙제 미제출 <strong className="text-foreground">{attentionStudents.filter(s => s.reasons.some(r => r.includes('숙제'))).length}명</strong></span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attentionStudents.map(s => {
                const isUrgent = s.reasons.some(r => r.includes('결과 미입력')) && s.stats.tests === 0;
                return (
                  <HoverCard key={s.id}>
                    <HoverCardTrigger asChild>
                      <Card className={cn(
                        'cursor-pointer hover:shadow-sm transition-all',
                        isUrgent
                          ? 'border-red-500/40 bg-red-500/5'
                          : 'border-amber-500/30 bg-amber-500/5'
                      )}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{s.name}</span>
                                <span className="text-xs text-muted-foreground">{s.teacher}</span>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {s.reasons.map((r, i) => (
                                  <Badge
                                    key={i}
                                    className={cn(
                                      'text-[10px]',
                                      r.includes('결과')
                                        ? 'bg-red-500/15 text-red-600 border-red-500/30'
                                        : 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                                    )}
                                  >
                                    {r}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {isUrgent && (
                              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-48">
                      <div className="space-y-1.5 text-xs">
                        <p className="font-semibold">{s.name} — 이번 달</p>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground">시험 횟수</span><span className="text-right font-mono">{s.stats.tests}</span>
                          <span className="text-muted-foreground">통과</span><span className="text-right font-mono text-emerald-600">{s.stats.passed}</span>
                          <span className="text-muted-foreground">불통과</span><span className="text-right font-mono text-destructive">{s.stats.failed}</span>
                          <span className="text-muted-foreground">숙제 완료</span><span className="text-right font-mono">{s.stats.homework}</span>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              학생별 통과율
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">데이터 없음</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <ReferenceLine y={80} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: '80%', position: 'right', fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="passRate" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.passRate >= 80 ? 'hsl(var(--success))' : entry.passRate >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Achievement table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">학생별 성취</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[340px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sticky top-0 bg-card z-10">학생</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-card z-10">선생님</TableHead>
                    <TableHead className="text-xs text-center sticky top-0 bg-card z-10">시험</TableHead>
                    <TableHead className="text-xs text-center sticky top-0 bg-card z-10">통과</TableHead>
                    <TableHead className="text-xs text-center sticky top-0 bg-card z-10">불통과</TableHead>
                    <TableHead className="text-xs text-center sticky top-0 bg-card z-10">통과율</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.map(row => (
                    <TableRow key={row.name} className={cn(row.passRate < 70 && row.total > 0 && 'bg-destructive/5')}>
                      <TableCell className="text-xs font-medium">{row.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.teacher}</TableCell>
                      <TableCell className="text-xs text-center font-mono">{row.total}</TableCell>
                      <TableCell className="text-xs text-center font-mono text-emerald-600">{row.passed}</TableCell>
                      <TableCell className="text-xs text-center font-mono text-destructive">{row.failed}</TableCell>
                      <TableCell className="text-xs text-center">
                        {row.total > 0 ? (
                          <Badge variant={row.passRate >= 80 ? 'default' : row.passRate >= 50 ? 'secondary' : 'destructive'} className="text-[10px] font-mono">
                            {row.passRate}%
                          </Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
