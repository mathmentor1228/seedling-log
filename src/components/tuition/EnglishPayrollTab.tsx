import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { computeEnglishFee, computePay } from '@/lib/englishPayroll';

const TEACHER_ID = '916c5055-2a8c-46d8-b84c-fd280d7f541f'; // 이재진(영어)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const won = (n: number) => n.toLocaleString() + '원';

interface Row {
  courseId: string; studentId: string; name: string; schoolLevel: string | null;
  startDate: string; endDate: string | null; subjectCount: number; isSibling: boolean; days: number[];
}

export function EnglishPayrollTab() {
  const now = new Date();
  const [month, setMonth] = useState(format(now, 'yyyy-MM'));
  const [rows, setRows] = useState<Row[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { amount: number | null; memo: string | null }>>({});
  const [loading, setLoading] = useState(true);

  const months = Array.from({ length: 8 }, (_, i) => format(new Date(now.getFullYear(), now.getMonth() + i - 5, 1), 'yyyy-MM'));

  const load = async () => {
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const mStart = `${month}-01`;
    const mEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const { data: courses } = await supabase
      .from('student_courses')
      .select('id, student_id, enrollment_date, end_date, course_policies(subject), students(name, school_level, sibling_group_id, withdrawn_at)')
      .eq('teacher_id', TEACHER_ID)
      .lte('enrollment_date', mEnd);
    const list = (courses || []).filter((c: any) => {
      const end = [c.end_date, c.students?.withdrawn_at?.slice(0, 10)].filter(Boolean).sort()[0];
      return (c.course_policies?.subject === '영어') && (!end || end >= mStart);
    });
    const ids = [...new Set(list.map((c: any) => c.student_id))];

    const [{ data: allCourses }, { data: cls }, { data: sibs }, { data: ov }] = await Promise.all([
      supabase.from('student_courses').select('student_id, enrollment_date, end_date, is_active, course_policies(subject)').in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('class_students').select('student_id, classes(class_schedules(day_of_week, teacher_id, is_active))').in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('students').select('id, sibling_group_id, enrollment_status').not('sibling_group_id', 'is', null),
      (supabase as any).from('teacher_payroll_overrides').select('student_course_id, override_amount, memo').eq('billing_month', month),
    ]);

    const subjBy = new Map<string, Set<string>>();
    (allCourses || []).forEach((c: any) => {
      if (c.enrollment_date > mEnd || (c.end_date && c.end_date < mStart)) return;
      if (!c.is_active && !c.end_date) return;
      const s = subjBy.get(c.student_id) || new Set();
      if (c.course_policies?.subject) s.add(c.course_policies.subject);
      subjBy.set(c.student_id, s);
    });
    const daysBy = new Map<string, Set<number>>();
    (cls || []).forEach((r: any) => {
      (r.classes?.class_schedules || []).forEach((s: any) => {
        if (s.teacher_id !== TEACHER_ID || !s.is_active) return;
        const set = daysBy.get(r.student_id) || new Set();
        set.add(s.day_of_week); daysBy.set(r.student_id, set);
      });
    });
    const groupCount = new Map<number, number>();
    (sibs || []).forEach((s: any) => groupCount.set(s.sibling_group_id, (groupCount.get(s.sibling_group_id) || 0) + 1));

    setRows(list.map((c: any) => {
      const wd = c.students?.withdrawn_at?.slice(0, 10) || null;
      const end = [c.end_date, wd].filter(Boolean).sort()[0] || null;
      const g = c.students?.sibling_group_id;
      return {
        courseId: c.id, studentId: c.student_id, name: c.students?.name || '-',
        schoolLevel: c.students?.school_level, startDate: c.enrollment_date, endDate: end,
        subjectCount: Math.max(1, subjBy.get(c.student_id)?.size || 1),
        isSibling: g != null && (groupCount.get(g) || 0) >= 2,
        days: [...(daysBy.get(c.student_id) || [])].sort(),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko')));
    setOverrides(Object.fromEntries((ov || []).map((o: any) => [o.student_course_id, { amount: o.override_amount, memo: o.memo }])));
    setLoading(false);
  };

  useEffect(() => { load(); }, [month]);

  const computed = useMemo(() => rows.map(r => {
    const c = computeEnglishFee({ ...r, month });
    const o = overrides[r.courseId];
    const fee = o?.amount != null ? o.amount : c.fee;
    return { r, c, fee, overridden: o?.amount != null };
  }), [rows, overrides, month]);

  const totalFee = computed.reduce((s, x) => s + x.fee, 0);
  const pay = computePay(totalFee);

  const saveStart = async (courseId: string, date: string) => {
    if (!date) return;
    const { error } = await supabase.from('student_courses').update({ enrollment_date: date }).eq('id', courseId);
    if (error) return toast.error('시작일 저장 실패');
    toast.success('시작일 저장'); load();
  };

  const saveOverride = async (courseId: string, value: string) => {
    const t = (supabase as any).from('teacher_payroll_overrides');
    if (value.trim() === '') {
      await t.delete().eq('student_course_id', courseId).eq('billing_month', month);
    } else {
      const amount = Math.round(Number(value.replace(/,/g, '')));
      if (!Number.isFinite(amount)) return toast.error('숫자를 입력하세요');
      const { data: u } = await supabase.auth.getUser();
      const { error } = await t.upsert({ student_course_id: courseId, billing_month: month, override_amount: amount, updated_by: u.user?.id }, { onConflict: 'student_course_id,billing_month' });
      if (error) return toast.error('저장 실패');
    }
    toast.success('금액 저장'); load();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m.replace('-', '년 ')}월</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">영어 이재진 · 중등 25만 / 고등 32만 · 시작일~말일 수업 횟수로 일할 · 급여 40% · 세금 3.3%</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['원비 합계', totalFee], ['급여(40%)', pay.gross], ['세액(3.3%)', pay.tax], ['실지급액', pay.net]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-bold">{won(v as number)}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">학생별 정산 ({rows.length}명)</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-8 text-center text-muted-foreground">불러오는 중...</div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>학생</TableHead><TableHead>시작일</TableHead><TableHead>요일</TableHead>
                <TableHead className="text-right">기본</TableHead><TableHead className="text-right">할인</TableHead>
                <TableHead className="text-right">시수</TableHead><TableHead className="text-right">계산 원비</TableHead>
                <TableHead className="text-right">최종 원비(수정)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {computed.map(({ r, c, fee, overridden }) => (
                  <TableRow key={r.courseId}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {r.name} <span className="text-xs text-muted-foreground">{r.schoolLevel === '고' ? '고등' : '중등'}</span>
                      {r.endDate && <div className="text-[10px] text-destructive">종료 {r.endDate}</div>}
                    </TableCell>
                    <TableCell>
                      <Input type="date" defaultValue={r.startDate} className="h-8 w-36" onBlur={e => e.target.value !== r.startDate && saveStart(r.courseId, e.target.value)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.days.length ? r.days.map(d => DOW[d]).join('/') : <Badge variant="destructive">요일없음</Badge>}</TableCell>
                    <TableCell className="text-right">{c.base.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">
                      {c.sib > 0 && <div>형제 -{c.sib.toLocaleString()}</div>}
                      {c.multi > 0 && <div>{r.subjectCount}과목 -{c.multi.toLocaleString()}</div>}
                      {!c.sib && !c.multi && '-'}
                    </TableCell>
                    <TableCell className="text-right">{c.attended}/{c.total}</TableCell>
                    <TableCell className="text-right">{c.fee.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Input key={`${r.courseId}-${fee}`} defaultValue={overridden ? String(fee) : ''} placeholder={fee.toLocaleString()}
                        className={`h-8 w-28 ml-auto text-right ${overridden ? 'border-primary' : ''}`}
                        onBlur={e => { const v = e.target.value; if (v !== (overridden ? String(fee) : '')) saveOverride(r.courseId, v); }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">최종 원비 칸에 금액을 넣으면 그 달만 그 금액으로 계산되고, 비우면 자동 계산으로 돌아갑니다. 출결·공휴일은 반영하지 않습니다.</p>
    </div>
  );
}
