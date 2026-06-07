// ADMIN-INCOME-MGMT-V2
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, Users, UserPlus, UserMinus, BookOpen, ChevronLeft, ChevronRight, RefreshCw,
  Wallet, TrendingDown, DollarSign,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Profile = { id: string; full_name: string; is_active: boolean };
type Student = {
  id: string; name: string;
  registration_date: string | null;
  withdrawn_at: string | null;
  enrollment_status: string | null;
  sibling_group_id: number | null;
};
type SST = { student_id: string; teacher_id: string; subject: string };
type LessonRow = { teacher_id: string; student_id: string; lesson_date: string; subject: string | null };
type Course = {
  id: string; student_id: string; teacher_id: string | null;
  enrollment_date: string | null; end_date: string | null;
  is_active: boolean; custom_monthly_fee: number | null;
  course_policy_id: string | null;
};
type Policy = { id: string; monthly_fee: number | null; subject: string | null };
type Comp = { teacher_id: string; month: string; salary: number | null };

interface MonthKey { y: number; m: number; key: string; label: string }

const MULTI_DISCOUNT: Record<number, number> = { 1: 0, 2: 50000, 3: 80000, 4: 100000 };
const SIBLING_DISCOUNT = 10000;

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
function wonFmt(n: number) {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR') + '원';
}
function manFmt(n: number) {
  return Math.round(n / 10000).toLocaleString('ko-KR') + '만';
}

const TEACHER_COLORS = [
  'hsl(217 91% 60%)', 'hsl(160 84% 39%)', 'hsl(280 67% 60%)', 'hsl(25 95% 53%)',
  'hsl(340 82% 52%)', 'hsl(192 91% 45%)', 'hsl(60 79% 47%)', 'hsl(0 84% 60%)',
  'hsl(260 60% 55%)', 'hsl(120 60% 45%)',
];

