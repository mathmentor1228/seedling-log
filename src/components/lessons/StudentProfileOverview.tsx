// STUDENT-PROFILE-OVERVIEW-V1: Enhanced overview with clickable stats and charts
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { getAttendanceIssues } from '@/lib/attendance';
import {
  BookOpen, TestTube, Clock, Stethoscope, AlertCircle, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell,
} from 'recharts';

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'hsl(var(--primary))',
  '영어': 'hsl(var(--success))',
  '국어': 'hsl(var(--warning))',
  '과학': 'hsl(var(--destructive))',
};

const PIE_COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--muted))'];

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간',
  final: '기말',
  performance: '수행',
  other: '기타',
};

interface StudentBasic {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  school_level: string | null;
  created_at: string;
}

function derivePassed(epf: string | null, tr: string | null): boolean | null {
  if (epf === 'pass' || tr === 'pass') return true;
  if (epf === 'fail' || tr === 'fail') return false;
  return null;
}

function calcDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function fmtDur(mins: number | null) {
  if (!mins || mins <= 0) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

function getScoreValue(result: any) {
  return result.actual_score ?? result.expected_score ?? null;
}

export function StudentProfileOverview({ student, data }: { student: StudentBasic; data: any }) {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const toggle = (key: string) => setExpandedCard(prev => prev === key ? null : key);

  const now = new Date();
  const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
  const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

  const submitted = (data.lessons || []).filter((l: any) => l.submitted);
  const examResults = data.examResults || [];
  const scoredExamResults = examResults.filter((r: any) => getScoreValue(r) != null);
  const latestExamResult = scoredExamResults[0] || null;

  const examTrendBySubject = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    scoredExamResults.forEach((r: any) => {
      grouped[r.subject] = grouped[r.subject] || [];
      grouped[r.subject].push(r);
    });
    return Object.entries(grouped).map(([subject, rows]) => {
      const ordered = [...rows].sort((a, b) => String(a.exam_date || a.submitted_at).localeCompare(String(b.exam_date || b.submitted_at)));
      const latest = ordered[ordered.length - 1];
      const previous = ordered[ordered.length - 2];
      const latestScore = getScoreValue(latest);
      const previousScore = previous ? getScoreValue(previous) : null;
      return { subject, latest, latestScore, diff: latestScore != null && previousScore != null ? latestScore - previousScore : null };
    }).sort((a, b) => String(b.latest.exam_year || '').localeCompare(String(a.latest.exam_year || '')));
  }, [scoredExamResults]);

  // This month & last month lessons
  const thisMonthLessons = submitted.filter((l: any) => l.lesson_date >= thisMonthStart && l.lesson_date <= thisMonthEnd);
  const lastMonthLessons = submitted.filter((l: any) => l.lesson_date >= lastMonthStart && l.lesson_date <= lastMonthEnd);

  // Understanding score trend (monthly avg)
  const monthlyUnderstanding = useMemo(() => {
    const map: Record<string, { month: string; scores: number[] }> = {};
    submitted.forEach((l: any) => {
      if (l.understanding_score == null) return;
      const m = l.lesson_date?.slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { month: m, scores: [] };
      map[m].scores.push(l.understanding_score);
    });
    return Object.values(map)
      .map(m => ({ month: m.month, avg: Math.round((m.scores.reduce((a, b) => a + b, 0) / m.scores.length) * 10) / 10 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [submitted]);

  // This month avg vs last month avg
  const thisMonthAvg = thisMonthLessons.filter((l: any) => l.understanding_score != null).length > 0
    ? Math.round(thisMonthLessons.filter((l: any) => l.understanding_score != null).reduce((s: number, l: any) => s + l.understanding_score, 0) / thisMonthLessons.filter((l: any) => l.understanding_score != null).length * 10) / 10
    : null;
  const lastMonthAvg = lastMonthLessons.filter((l: any) => l.understanding_score != null).length > 0
    ? Math.round(lastMonthLessons.filter((l: any) => l.understanding_score != null).reduce((s: number, l: any) => s + l.understanding_score, 0) / lastMonthLessons.filter((l: any) => l.understanding_score != null).length * 10) / 10
    : null;

  // Homework pie data this month
  const hwPie = useMemo(() => {
    const counts = { completed: 0, partial: 0, not_done: 0, none: 0 };
    thisMonthLessons.forEach((l: any) => {
      if (l.homework_status === 'completed') counts.completed++;
      else if (l.homework_status === 'partial') counts.partial++;
      else if (l.homework_status === 'not_done') counts.not_done++;
      else counts.none++;
    });
    return [
      { name: '완료', value: counts.completed },
      { name: '일부', value: counts.partial },
      { name: '미이행', value: counts.not_done },
      { name: '없음', value: counts.none },
    ].filter(d => d.value > 0);
  }, [thisMonthLessons]);

  // Subject radar data
  const radarData = useMemo(() => {
    const subjects = [...new Set(thisMonthLessons.map((l: any) => l.subject))];
    return subjects.map(subj => {
      const subjLessons = thisMonthLessons.filter((l: any) => l.subject === subj);
      const withScore = subjLessons.filter((l: any) => l.understanding_score != null);
      const avg = withScore.length > 0
        ? Math.round(withScore.reduce((s: number, l: any) => s + l.understanding_score, 0) / withScore.length * 10) / 10
        : 0;
      const hwTotal = subjLessons.filter((l: any) => l.homework_status && !['none_assigned', 'none'].includes(l.homework_status)).length;
      const hwDone = subjLessons.filter((l: any) => l.homework_status === 'completed').length;
      const hwRate = hwTotal > 0 ? Math.round((hwDone / hwTotal) * 5) : 0; // scale to 5
      return { subject: subj, 이해도: avg, 숙제이행: hwRate, 수업횟수: Math.min(subjLessons.length, 5) };
    });
  }, [thisMonthLessons]);

  // Test pass rate this month
  const thisMonthTests = (data.tests || []).filter((t: any) => t.lesson_date >= thisMonthStart && t.lesson_date <= thisMonthEnd);
  const lastMonthTests = (data.tests || []).filter((t: any) => t.lesson_date >= lastMonthStart && t.lesson_date <= lastMonthEnd);

  // Attendance detail this month
  const attendanceExceptions = thisMonthLessons.filter((l: any) =>
    l.attendance_status && Array.isArray(l.attendance_status) &&
    getAttendanceIssues(l.attendance_status).length > 0
  );

  return (
    <div className="space-y-4">
      {/* Student Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground text-xs">이름</span><p className="font-semibold">{student.name}</p></div>
            <div><span className="text-muted-foreground text-xs">학년</span><p className="font-semibold">{student.grade || '-'}</p></div>
            <div><span className="text-muted-foreground text-xs">학교</span><p className="font-semibold">{student.school || '-'}</p></div>
            <div><span className="text-muted-foreground text-xs">등원 시작일</span><p className="font-semibold">{student.created_at ? format(parseISO(student.created_at), 'yyyy.MM.dd') : '-'}</p></div>
          </div>
          {Object.keys(data.subjectTeacherMap).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.subjectTeacherMap).map(([subj, teacher]) => (
                <Badge key={subj} variant="secondary" className="text-xs">{subj}: {teacher as string}</Badge>
              ))}
            </div>
          )}
          {data.scheduleList.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1">수업 시간표</p>
              <div className="flex flex-wrap gap-2">
                {data.scheduleList.map((s: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {s.day} {s.start}~{s.end} {s.subject}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clickable Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="cursor-pointer" onClick={() => toggle('lessons')}>
          <StatCard
            title="이번 달 수업"
            value={`${data.monthCounts.lessons}회`}
            icon={<BookOpen className="w-5 h-5" />}
            iconColor="primary"
            trend={lastMonthLessons.length > 0 ? {
              value: Math.round(((data.monthCounts.lessons - lastMonthLessons.length) / lastMonthLessons.length) * 100),
              isPositive: data.monthCounts.lessons >= lastMonthLessons.length,
            } : undefined}
          />
        </div>
        <div className="cursor-pointer" onClick={() => toggle('tests')}>
          <StatCard
            title="이번 달 테스트"
            value={`${data.monthCounts.tests}회`}
            icon={<TestTube className="w-5 h-5" />}
            iconColor="warning"
            trend={lastMonthTests.length > 0 ? {
              value: Math.round(((data.monthCounts.tests - lastMonthTests.length) / lastMonthTests.length) * 100),
              isPositive: data.monthCounts.tests >= lastMonthTests.length,
            } : undefined}
          />
        </div>
        <div className="cursor-pointer" onClick={() => toggle('selfStudy')}>
          <StatCard
            title="이번 달 자습"
            value={`${data.monthCounts.selfStudy}회`}
            icon={<Clock className="w-5 h-5" />}
            iconColor="success"
          />
        </div>
        <div className="cursor-pointer" onClick={() => toggle('clinic')}>
          <StatCard
            title="이번 달 클리닉"
            value={`${data.monthCounts.clinic}회`}
            icon={<Stethoscope className="w-5 h-5" />}
            iconColor="destructive"
          />
        </div>
        <div className="cursor-pointer" onClick={() => toggle('schoolExams')}>
          <StatCard
            title="최근 내신 성적"
            value={latestExamResult ? `${getScoreValue(latestExamResult)}점` : '-'}
            icon={<TestTube className="w-5 h-5" />}
            iconColor="primary"
          />
        </div>
      </div>

      {/* Expandable Details */}
      {expandedCard === 'lessons' && (
        <Card className="border-primary/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">📖 이번 달 수업 상세</CardTitle></CardHeader>
          <CardContent className="p-4">
            {thisMonthLessons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">수업 기록이 없습니다</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>날짜</TableHead><TableHead>과목</TableHead><TableHead>구분</TableHead><TableHead>내용</TableHead><TableHead>이해도</TableHead><TableHead>숙제</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {thisMonthLessons.map((l: any) => {
                    const types: string[] = Array.isArray(l.lesson_types) ? l.lesson_types : [];
                    const typeColor = (t: string) =>
                      t === '보충수업' ? 'bg-blue-500/15 text-blue-600 border-blue-500/30'
                      : t === '시험특강' ? 'bg-purple-500/15 text-purple-600 border-purple-500/30'
                      : t === '방학특강' ? 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30'
                      : t === '테스트' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                      : t === '휴강' ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
                      : 'bg-muted text-muted-foreground border-border';
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.lesson_date?.slice(5)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{l.subject}</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {types.filter(t => t !== '정규수업').map(t => (
                              <Badge key={t} className={`text-[10px] h-4 px-1 ${typeColor(t)}`}>{t}</Badge>
                            ))}
                            {types.length === 0 || (types.length === 1 && types[0] === '정규수업') ? (
                              <span className="text-[10px] text-muted-foreground">정규</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{l.lesson_range}</TableCell>
                        <TableCell className="text-xs">{l.understanding_score ?? '-'}/5</TableCell>
                        <TableCell className="text-xs">
                          {l.homework_status === 'completed' ? '✅' : l.homework_status === 'partial' ? '⚠️' : l.homework_status === 'not_done' ? '❌' : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {attendanceExceptions.length > 0 && (
              <div className="mt-3 p-2 bg-destructive/5 rounded-lg">
                <p className="text-xs font-semibold text-destructive mb-1">출결 이슈 ({attendanceExceptions.length}건)</p>
                {attendanceExceptions.map((l: any) => (
                  <div key={l.id} className="text-xs flex gap-2">
                    <span className="text-muted-foreground">{l.lesson_date?.slice(5)}</span>
                    <span>{l.subject}</span>
                    <span className="text-destructive">{l.attendance_status.filter((s: string) => s !== '정상').join(', ')}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {expandedCard === 'tests' && (
        <Card className="border-warning/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">🔬 이번 달 테스트 상세</CardTitle></CardHeader>
          <CardContent className="p-4">
            {thisMonthTests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">테스트 기록이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {thisMonthTests.map((t: any) => {
                  const passed = derivePassed(t.english_pass_fail, t.test_result);
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="text-base">{passed === true ? '✅' : passed === false ? '❌' : '➖'}</span>
                      <span className="text-muted-foreground text-xs w-14">{t.lesson_date?.slice(5)}</span>
                      <Badge variant="outline" className="text-xs">{t.subject}</Badge>
                      <span className="truncate flex-1">{t.test_content || t.test_title}</span>
                      {t.test_result_text && <span className="text-xs text-muted-foreground">{t.test_result_text}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {expandedCard === 'selfStudy' && (
        <Card className="border-success/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">📚 이번 달 자습 상세</CardTitle></CardHeader>
          <CardContent className="p-4">
            {(() => {
              const monthSelfStudy = (data.selfStudy || []).filter((s: any) =>
                s.study_date >= thisMonthStart && s.study_date <= thisMonthEnd
              );
              const totalMins = monthSelfStudy.reduce((sum: number, r: any) =>
                sum + (r.duration_minutes ?? calcDuration(r.start_time, r.end_time) ?? 0), 0);
              return monthSelfStudy.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">자습 기록이 없습니다</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">총 자습시간: <strong>{fmtDur(totalMins)}</strong></p>
                  {monthSelfStudy.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{r.study_date?.slice(5)}</span>
                      <Badge variant="outline" className="text-[10px]">{r.subject || '-'}</Badge>
                      <span>{r.start_time?.slice(0, 5)}~{r.end_time?.slice(0, 5)}</span>
                      <span className="text-muted-foreground">{fmtDur(r.duration_minutes ?? calcDuration(r.start_time, r.end_time))}</span>
                    </div>
                  ))}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {expandedCard === 'clinic' && (
        <Card className="border-destructive/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">🏥 이번 달 클리닉 상세</CardTitle></CardHeader>
          <CardContent className="p-4">
            {(() => {
              const monthClinic = (data.clinic || []).filter((c: any) =>
                c.clinic_date >= thisMonthStart && c.clinic_date <= thisMonthEnd
              );
              return monthClinic.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">클리닉 기록이 없습니다</p>
              ) : (
                monthClinic.map((r: any) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground shrink-0">{r.clinic_date?.slice(5)}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{r.subject}</Badge>
                    <span className="truncate">{r.content}</span>
                  </div>
                ))
              );
            })()}
          </CardContent>
        </Card>
      )}

      {expandedCard === 'schoolExams' && (
        <Card className="border-primary/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm">📌 입력된 내신 성적</CardTitle></CardHeader>
          <CardContent className="p-4">
            {examResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">입력된 내신 성적이 없습니다</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {examTrendBySubject.map((item) => (
                    <div key={item.subject} className="rounded-lg border bg-card/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-xs">{item.subject}</Badge>
                        <span className="text-sm font-semibold">{item.latestScore}점</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.latest.exam_year ? `${item.latest.exam_year}년 ` : ''}{EXAM_TYPE_LABELS[item.latest.exam_type] || item.latest.exam_type}</span>
                        {item.diff != null && (
                          <span className={item.diff >= 0 ? 'text-success' : 'text-destructive'}>
                            {item.diff >= 0 ? '▲' : '▼'} {Math.abs(item.diff)}점
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>연도</TableHead><TableHead>과목</TableHead><TableHead>시험</TableHead><TableHead>점수</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {examResults.slice(0, 8).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{r.exam_year ? `${r.exam_year}년` : '-'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.subject}</Badge></TableCell>
                        <TableCell className="text-xs">{EXAM_TYPE_LABELS[r.exam_type] || r.exam_type}{r.exam_period ? ` · ${r.exam_period}` : ''}</TableCell>
                        <TableCell className="text-xs font-medium">{getScoreValue(r) != null ? `${getScoreValue(r)}점` : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Understanding Trend */}
        {monthlyUnderstanding.length >= 2 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                📈 월별 평균 이해도
                {thisMonthAvg != null && lastMonthAvg != null && (
                  <Badge variant="outline" className={`text-[10px] ${thisMonthAvg >= lastMonthAvg ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}`}>
                    {thisMonthAvg >= lastMonthAvg ? '▲' : '▼'} {Math.abs(Math.round((thisMonthAvg - lastMonthAvg) * 10) / 10)}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={monthlyUnderstanding}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <ReTooltip />
                  <Line type="monotone" dataKey="avg" name="평균 이해도" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Homework Distribution Pie */}
        {hwPie.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">📊 이번 달 숙제 이행 현황</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={hwPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  >
                    {hwPie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Subject Radar */}
        {radarData.length >= 2 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">🎯 과목별 종합 비교 (이번 달)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9 }} />
                  <Radar name="이해도" dataKey="이해도" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                  <Radar name="숙제이행" dataKey="숙제이행" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.15} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Unconfirmed clinic notes */}
      {data.unconfirmedNotes.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/5">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            미확인 클리닉 특이사항이 <strong>{data.unconfirmedNotes.length}건</strong> 있습니다
            <ul className="mt-2 space-y-1 text-xs">
              {data.unconfirmedNotes.slice(0, 3).map((n: any) => (
                <li key={n.id}>• {n.clinic_date} {n.subject}: {n.teacher_note}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
