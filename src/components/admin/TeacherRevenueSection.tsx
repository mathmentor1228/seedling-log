// TEACHER-REVENUE-SECTION-V2 (per-student breakdown + MoM + new/withdrawn + chart)
import { Fragment } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, TrendingDown, Wallet, Save, ChevronDown, UserPlus, UserMinus, Users, ArrowRight, Calculator, Check,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell,
} from 'recharts';

interface StudentContrib {
  student_id: string;
  student_name: string;
  subject: string;
  fee: number;          // 이 선생님에게 귀속되는 금액 (분배 후)
  share_pct: number;    // 이 수강료 중 이 선생님 몫 %
  lesson_count: number; // 해당 월 이 학생·과목 수업 횟수
  source: 'lessons' | 'subject_teacher' | 'course' | 'unassigned';
}

interface TeacherRevenueRow {
  teacher_id: string;
  teacher_name: string;
  revenue: number;
  student_count: number;
  prev_revenue: number;
  prev_student_count: number;
  student_ids: string[];
  prev_student_ids: string[];
  salary: number;
  profit: number;
  margin: number;
  contribs: StudentContrib[];
}

interface MovementStudent {
  id: string;
  name: string;
  grade?: string | null;
  date?: string | null;
}

const wonFmt = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const shortWon = (n: number) => {
  if (n >= 10000) return (Math.round(n / 1000) / 10).toFixed(1).replace(/\.0$/, '') + '만';
  return Math.round(n).toLocaleString('ko-KR');
};