async function fetchAllLessons(startDate: string): Promise<LessonRow[]> {
  const out: LessonRow[] = [];
  const pageSize = 1000;
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('lesson_records')
      .select('teacher_id, student_id, lesson_date, subject')
      .gte('lesson_date', startDate)
      .not('teacher_id', 'is', null)
      .not('student_id', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as LessonRow[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
    if (page > 50) break; // safety
  }
  return out;
}

function IncomeContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sst, setSst] = useState<SST[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);

  const today = new Date();
  const [anchor, setAnchor] = useState<string>(monthKeyFromDate(today).key);
  const months = useMemo(() => lastNMonths(12, anchor), [anchor]);
  const focusKey = months[months.length - 1].key;

  const fetchAll = async () => {
    const earliest = months[0].key;
    const { start } = monthRange(earliest);

    try {
      const [tRes, sRes, sstRes, cRes, pRes, compRes, lessonsAll] = await Promise.all([
        supabase.from('profiles').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
        supabase.from('students').select('id, name, registration_date, withdrawn_at, enrollment_status, sibling_group_id'),
        supabase.from('student_subject_teachers').select('student_id, teacher_id, subject'),
        supabase.from('student_courses').select('id, student_id, teacher_id, enrollment_date, end_date, is_active, custom_monthly_fee, course_policy_id'),
        supabase.from('course_policies').select('id, monthly_fee, subject'),
        supabase.from('teacher_monthly_compensation').select('teacher_id, month, salary'),
        fetchAllLessons(start),
      ]);

      const errs = [tRes.error, sRes.error, sstRes.error, cRes.error, pRes.error, compRes.error].filter(Boolean);
      if (errs.length) throw errs[0];

      setTeachers((tRes.data || []) as Profile[]);
      setStudents((sRes.data || []) as Student[]);
      setSst((sstRes.data || []) as SST[]);
      setCourses((cRes.data || []) as Course[]);
      setPolicies((pRes.data || []) as Policy[]);
      setComps((compRes.data || []) as Comp[]);
      setLessons(lessonsAll);
    } catch (e: any) {
      toast({ title: '데이터 로드 실패', description: e?.message || String(e), variant: 'destructive' });
    }
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

  const studentById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach(s => m.set(s.id, s));
    return m;
  }, [students]);

  const policyById = useMemo(() => {
    const m = new Map<string, Policy>();
    policies.forEach(p => m.set(p.id, p));
    return m;
  }, [policies]);

  // Per-student gross fee (sum of active course fees)
  const studentGrossFee = useMemo(() => {
    const m = new Map<string, number>();
    const subjectCountByStudent = new Map<string, number>();
    for (const c of courses) {
      if (!c.is_active) continue;
      const fee = Number(c.custom_monthly_fee ?? (c.course_policy_id ? policyById.get(c.course_policy_id)?.monthly_fee : 0) ?? 0);
      m.set(c.student_id, (m.get(c.student_id) || 0) + fee);
      subjectCountByStudent.set(c.student_id, (subjectCountByStudent.get(c.student_id) || 0) + 1);
    }
    return { feeMap: m, subjCount: subjectCountByStudent };
  }, [courses, policyById]);

  // Sibling group counts
  const siblingCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of students) {
      if (s.sibling_group_id != null) m.set(s.sibling_group_id, (m.get(s.sibling_group_id) || 0) + 1);
    }
    return m;
  }, [students]);

  // Per-student NET fee (after multi-subject + sibling discount)
  const studentNetFee = useMemo(() => {
    const m = new Map<string, number>();
    for (const [sid, gross] of studentGrossFee.feeMap) {
      const subjCount = studentGrossFee.subjCount.get(sid) || 0;
      let discount = MULTI_DISCOUNT[Math.min(subjCount, 4)] || 0;
      const s = studentById.get(sid);
      if (s?.sibling_group_id != null && (siblingCount.get(s.sibling_group_id) || 0) >= 2) {
        discount += SIBLING_DISCOUNT;
      }
      m.set(sid, Math.max(0, gross - discount));
    }
    return m;
  }, [studentGrossFee, studentById, siblingCount]);

  // Per-teacher CURRENT-MONTH revenue: distribute student's NET fee across courses
  // proportionally to each course's own fee (NOT by lesson count, NOT by equal split).
  // 매출은 정액 월수강료 기준 — 실제 진행한 수업 회수와 무관.
  const teacherRevenue = useMemo(() => {
    const m = new Map<string, number>();
    // Group active courses by student
    const coursesByStudent = new Map<string, { teacher_id: string; fee: number }[]>();
    for (const c of courses) {
      if (!c.is_active || !c.teacher_id) continue;
      const fee = Number(
        c.custom_monthly_fee ??
        (c.course_policy_id ? policyById.get(c.course_policy_id)?.monthly_fee : 0) ??
        0
      );
      if (!coursesByStudent.has(c.student_id)) coursesByStudent.set(c.student_id, []);
      coursesByStudent.get(c.student_id)!.push({ teacher_id: c.teacher_id, fee });
    }
    for (const [sid, list] of coursesByStudent) {
      const gross = list.reduce((a, b) => a + b.fee, 0);
      if (gross <= 0) continue;
      const net = studentNetFee.get(sid) ?? gross;
      for (const c of list) {
        const share = (c.fee / gross) * net;
        m.set(c.teacher_id, (m.get(c.teacher_id) || 0) + share);
      }
    }
    return m;
  }, [courses, policyById, studentNetFee]);


  // Lookup: comp by teacher + month
  const compByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comps) {
      m.set(`${c.teacher_id}__${c.month}`, Number(c.salary || 0));
    }
    return m;
  }, [comps]);

  // Monthly stats per teacher: taught students/lessons + new/withdrawn (attributed by who taught them in that month or in last 3 months)
  type MonthlyStat = {
    teacher_id: string; month: string;
    active_taught: number; lesson_count: number;
    new_enrolled: number; withdrawn: number;
  };

  // For each lesson, index by month/teacher/student
  const lessonsByMonthTeacher = useMemo(() => {
    // key `${month}__${teacher_id}` -> Set<student_id>, and count
    const studentSet = new Map<string, Set<string>>();
    const lessonCount = new Map<string, number>();
    for (const l of lessons) {
      const month = l.lesson_date.slice(0, 7);
      const key = `${month}__${l.teacher_id}`;
      if (!studentSet.has(key)) studentSet.set(key, new Set());
      studentSet.get(key)!.add(l.student_id);
      lessonCount.set(key, (lessonCount.get(key) || 0) + 1);
    }
    return { studentSet, lessonCount };
  }, [lessons]);

  // Student->teachers who taught them at any point in the last 12 months (for new/withdrawn attribution)
  const studentTeachers = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of lessons) {
      if (!m.has(l.student_id)) m.set(l.student_id, new Set());
      m.get(l.student_id)!.add(l.teacher_id);
    }
    return m;
  }, [lessons]);

  const monthlyStats = useMemo<MonthlyStat[]>(() => {
    const out: MonthlyStat[] = [];
    for (const t of teachers) {
      for (const mk of months) {
        const { start, end } = monthRange(mk.key);
        const key = `${mk.key}__${t.id}`;
        const taughtSet = lessonsByMonthTeacher.studentSet.get(key) || new Set<string>();
        const lessonCount = lessonsByMonthTeacher.lessonCount.get(key) || 0;

        // New enrolled: student.registration_date in this month AND was taught by this teacher within ±1 month
        // Withdrawn: student.withdrawn_at in this month AND was taught by this teacher in the 3 months before withdrawal
        let newCnt = 0, wdCnt = 0;
        for (const s of students) {
          const taughtTeachers = studentTeachers.get(s.id);
          if (!taughtTeachers || !taughtTeachers.has(t.id)) continue;
          if (s.registration_date && s.registration_date >= start && s.registration_date <= end) {
            // confirm this teacher taught them in this month or next month
            const nextKey = `${shiftMonth(mk.key, 1)}__${t.id}`;
            const thisM = lessonsByMonthTeacher.studentSet.get(key);
            const nextM = lessonsByMonthTeacher.studentSet.get(nextKey);
            if (thisM?.has(s.id) || nextM?.has(s.id)) newCnt += 1;
          }
          if (s.withdrawn_at) {
            const wd = s.withdrawn_at.slice(0, 10);
            if (wd >= start && wd <= end) {
              // confirm this teacher taught them in this month or previous month
              const prevKey = `${shiftMonth(mk.key, -1)}__${t.id}`;
              const thisM = lessonsByMonthTeacher.studentSet.get(key);
              const prevM = lessonsByMonthTeacher.studentSet.get(prevKey);
              if (thisM?.has(s.id) || prevM?.has(s.id)) wdCnt += 1;
            }
          }
        }
        out.push({
          teacher_id: t.id, month: mk.key,
          active_taught: taughtSet.size, lesson_count: lessonCount,
          new_enrolled: newCnt, withdrawn: wdCnt,
        });
      }
    }
    return out;
  }, [teachers, months, students, lessonsByMonthTeacher, studentTeachers]);

  // Academy-wide trend
  const academyTrend = useMemo(() => {
    return months.map(mk => {
      const { start, end } = monthRange(mk.key);
      const taught = new Set<string>();
      let lessonCount = 0;
      for (const l of lessons) {
        if (l.lesson_date < start || l.lesson_date > end) continue;
        taught.add(l.student_id);
        lessonCount += 1;
      }
      let newCnt = 0, wdCnt = 0;
      for (const s of students) {
        if (s.registration_date && s.registration_date >= start && s.registration_date <= end) newCnt += 1;
        if (s.withdrawn_at) {
          const wd = s.withdrawn_at.slice(0, 10);
          if (wd >= start && wd <= end) wdCnt += 1;
        }
      }
      // Salary total this month (from comps)
      let salaryTotal = 0;
      for (const c of comps) if (c.month === mk.key) salaryTotal += Number(c.salary || 0);
      return { month: mk.label, key: mk.key, taught: taught.size, lessons: lessonCount, new: newCnt, withdrawn: wdCnt, net: newCnt - wdCnt, salaryTotal };
    });
  }, [months, lessons, students, comps]);

  // Focus month per-teacher rows (table + P&L)
  const focusMonthRows = useMemo(() => {
    return teachers
      .map(t => {
        const stat = monthlyStats.find(s => s.teacher_id === t.id && s.month === focusKey);
        if (!stat) return null;
        const revenue = teacherRevenue.get(t.id) || 0;
        const salary = compByKey.get(`${t.id}__${focusKey}`) || 0;
        const profit = revenue - salary;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          teacher_id: t.id, teacher_name: t.full_name, ...stat,
          revenue, salary, profit, margin,
        };
      })
      .filter(Boolean) as Array<MonthlyStat & { teacher_name: string; revenue: number; salary: number; profit: number; margin: number }>;
  }, [monthlyStats, teachers, focusKey, teacherRevenue, compByKey]);

  // Selected teachers (for charts)
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

  // P&L trend (academy-wide, last 12 months): revenue is constant (current-month snapshot), so we use salary actuals per month
  // We approximate revenue per month as current month's revenue total (best-effort given lack of historical fees) — only for visualization clarity, we display salary actuals.
  const totalCurrentRevenue = useMemo(() => {
    let s = 0;
    for (const v of teacherRevenue.values()) s += v;
    return s;
  }, [teacherRevenue]);

  const plTrend = useMemo(() => {
    return academyTrend.map(r => ({
      month: r.month,
      key: r.key,
      revenue: r.key === focusKey ? totalCurrentRevenue : 0, // only meaningful for focus month
      salary: r.salaryTotal,
      profit: (r.key === focusKey ? totalCurrentRevenue : 0) - r.salaryTotal,
    }));
  }, [academyTrend, totalCurrentRevenue, focusKey]);

  const focusKPI = useMemo(() => {
    const cur = academyTrend.find(r => r.key === focusKey);
    const prevKey = shiftMonth(focusKey, -1);
    const prev = academyTrend.find(r => r.key === prevKey);
    const focusSalary = cur?.salaryTotal || 0;
    const profit = totalCurrentRevenue - focusSalary;
    const margin = totalCurrentRevenue > 0 ? (profit / totalCurrentRevenue) * 100 : 0;
    return {
      taught: cur?.taught ?? 0,
      taughtDiff: (cur?.taught ?? 0) - (prev?.taught ?? 0),
      lessons: cur?.lessons ?? 0,
      lessonsDiff: (cur?.lessons ?? 0) - (prev?.lessons ?? 0),
      new: cur?.new ?? 0,
      withdrawn: cur?.withdrawn ?? 0,
      net: cur?.net ?? 0,
      revenue: totalCurrentRevenue,
      salary: focusSalary,
      profit,
      margin,
    };
  }, [academyTrend, focusKey, totalCurrentRevenue]);

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
            <p className="text-xs text-muted-foreground">수업일지 기반 선생님별 실수업·시수·입퇴원 + 손익 분석</p>
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

      {/* KPI Row 1: Operations */}
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

      {/* KPI Row 2: P&L */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<DollarSign className="w-5 h-5" />} tone="primary"
          label="이달 예상 매출 (할인 반영)" value={wonFmt(Math.round(focusKPI.revenue))}
          hint="활성 수강 × 다과목·형제 할인 적용" />
        <KpiCard icon={<Wallet className="w-5 h-5" />} tone="amber"
          label="이달 인건비 합계" value={wonFmt(Math.round(focusKPI.salary))}
          hint="선생님별 월급 입력값" />
        <KpiCard icon={focusKPI.profit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          tone={focusKPI.profit >= 0 ? 'emerald' : 'rose'}
          label="이달 순이익 (매출 − 인건비)" value={wonFmt(Math.round(focusKPI.profit))}
          hint={`마진율 ${focusKPI.margin.toFixed(1)}%`} />
        <KpiCard icon={<Users className="w-5 h-5" />} tone="primary"
          label="실수업 학생 1인당 매출" value={focusKPI.taught > 0 ? wonFmt(Math.round(focusKPI.revenue / focusKPI.taught)) : '-'}
          hint="매출 ÷ 실수업 학생수" />
      </div>

      {/* Academy trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            학원 전체 — 월별 실수업·입퇴원 추이 (최근 12개월)
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
            {teachers.map((t) => {
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

      {/* P&L per teacher */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" />선생님별 손익 — {focusLabel}</span>
            <Badge variant="secondary">{focusMonthRows.length}명</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={focusMonthRows.slice().sort((a, b) => b.revenue - a.revenue).map(r => ({
                name: r.teacher_name,
                매출: Math.round(r.revenue),
                인건비: Math.round(r.salary),
                순이익: Math.round(r.profit),
              }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => manFmt(v as number)} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => wonFmt(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="매출" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="인건비" fill="hsl(25 95% 53%)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="순이익" stroke="hsl(160 84% 39%)" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>선생님</TableHead>
                  <TableHead className="text-right">실수업</TableHead>
                  <TableHead className="text-right">시수</TableHead>
                  <TableHead className="text-right">신규</TableHead>
                  <TableHead className="text-right">퇴원</TableHead>
                  <TableHead className="text-right">매출(예상)</TableHead>
                  <TableHead className="text-right">인건비</TableHead>
                  <TableHead className="text-right">순이익</TableHead>
                  <TableHead className="text-right">마진율</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {focusMonthRows
                  .sort((a, b) => b.profit - a.profit)
                  .map(r => {
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
                        <TableCell className="text-right font-mono text-sm">{wonFmt(Math.round(r.revenue))}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400">{wonFmt(Math.round(r.salary))}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${r.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {wonFmt(Math.round(r.profit))}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${r.margin >= 30 ? 'text-emerald-600 dark:text-emerald-400' : r.margin >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {r.revenue > 0 ? `${r.margin.toFixed(1)}%` : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {focusMonthRows.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">데이터가 없습니다</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            * <b>실수업/시수/신규/퇴원</b>: 수업일지(lesson_records) 기반. 신규·퇴원은 해당 월에 실제로 그 선생님이 수업한 학생만 집계.<br/>
            * <b>매출(예상)</b>: 활성 수강(student_courses)의 월 수강료 합 — 다과목 할인(2과목 -5만, 3과목 -8만, 4과목+ -10만)·형제 할인(-1만/인)을 학생 단위로 적용한 뒤, 학생의 과목 수로 균등 분배하여 담당 선생님에게 귀속.<br/>
            * <b>인건비</b>: 통계/급여 화면에서 입력한 해당 월 급여(teacher_monthly_compensation).
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
          <p className="text-xl font-bold mt-1 tracking-tight break-all">{value}</p>
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
