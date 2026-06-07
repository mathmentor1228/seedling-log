// ADMIN-INCOME-MGMT-V1
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, Users, UserPlus, UserMinus, BookOpen, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Profile = { id: string; full_name: string; is_active: boolean };
type Student = { id: string; name: string; registration_date: string | null; withdrawn_at: string | null };
type SST = { student_id: string; teacher_id: string; subject: string };
type LessonRow = { teacher_id: string; student_id: string; lesson_date: string };

interface MonthKey { y: number; m: number; key: string; label: string }

function monthKeyFromDate(d: Date): MonthKey {
  return { y: d.getFullYear(), m: d.getMonth() + 1, key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}` };
}
function monthRange(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function lastNMonths(n: number, anchorKey: string): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = shiftMonth(anchorKey, -i);
    const [y, m] = k.split('-').map(Number);
    out.push({ y, m, key: k, label: `${String(y).slice(2)}.${String(m).padStart(2, '0')}` });
  }
  return out;
}

const TEACHER_COLORS = [
  'hsl(217 91% 60%)', 'hsl(160 84% 39%)', 'hsl(280 67% 60%)', 'hsl(25 95% 53%)',
  'hsl(340 82% 52%)', 'hsl(192 91% 45%)', 'hsl(60 79% 47%)', 'hsl(0 84% 60%)',
  'hsl(260 60% 55%)', 'hsl(120 60% 45%)',
];

function IncomeContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sst, setSst] = useState<SST[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);

  const today = new Date();
  const [anchor, setAnchor] = useState<string>(monthKeyFromDate(today).key);
  const months = useMemo(() => lastNMonths(12, anchor), [anchor]);
  const focusKey = months[months.length - 1].key;

  const fetchAll = async () => {
    const earliest = months[0].key;
    const { start } = monthRange(earliest);

    const [tRes, sRes, sstRes, lRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
      supabase.from('students').select('id, name, registration_date, withdrawn_at'),
      supabase.from('student_subject_teachers').select('student_id, teacher_id, subject'),
      supabase.from('lesson_records')
        .select('teacher_id, student_id, lesson_date')
        .gte('lesson_date', start)
        .not('teacher_id', 'is', null)
        .not('student_id', 'is', null),
    ]);

    if (tRes.error || sRes.error || sstRes.error || lRes.error) {
      toast({ title: '데이터 로드 실패', description: (tRes.error || sRes.error || sstRes.error || lRes.error)?.message, variant: 'destructive' });
      return;
    }
    setTeachers((tRes.data || []) as Profile[]);
    setStudents((sRes.data || []) as Student[]);
    setSst((sstRes.data || []) as SST[]);
    setLessons((lRes.data || []) as LessonRow[]);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [anchor]);

  const teacherById = useMemo(() => {
    const m = new Map<string, string>();
    teachers.forEach(t => m.set(t.id, t.full_name));
    return m;
  }, [teachers]);

  // teacher -> set of student_ids currently assigned (subject_teachers)
  const teacherStudentMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    sst.forEach(r => {
      if (!m.has(r.teacher_id)) m.set(r.teacher_id, new Set());
      m.get(r.teacher_id)!.add(r.student_id);
    });
    return m;
  }, [sst]);

  // student lookup
  const studentById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach(s => m.set(s.id, s));
    return m;
  }, [students]);

  // Build monthly metrics per teacher:
  // - active_taught: distinct student_id taught (lesson_records) in month
  // - lesson_count: # lesson_records in month
  // - new_enrolled: students currently mapped to this teacher with registration_date in month
  // - withdrawn: students currently mapped to this teacher with withdrawn_at in month
  type MonthlyStat = {
    teacher_id: string;
    month: string;
    active_taught: number;
    lesson_count: number;
    new_enrolled: number;
    withdrawn: number;
  };

  const monthlyStats = useMemo<MonthlyStat[]>(() => {
    const out: MonthlyStat[] = [];
    for (const t of teachers) {
      const ownedStudents = teacherStudentMap.get(t.id) || new Set();
      for (const mk of months) {
        const { start, end } = monthRange(mk.key);
        const startD = new Date(start);
        const endD = new Date(end + 'T23:59:59');

        // taught
        const taught = new Set<string>();
        let lessonCount = 0;
        for (const l of lessons) {
          if (l.teacher_id !== t.id) continue;
          if (l.lesson_date < start || l.lesson_date > end) continue;
          taught.add(l.student_id);
          lessonCount += 1;
        }
        // new + withdrawn within owned students
        let newCnt = 0;
        let wdCnt = 0;
        for (const sid of ownedStudents) {
          const s = studentById.get(sid);
          if (!s) continue;
          if (s.registration_date) {
            const rd = new Date(s.registration_date);
            if (rd >= startD && rd <= endD) newCnt += 1;
          }
          if (s.withdrawn_at) {
            const wd = new Date(s.withdrawn_at);
            if (wd >= startD && wd <= endD) wdCnt += 1;
          }
        }
        out.push({
          teacher_id: t.id, month: mk.key,
          active_taught: taught.size, lesson_count: lessonCount,
          new_enrolled: newCnt, withdrawn: wdCnt,
        });
      }
    }
    return out;
  }, [teachers, months, lessons, teacherStudentMap, studentById]);

  // Academy-wide trend per month
  const academyTrend = useMemo(() => {
    return months.map(mk => {
      const { start, end } = monthRange(mk.key);
      const startD = new Date(start);
      const endD = new Date(end + 'T23:59:59');
      const taught = new Set<string>();
      let lessonCount = 0;
      for (const l of lessons) {
        if (l.lesson_date < start || l.lesson_date > end) continue;
        taught.add(l.student_id);
        lessonCount += 1;
      }
      let newCnt = 0, wdCnt = 0;
      for (const s of students) {
        if (s.registration_date) {
          const rd = new Date(s.registration_date);
          if (rd >= startD && rd <= endD) newCnt += 1;
        }
        if (s.withdrawn_at) {
          const wd = new Date(s.withdrawn_at);
          if (wd >= startD && wd <= endD) wdCnt += 1;
        }
      }
      return { month: mk.label, key: mk.key, taught: taught.size, lessons: lessonCount, new: newCnt, withdrawn: wdCnt, net: newCnt - wdCnt };
    });
  }, [months, lessons, students]);

  // Focus month stats per teacher (for table)
  const focusMonthRows = useMemo(() => {
    return teachers
      .map(t => {
        const stat = monthlyStats.find(s => s.teacher_id === t.id && s.month === focusKey);
        if (!stat) return null;
        return { teacher_id: t.id, teacher_name: t.full_name, ...stat };
      })
      .filter(Boolean) as Array<MonthlyStat & { teacher_name: string }>;
  }, [monthlyStats, teachers, focusKey]);

  // Top-N teachers by current month activity for trend chart visibility
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  useEffect(() => {
    if (selectedTeacherIds.length === 0 && focusMonthRows.length > 0) {
      const top = [...focusMonthRows]
        .sort((a, b) => b.lesson_count - a.lesson_count)
        .slice(0, 5)
        .map(r => r.teacher_id);
      setSelectedTeacherIds(top);
    }
  }, [focusMonthRows]);

  const teacherTrendData = useMemo(() => {
    return months.map(mk => {
      const row: any = { month: mk.label };
      for (const tid of selectedTeacherIds) {
        const s = monthlyStats.find(x => x.teacher_id === tid && x.month === mk.key);
        const name = teacherById.get(tid) || '';
        row[name] = s?.active_taught ?? 0;
      }
      return row;
    });
  }, [months, monthlyStats, selectedTeacherIds, teacherById]);

  const teacherLessonData = useMemo(() => {
    return months.map(mk => {
      const row: any = { month: mk.label };
      for (const tid of selectedTeacherIds) {
        const s = monthlyStats.find(x => x.teacher_id === tid && x.month === mk.key);
        const name = teacherById.get(tid) || '';
        row[name] = s?.lesson_count ?? 0;
      }
      return row;
    });
  }, [months, monthlyStats, selectedTeacherIds, teacherById]);

  // focus month total KPIs
  const focusKPI = useMemo(() => {
    const cur = academyTrend.find(r => r.key === focusKey);
    const prevKey = shiftMonth(focusKey, -1);
    const prev = academyTrend.find(r => r.key === prevKey);
    return {
      taught: cur?.taught ?? 0,
      taughtDiff: (cur?.taught ?? 0) - (prev?.taught ?? 0),
      lessons: cur?.lessons ?? 0,
      lessonsDiff: (cur?.lessons ?? 0) - (prev?.lessons ?? 0),
      new: cur?.new ?? 0,
      withdrawn: cur?.withdrawn ?? 0,
      net: cur?.net ?? 0,
    };
  }, [academyTrend, focusKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
    toast({ title: '데이터를 새로고침했습니다.' });
  };

  const toggleTeacher = (id: string) => {
    setSelectedTeacherIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (loading) {
    return (
      <div className="space-y-5 p-1">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const focusLabel = months[months.length - 1].label;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">학원 수입 관리</h1>
            <p className="text-xs text-muted-foreground">선생님별 월별 담당 학생수·시수·입퇴원 추이</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(shiftMonth(anchor, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-3 py-1.5 rounded-md border bg-card text-sm font-semibold min-w-[100px] text-center">
            기준 {focusLabel}
          </div>
          <Button variant="outline" size="icon" onClick={() => setAnchor(shiftMonth(anchor, 1))}
            disabled={focusKey >= monthKeyFromDate(new Date()).key}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="ml-1">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Users className="w-5 h-5" />} tone="primary"
          label={`${focusLabel} 실수업 학생수`} value={`${focusKPI.taught}명`}
          hint={focusKPI.taughtDiff === 0 ? '전월과 동일' : `전월대비 ${focusKPI.taughtDiff > 0 ? '+' : ''}${focusKPI.taughtDiff}명`} />
        <KpiCard icon={<BookOpen className="w-5 h-5" />} tone="emerald"
          label={`${focusLabel} 총 수업 시수`} value={`${focusKPI.lessons}회`}
          hint={focusKPI.lessonsDiff === 0 ? '전월과 동일' : `전월대비 ${focusKPI.lessonsDiff > 0 ? '+' : ''}${focusKPI.lessonsDiff}회`} />
        <KpiCard icon={<UserPlus className="w-5 h-5" />} tone="amber"
          label={`${focusLabel} 신규 입원`} value={`${focusKPI.new}명`} />
        <KpiCard icon={<UserMinus className="w-5 h-5" />} tone="rose"
          label={`${focusLabel} 퇴원`} value={`${focusKPI.withdrawn}명`}
          hint={`순증감 ${focusKPI.net > 0 ? '+' : ''}${focusKPI.net}명`} />
      </div>

      {/* Academy trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            학원 전체 — 월별 입·퇴원 / 실수업 학생수 (최근 12개월)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={academyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="taught" name="실수업 학생수" stroke="hsl(217 91% 60%)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="new" name="신규 입원" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="withdrawn" name="퇴원" stroke="hsl(0 84% 60%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Teacher selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            선생님 선택 (차트에 표시)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {teachers.map((t, idx) => {
              const active = selectedTeacherIds.includes(t.id);
              const color = TEACHER_COLORS[selectedTeacherIds.indexOf(t.id) % TEACHER_COLORS.length];
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTeacher(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${active ? 'border-transparent text-white' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'}`}
                  style={active ? { backgroundColor: color } : undefined}
                >
                  {t.full_name}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Teacher trends */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">선생님별 월별 실수업 학생수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={teacherTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedTeacherIds.map((tid, idx) => {
                    const name = teacherById.get(tid) || '';
                    return (
                      <Line key={tid} type="monotone" dataKey={name} stroke={TEACHER_COLORS[idx % TEACHER_COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">선생님별 월별 수업 시수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teacherLessonData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedTeacherIds.map((tid, idx) => {
                    const name = teacherById.get(tid) || '';
                    return (
                      <Bar key={tid} dataKey={name} fill={TEACHER_COLORS[idx % TEACHER_COLORS.length]} radius={[4, 4, 0, 0]} />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-teacher focus month table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>선생님별 실적 — {focusLabel}</span>
            <Badge variant="secondary">{focusMonthRows.length}명</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>선생님</TableHead>
                <TableHead className="text-right">실수업 학생수</TableHead>
                <TableHead className="text-right">총 시수</TableHead>
                <TableHead className="text-right">신규 입원</TableHead>
                <TableHead className="text-right">퇴원</TableHead>
                <TableHead className="text-right">순증감</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {focusMonthRows
                .sort((a, b) => b.lesson_count - a.lesson_count)
                .map(r => {
                  const net = r.new_enrolled - r.withdrawn;
                  return (
                    <TableRow key={r.teacher_id} className="cursor-pointer hover:bg-muted/30" onClick={() => toggleTeacher(r.teacher_id)}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          {selectedTeacherIds.includes(r.teacher_id) && (
                            <span className="w-2 h-2 rounded-full" style={{ background: TEACHER_COLORS[selectedTeacherIds.indexOf(r.teacher_id) % TEACHER_COLORS.length] }} />
                          )}
                          {r.teacher_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{r.active_taught}명</TableCell>
                      <TableCell className="text-right">{r.lesson_count}회</TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                        {r.new_enrolled > 0 ? `+${r.new_enrolled}` : '0'}
                      </TableCell>
                      <TableCell className="text-right text-rose-600 dark:text-rose-400">
                        {r.withdrawn > 0 ? `-${r.withdrawn}` : '0'}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                        {net > 0 ? `+${net}` : net}
                      </TableCell>
                    </TableRow>
                  );
                })}
              {focusMonthRows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">데이터가 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-3">
            * 실수업 학생수: 해당 월 수업기록(lesson_records)에 등장한 고유 학생 수. 신규 입원/퇴원: 현재 담당으로 매핑된 학생 기준.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone: 'primary' | 'emerald' | 'amber' | 'rose' }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1 tracking-tight">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function IncomeManagementPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <IncomeContent />
    </ProtectedRoute>
  );
}