function getMonthOptions(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 12; i++) {
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push(m);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function prevMonthStr(m: string): string {
  const d = new Date(m + '-01');
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(m: string) {
  const start = `${m}-01`;
  const e = new Date(m + '-01');
  e.setMonth(e.getMonth() + 1);
  const end = e.toISOString().slice(0, 10);
  return { start, end };
}

const UNASSIGNED = '__unassigned__';

const MULTI_SUBJECT_DISCOUNT: Record<number, number> = {
  1: 0,
  2: 50000,
  3: 80000,
  4: 100000,
};
const SIBLING_DISCOUNT = 10000;

// Compute effective per-course fee after multi-subject + sibling discounts.
// Returns { feeByCourseId, discountByStudentId }
function computeEffectiveFees(
  courses: any[],
  siblingCountByGroup: Map<number, number>,
  siblingGroupByStudent: Map<string, number | null>,
) {
  const feeByCourse = new Map<string, number>();
  const discountByStudent = new Map<string, { gross: number; discount: number; subjects: number; sibling: boolean; hasCustom: boolean }>();

  // group active courses by student
  const byStudent = new Map<string, any[]>();
  for (const c of courses) {
    const status = c.students?.enrollment_status;
    if (status !== '재학' && status !== '재등원') continue;
    if (!byStudent.has(c.student_id)) byStudent.set(c.student_id, []);
    byStudent.get(c.student_id)!.push(c);
  }

  for (const [sid, list] of byStudent.entries()) {
    const subjects = new Set<string>();
    let gross = 0;
    let hasCustom = false;
    for (const c of list) {
      const subj = c.course_policies?.subject;
      if (subj) subjects.add(subj);
      const policyFee = Number(c.course_policies?.monthly_fee ?? 0);
      const customFee = c.custom_monthly_fee == null ? null : Number(c.custom_monthly_fee);
      if (customFee != null) hasCustom = true;
      gross += customFee != null ? customFee : policyFee;
    }
    const groupId = siblingGroupByStudent.get(sid) ?? null;
    const sibCount = groupId != null ? (siblingCountByGroup.get(groupId) || 0) : 0;
    const subjectCount = subjects.size;
    const multi = hasCustom ? 0 : (MULTI_SUBJECT_DISCOUNT[Math.min(subjectCount, 4)] ?? (subjectCount > 4 ? 100000 : 0));
    const sib = hasCustom ? 0 : (sibCount > 1 ? SIBLING_DISCOUNT : 0);
    const discount = multi + sib;

    discountByStudent.set(sid, { gross, discount, subjects: subjectCount, sibling: sibCount > 1, hasCustom });

    // scale each course's fee pro-rata
    const ratio = gross > 0 ? Math.max(0, (gross - discount)) / gross : 1;
    for (const c of list) {
      const policyFee = Number(c.course_policies?.monthly_fee ?? 0);
      const customFee = c.custom_monthly_fee == null ? null : Number(c.custom_monthly_fee);
      const raw = customFee != null ? customFee : policyFee;
      feeByCourse.set(c.id, raw * ratio);
    }
  }
  return { feeByCourse, discountByStudent };
}

// Compute per-teacher revenue + per-student contributions for one month.
function computeAttribution(
  courses: any[],
  subjectTeachers: any[],
  lessons: any[],
  studentNameMap: Map<string, { name: string; grade: string | null }>,
  feeByCourse: Map<string, number>,
) {
  const result = new Map<
    string,
    { revenue: number; students: Set<string>; contribs: StudentContrib[] }
  >();

  const lessonAttribMap = new Map<string, Map<string, number>>();
  for (const l of lessons) {
    const key = `${l.student_id}::${l.subject}`;
    if (!lessonAttribMap.has(key)) lessonAttribMap.set(key, new Map());
    const tm = lessonAttribMap.get(key)!;
    tm.set(l.teacher_id, (tm.get(l.teacher_id) || 0) + 1);
  }

  const subjTeacherMap = new Map<string, string[]>();
  for (const st of subjectTeachers) {
    const key = `${st.student_id}::${st.subject}`;
    if (!subjTeacherMap.has(key)) subjTeacherMap.set(key, []);
    subjTeacherMap.get(key)!.push(st.teacher_id);
  }

  const ensure = (tid: string) => {
    if (!result.has(tid)) result.set(tid, { revenue: 0, students: new Set(), contribs: [] });
    return result.get(tid)!;
  };

  for (const c of courses) {
    const status = c.students?.enrollment_status;
    if (status !== '재학' && status !== '재등원') continue;
    const fee = feeByCourse.has(c.id)
      ? feeByCourse.get(c.id)!
      : Number(c.custom_monthly_fee ?? c.course_policies?.monthly_fee ?? 0);
    if (fee <= 0) continue;
    const subject = c.course_policies?.subject || '';
    const key = subject ? `${c.student_id}::${subject}` : '';
    const lessonShare = key ? lessonAttribMap.get(key) : undefined;
    const sName = studentNameMap.get(c.student_id)?.name || '학생';

    if (lessonShare && lessonShare.size > 0) {
      const total = Array.from(lessonShare.values()).reduce((a, b) => a + b, 0);
      for (const [tid, cnt] of lessonShare.entries()) {
        const e = ensure(tid);
        const share = fee * (cnt / total);
        e.revenue += share;
        e.students.add(c.student_id);
        e.contribs.push({
          student_id: c.student_id,
          student_name: sName,
          subject,
          fee: share,
          share_pct: (cnt / total) * 100,
          lesson_count: cnt,
          source: 'lessons',
        });
      }
    } else {
      const assigned = key ? subjTeacherMap.get(key) : undefined;
      let teacherIds: string[];
      let source: StudentContrib['source'] = 'unassigned';
      if (assigned && assigned.length > 0) { teacherIds = assigned; source = 'subject_teacher'; }
      else if (c.teacher_id) { teacherIds = [c.teacher_id]; source = 'course'; }
      else teacherIds = [UNASSIGNED];

      const share = fee / teacherIds.length;
      for (const tid of teacherIds) {
        const e = ensure(tid);
        e.revenue += share;
        e.students.add(c.student_id);
        e.contribs.push({
          student_id: c.student_id,
          student_name: sName,
          subject,
          fee: share,
          share_pct: 100 / teacherIds.length,
          lesson_count: 0,
          source,
        });
      }
    }
  }
  return result;
}


export default function TeacherRevenueSection() {
  const { toast } = useToast();
  const months = useMemo(() => getMonthOptions(), []);
  const [month, setMonth] = useState(months[0]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeacherRevenueRow[]>([]);
  const [salaryDraft, setSalaryDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newStudents, setNewStudents] = useState<MovementStudent[]>([]);
  const [withdrawnStudents, setWithdrawnStudents] = useState<MovementStudent[]>([]);
  const [targetMargin, setTargetMargin] = useState<string>('30');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { start: monthStart, end: monthEnd } = monthRange(month);
      const prevMonth = prevMonthStr(month);
      const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

      const [
        { data: courses },
        { data: profiles },
        { data: comp },
        { data: subjectTeachers },
        { data: lessons },
        { data: prevLessons },
        { data: studentsAll },
      ] = await Promise.all([
        supabase
          .from('student_courses')
          .select('id, teacher_id, student_id, custom_monthly_fee, is_active, course_policies(monthly_fee, subject), students!inner(enrollment_status)')
          .eq('is_active', true) as any,
        supabase.from('profiles').select('id, full_name').eq('is_active', true),
        supabase
          .from('teacher_monthly_compensation' as any)
          .select('teacher_id, salary')
          .eq('month', month) as any,
        supabase
          .from('student_subject_teachers')
          .select('student_id, subject, teacher_id') as any,
        supabase
          .from('lesson_records')
          .select('teacher_id, student_id, subject')
          .eq('submitted', true)
          .not('teacher_id', 'is', null)
          .gte('lesson_date', monthStart)
          .lt('lesson_date', monthEnd) as any,
        supabase
          .from('lesson_records')
          .select('teacher_id, student_id, subject')
          .eq('submitted', true)
          .not('teacher_id', 'is', null)
          .gte('lesson_date', prevStart)
          .lt('lesson_date', prevEnd) as any,
        supabase
          .from('students')
          .select('id, name, grade, enrollment_status, registration_date, updated_at, sibling_group_id') as any,
      ]);

      const studentNameMap = new Map<string, { name: string; grade: string | null }>();
      const siblingGroupByStudent = new Map<string, number | null>();
      const siblingCountByGroup = new Map<number, number>();
      (studentsAll || []).forEach((s: any) => {
        studentNameMap.set(s.id, { name: s.name, grade: s.grade });
        siblingGroupByStudent.set(s.id, s.sibling_group_id ?? null);
        if (s.sibling_group_id != null && s.enrollment_status !== '퇴원') {
          siblingCountByGroup.set(s.sibling_group_id, (siblingCountByGroup.get(s.sibling_group_id) || 0) + 1);
        }
      });

      const { feeByCourse } = computeEffectiveFees(
        (courses || []) as any[],
        siblingCountByGroup,
        siblingGroupByStudent,
      );

      const curAttrib = computeAttribution(
        (courses || []) as any[],
        (subjectTeachers || []) as any[],
        (lessons || []) as any[],
        studentNameMap,
        feeByCourse,
      );
      const prevAttrib = computeAttribution(
        (courses || []) as any[],
        (subjectTeachers || []) as any[],
        (prevLessons || []) as any[],
        studentNameMap,
        feeByCourse,
      );


      const teacherNameMap = new Map<string, string>();
      (profiles || []).forEach((p: any) => teacherNameMap.set(p.id, p.full_name || '이름없음'));
      teacherNameMap.set(UNASSIGNED, '미배정');

      const compMap = new Map<string, number>();
      (comp || []).forEach((c: any) => compMap.set(c.teacher_id, Number(c.salary || 0)));

      const allTeacherIds = new Set<string>([
        ...curAttrib.keys(),
        ...prevAttrib.keys(),
        ...compMap.keys(),
      ]);

      const result: TeacherRevenueRow[] = Array.from(allTeacherIds)
        .map((tid) => {
          const cur = curAttrib.get(tid);
          const prev = prevAttrib.get(tid);
          const salary = compMap.get(tid) || 0;
          const revenue = cur?.revenue || 0;
          const profit = revenue - salary;
          const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
          // aggregate contribs per (student_id, subject)? Already per-row; group dupes for same student/subject
          const contribMap = new Map<string, StudentContrib>();
          for (const c of cur?.contribs || []) {
            const k = `${c.student_id}::${c.subject}`;
            const ex = contribMap.get(k);
            if (ex) {
              ex.fee += c.fee;
              ex.lesson_count += c.lesson_count;
            } else contribMap.set(k, { ...c });
          }
          return {
            teacher_id: tid,
            teacher_name: teacherNameMap.get(tid) || '미배정',
            revenue,
            student_count: cur?.students.size || 0,
            prev_revenue: prev?.revenue || 0,
            prev_student_count: prev?.students.size || 0,
            student_ids: cur ? Array.from(cur.students) : [],
            prev_student_ids: prev ? Array.from(prev.students) : [],
            salary,
            profit,
            margin,
            contribs: Array.from(contribMap.values()).sort((a, b) => b.fee - a.fee),
          };
        })
        .filter((r) => r.revenue > 0 || r.salary > 0 || r.prev_revenue > 0)
        .sort((a, b) => b.revenue - a.revenue);

      setRows(result);
      const draft: Record<string, string> = {};
      result.forEach((r) => (draft[r.teacher_id] = r.salary > 0 ? String(r.salary) : ''));
      setSalaryDraft(draft);

      // Movement: new (registration_date in month) and withdrawn (status=퇴원, updated_at in month)
      const newOnes: MovementStudent[] = [];
      const withdrew: MovementStudent[] = [];
      for (const s of (studentsAll || []) as any[]) {
        if (s.registration_date && s.registration_date >= monthStart && s.registration_date < monthEnd) {
          newOnes.push({ id: s.id, name: s.name, grade: s.grade, date: s.registration_date });
        }
        if (s.enrollment_status === '퇴원' && s.updated_at) {
          const d = String(s.updated_at).slice(0, 10);
          if (d >= monthStart && d < monthEnd) {
            withdrew.push({ id: s.id, name: s.name, grade: s.grade, date: d });
          }
        }
      }
      newOnes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      withdrew.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setNewStudents(newOnes);
      setWithdrawnStudents(withdrew);
    } catch (err: any) {
      console.error(err);
      toast({ title: '매출 데이터 로드 실패', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [month]);

  const saveSalary = async (teacher_id: string) => {
    const raw = salaryDraft[teacher_id] || '0';
    const salary = Number(raw.replace(/[^0-9]/g, '')) || 0;
    setSaving(teacher_id);
    const { error } = await (supabase as any)
      .from('teacher_monthly_compensation')
      .upsert({ teacher_id, month, salary }, { onConflict: 'teacher_id,month' });
    setSaving(null);
    if (error) {
      toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '급여 저장됨' });
      fetchData();
    }
  };

  const totals = useMemo(() => {
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const prevRevenue = rows.reduce((a, r) => a + r.prev_revenue, 0);
    const salary = rows.reduce((a, r) => a + r.salary, 0);
    const profit = revenue - salary;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    // Dedupe across teachers: a student taking multiple subjects from different teachers counts once.
    const curSet = new Set<string>();
    const prevSet = new Set<string>();
    rows.forEach((r) => {
      r.student_ids.forEach((id) => curSet.add(id));
      r.prev_student_ids.forEach((id) => prevSet.add(id));
    });
    const studentTotal = curSet.size;
    const prevStudentTotal = prevSet.size;
    return { revenue, prevRevenue, salary, profit, margin, studentTotal, prevStudentTotal };
  }, [rows]);

  const chartData = useMemo(
    () => rows.map((r) => ({
      name: r.teacher_name,
      매출: Math.round(r.revenue),
      전월: Math.round(r.prev_revenue),
    })),
    [rows],
  );

  const chartColors = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];

  const toggleExpand = (tid: string) =>
    setExpanded((e) => ({ ...e, [tid]: !e[tid] }));

  return (
    <div className="space-y-4">
      {/* Header / month picker */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              선생님별 매출 · 인원 · 급여
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              매출은 그 달 제출된 수업일지의 (학생·과목) 실제 수업 횟수 비율로 분배됩니다. 전월 비교는 같은 방식으로 계산.
            </p>
          </div>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground">총 매출</div>
                <div className="text-lg font-bold">{wonFmt(totals.revenue)}</div>
                <DeltaPill curr={totals.revenue} prev={totals.prevRevenue} kind="money" />
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> 담당 인원 합
                </div>
                <div className="text-lg font-bold">{totals.studentTotal}명</div>
                <DeltaPill curr={totals.studentTotal} prev={totals.prevStudentTotal} kind="count" />
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> 총 급여
                </div>
                <div className="text-lg font-bold">{wonFmt(totals.salary)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground">학원 순이익</div>
                <div className={`text-lg font-bold ${totals.profit < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {wonFmt(totals.profit)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">마진 {totals.margin.toFixed(1)}%</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      {!loading && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">선생님별 매출 (이번달 vs 전월)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => shortWon(Number(v))} />
                  <Tooltip
                    formatter={(v: any) => wonFmt(Number(v))}
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="전월" fill={chartColors[1]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="매출" fill={chartColors[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Movement: new + withdrawn */}
      {!loading && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-600">
                <UserPlus className="w-4 h-4" />
                이번달 신규 등록 <Badge variant="secondary">{newStudents.length}명</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {newStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">신규 등록 학생이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {newStudents.map((s) => (
                    <li key={s.id} className="flex items-center justify-between border-b last:border-0 pb-1.5">
                      <span className="font-medium">{s.name}{s.grade ? <span className="text-muted-foreground text-xs ml-1">{s.grade}</span> : null}</span>
                      <span className="text-xs text-muted-foreground font-mono">{s.date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                <UserMinus className="w-4 h-4" />
                이번달 퇴원 <Badge variant="secondary">{withdrawnStudents.length}명</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {withdrawnStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">퇴원 학생이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {withdrawnStudents.map((s) => (
                    <li key={s.id} className="flex items-center justify-between border-b last:border-0 pb-1.5">
                      <span className="font-medium">{s.name}{s.grade ? <span className="text-muted-foreground text-xs ml-1">{s.grade}</span> : null}</span>
                      <span className="text-xs text-muted-foreground font-mono">{s.date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-teacher table with expandable per-student breakdown */}
      <Card>
        <CardHeader className="pb-2 space-y-3">
          <CardTitle className="text-sm">선생님 상세 (▶ 클릭 시 학생별 수강료 표시)</CardTitle>
          {!loading && rows.length > 0 && (() => {
            const m = Math.max(0, Math.min(100, Number(targetMargin) || 0));
            const totalRecommended = rows.reduce(
              (a, r) => a + Math.max(0, Math.round(r.revenue * (1 - m / 100))),
              0,
            );
            const totalDiff = totalRecommended - totals.salary;
            return (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Calculator className="w-4 h-4" />
                  목표 마진율
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={targetMargin}
                    onChange={(e) => setTargetMargin(e.target.value)}
                    className="h-8 w-20 text-right font-mono"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  → 추천 총 급여{' '}
                  <span className="font-mono font-semibold text-foreground">{wonFmt(totalRecommended)}</span>
                  {totals.salary > 0 && (
                    <span className={`ml-2 ${totalDiff < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      (현재 대비 {totalDiff >= 0 ? '+' : ''}{wonFmt(totalDiff)})
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 ml-auto"
                  onClick={() => {
                    const next: Record<string, string> = { ...salaryDraft };
                    rows.forEach((r) => {
                      next[r.teacher_id] = String(Math.max(0, Math.round(r.revenue * (1 - m / 100))));
                    });
                    setSalaryDraft(next);
                    toast({ title: `목표 마진 ${m}% 기준 추천 급여를 입력란에 반영했습니다`, description: '각 행의 저장 버튼을 눌러 확정하세요.' });
                  }}
                >
                  전체 입력란에 반영
                </Button>
              </div>
            );
          })()}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>선생님</TableHead>
                    <TableHead className="text-center">담당 학생</TableHead>
                    <TableHead className="text-center">전월 대비</TableHead>
                    <TableHead className="text-right">매출</TableHead>
                    <TableHead className="w-44">급여 (원)</TableHead>
                    <TableHead className="text-right">추천 급여</TableHead>
                    <TableHead className="text-right">차액</TableHead>
                    <TableHead className="text-right">마진</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        해당 월 매출 데이터가 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => {
                      const isOpen = !!expanded[r.teacher_id];
                      const studentDelta = r.student_count - r.prev_student_count;
                      const revDelta = r.revenue - r.prev_revenue;
                      return (
                        <Fragment key={r.teacher_id}>
                          <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggleExpand(r.teacher_id)}>
                            <TableCell>
                              <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                            </TableCell>
                            <TableCell className="font-medium">{r.teacher_name}</TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{r.student_count}</span>
                              <span className="text-muted-foreground text-xs"> / 전월 {r.prev_student_count}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <DeltaPill curr={r.student_count} prev={r.prev_student_count} kind="count" compact />
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <div>{wonFmt(r.revenue)}</div>
                              <div className={`text-[10px] font-sans ${revDelta < 0 ? 'text-destructive' : revDelta > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                {revDelta === 0 ? '±0' : (revDelta > 0 ? '+' : '') + wonFmt(revDelta)}
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-1">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={salaryDraft[r.teacher_id] ?? ''}
                                  onChange={(e) =>
                                    setSalaryDraft({ ...salaryDraft, [r.teacher_id]: e.target.value })
                                  }
                                  className="h-8 text-right font-mono"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  disabled={saving === r.teacher_id}
                                  onClick={() => saveSalary(r.teacher_id)}
                                >
                                  <Save className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(() => {
                                const m = Math.max(0, Math.min(100, Number(targetMargin) || 0));
                                const rec = Math.max(0, Math.round(r.revenue * (1 - m / 100)));
                                const diff = rec - r.salary;
                                return (
                                  <div className="flex items-center justify-end gap-1">
                                    <div className="text-right">
                                      <div className="text-xs">{wonFmt(rec)}</div>
                                      {r.salary > 0 && (
                                        <div className={`text-[10px] font-sans ${diff < 0 ? 'text-destructive' : diff > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                          {diff === 0 ? '±0' : (diff > 0 ? '+' : '') + shortWon(Math.abs(diff))}
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      title="이 추천 급여를 입력란에 반영"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSalaryDraft({ ...salaryDraft, [r.teacher_id]: String(rec) });
                                      }}
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <span className={r.profit < 0 ? 'text-destructive' : 'text-emerald-600'}>
                                {r.profit >= 0 ? '+' : ''}{wonFmt(r.profit)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className={r.margin < 0 ? 'border-destructive text-destructive' : ''}>
                                {r.margin.toFixed(1)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow key={r.teacher_id + '_detail'} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell></TableCell>
                              <TableCell colSpan={8} className="py-3">
                                {r.contribs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">담당 학생 수강료 데이터가 없습니다.</p>
                                ) : (
                                  <div className="rounded border bg-background">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="h-8">학생</TableHead>
                                          <TableHead className="h-8">과목</TableHead>
                                          <TableHead className="h-8 text-center">수업횟수</TableHead>
                                          <TableHead className="h-8 text-center">분배 %</TableHead>
                                          <TableHead className="h-8 text-right">귀속 수강료</TableHead>
                                          <TableHead className="h-8 text-center">근거</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {r.contribs.map((c, i) => (
                                          <TableRow key={i}>
                                            <TableCell className="py-1.5 font-medium">{c.student_name}</TableCell>
                                            <TableCell className="py-1.5">
                                              <Badge variant="outline" className="text-[10px]">{c.subject || '-'}</Badge>
                                            </TableCell>
                                            <TableCell className="py-1.5 text-center text-xs">
                                              {c.source === 'lessons' ? `${c.lesson_count}회` : '-'}
                                            </TableCell>
                                            <TableCell className="py-1.5 text-center text-xs">
                                              {c.share_pct.toFixed(0)}%
                                            </TableCell>
                                            <TableCell className="py-1.5 text-right font-mono">
                                              {wonFmt(c.fee)}
                                            </TableCell>
                                            <TableCell className="py-1.5 text-center">
                                              <span className="text-[10px] text-muted-foreground">
                                                {c.source === 'lessons' && '수업일지'}
                                                {c.source === 'subject_teacher' && '과목담당'}
                                                {c.source === 'course' && '수강담당'}
                                                {c.source === 'unassigned' && '미배정'}
                                              </span>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/40 font-semibold">
                                          <TableCell colSpan={4} className="py-1.5 text-right text-xs">합계</TableCell>
                                          <TableCell className="py-1.5 text-right font-mono">
                                            {wonFmt(r.contribs.reduce((a, c) => a + c.fee, 0))}
                                          </TableCell>
                                          <TableCell></TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeltaPill({
  curr, prev, kind, compact,
}: { curr: number; prev: number; kind: 'money' | 'count'; compact?: boolean }) {
  const diff = curr - prev;
  if (diff === 0 && prev === 0) {
    return <div className="text-[10px] text-muted-foreground mt-0.5">전월 데이터 없음</div>;
  }
  const positive = diff > 0;
  const Icon = positive ? TrendingUp : diff < 0 ? TrendingDown : ArrowRight;
  const colorClass = diff === 0
    ? 'text-muted-foreground'
    : positive ? 'text-emerald-600' : 'text-destructive';
  const text = kind === 'money'
    ? (diff === 0 ? '±0' : (positive ? '+' : '') + shortWon(Math.abs(diff)))
    : (diff === 0 ? '±0명' : (positive ? '+' : '-') + Math.abs(diff) + '명');
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs ${colorClass}`}>
        <Icon className="w-3 h-3" />{text}
      </span>
    );
  }
  return (
    <div className={`text-[10px] mt-0.5 inline-flex items-center gap-0.5 ${colorClass}`}>
      <Icon className="w-3 h-3" />전월 대비 {text}
    </div>
  );
}
