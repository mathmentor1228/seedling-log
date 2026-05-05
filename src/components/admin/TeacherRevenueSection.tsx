// TEACHER-REVENUE-SECTION-V1
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
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Wallet, Save } from 'lucide-react';

interface TeacherRevenueRow {
  teacher_id: string;
  teacher_name: string;
  revenue: number;     // 매출 (해당 월 선생님이 담당한 학생들의 수강료 합)
  student_count: number;
  salary: number;       // 입력한 급여
  profit: number;       // 매출 - 급여
  margin: number;       // 학원 마진 % = profit/revenue*100
}

const wonFmt = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

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

export default function TeacherRevenueSection() {
  const { toast } = useToast();
  const months = useMemo(() => getMonthOptions(), []);
  const [month, setMonth] = useState(months[0]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeacherRevenueRow[]>([]);
  const [salaryDraft, setSalaryDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1) Active student_courses with teacher_id (assumes current monthly fees)
      // For past months, prefer payment_records if available; fallback to active courses.
      const monthStart = `${month}-01`;
      const monthEndDate = new Date(month + '-01');
      monthEndDate.setMonth(monthEndDate.getMonth() + 1);
      const monthEnd = monthEndDate.toISOString().slice(0, 10);

      const [
        { data: payments },
        { data: courses },
        { data: profiles },
        { data: comp },
      ] = await Promise.all([
        supabase
          .from('payment_records')
          .select('amount, paid_date, billing_schedule_id, billing_schedules(student_course_id, student_courses(teacher_id, student_id))')
          .gte('paid_date', monthStart)
          .lt('paid_date', monthEnd) as any,
        supabase
          .from('student_courses')
          .select('id, teacher_id, student_id, custom_monthly_fee, is_active, course_policies(monthly_fee), students!inner(enrollment_status)')
          .eq('is_active', true) as any,
        supabase.from('profiles').select('id, full_name').eq('is_active', true),
        supabase
          .from('teacher_monthly_compensation' as any)
          .select('teacher_id, salary')
          .eq('month', month) as any,
      ]);

      const teacherMap = new Map<string, { name: string; revenue: number; students: Set<string> }>();
      (profiles || []).forEach((p: any) =>
        teacherMap.set(p.id, { name: p.full_name || '미배정', revenue: 0, students: new Set() }),
      );

      const UNASSIGNED = '__unassigned__';
      let usedPayments = false;
      if (payments && payments.length > 0) {
        usedPayments = true;
        for (const pr of payments as any[]) {
          const tid = pr.billing_schedules?.student_courses?.teacher_id || UNASSIGNED;
          const sid = pr.billing_schedules?.student_courses?.student_id;
          if (!teacherMap.has(tid)) teacherMap.set(tid, { name: '미배정', revenue: 0, students: new Set() });
          const e = teacherMap.get(tid)!;
          e.revenue += Number(pr.amount || 0);
          if (sid) e.students.add(sid);
        }
      }

      // Always also compute "expected" from active courses for active students
      const expected = new Map<string, { revenue: number; students: Set<string> }>();
      for (const c of (courses || []) as any[]) {
        const tid = c.teacher_id || UNASSIGNED;
        const status = c.students?.enrollment_status;
        if (status !== '재학' && status !== '재등원') continue;
        const fee = Number(c.custom_monthly_fee ?? c.course_policies?.monthly_fee ?? 0);
        if (!expected.has(tid)) expected.set(tid, { revenue: 0, students: new Set() });
        const e = expected.get(tid)!;
        e.revenue += fee;
        e.students.add(c.student_id);
      }

      // Merge: use payments when present, else expected
      if (!usedPayments) {
        for (const [tid, v] of expected.entries()) {
          if (!teacherMap.has(tid)) teacherMap.set(tid, { name: '미배정', revenue: 0, students: new Set() });
          const e = teacherMap.get(tid)!;
          e.revenue = v.revenue;
          e.students = v.students;
        }
      }

      const compMap = new Map<string, number>();
      (comp || []).forEach((c: any) => compMap.set(c.teacher_id, Number(c.salary || 0)));

      const result: TeacherRevenueRow[] = Array.from(teacherMap.entries())
        .map(([teacher_id, v]) => {
          const salary = compMap.get(teacher_id) || 0;
          const profit = v.revenue - salary;
          const margin = v.revenue > 0 ? (profit / v.revenue) * 100 : 0;
          return {
            teacher_id,
            teacher_name: v.name,
            revenue: v.revenue,
            student_count: v.students.size,
            salary,
            profit,
            margin,
          };
        })
        .filter((r) => r.revenue > 0 || r.salary > 0)
        .sort((a, b) => b.revenue - a.revenue);

      setRows(result);
      const draft: Record<string, string> = {};
      result.forEach((r) => (draft[r.teacher_id] = r.salary > 0 ? String(r.salary) : ''));
      setSalaryDraft(draft);
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
    const salary = rows.reduce((a, r) => a + r.salary, 0);
    const profit = revenue - salary;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, salary, profit, margin };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            선생님별 매출 / 급여 / 마진
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            매출 = 결제이력 우선, 없으면 재원 학생 활성 수강의 월 수강료 합산
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
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground">총 매출</div>
                <div className="text-lg font-bold">{wonFmt(totals.revenue)}</div>
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
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground">학원 마진율</div>
                <div className={`text-lg font-bold ${totals.margin < 0 ? 'text-destructive' : ''}`}>
                  {totals.margin.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>선생님</TableHead>
                    <TableHead className="text-center">담당 학생</TableHead>
                    <TableHead className="text-right">매출</TableHead>
                    <TableHead className="w-44">급여 (원)</TableHead>
                    <TableHead className="text-right">차액 (±)</TableHead>
                    <TableHead className="text-right">학원 마진</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        해당 월 매출 데이터가 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.teacher_id}>
                        <TableCell className="font-medium">{r.teacher_name}</TableCell>
                        <TableCell className="text-center">{r.student_count}명</TableCell>
                        <TableCell className="text-right font-mono">{wonFmt(r.revenue)}</TableCell>
                        <TableCell>
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
                          <span className={r.profit < 0 ? 'text-destructive' : 'text-emerald-600'}>
                            {r.profit >= 0 ? '+' : ''}{wonFmt(r.profit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={r.margin < 0 ? 'border-destructive text-destructive' : ''}
                          >
                            {r.margin.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
