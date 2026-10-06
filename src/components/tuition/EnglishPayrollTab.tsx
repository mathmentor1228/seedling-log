import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { computeEnglishFee, computePay } from '@/lib/englishPayroll';

const TEACHER_ID = '916c5055-2a8c-46d8-b84c-fd280d7f541f'; // 이재진(영어)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const won = (n: number) => n.toLocaleString() + '원';
const prevDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return format(new Date(y, m - 1, d - 1), 'yyyy-MM-dd'); };
/** 수강 종료일(포함)과 퇴원일 전날 중 빠른 날 = 마지막 정산일 */
const endOf = (c: any): string | null => {
  const wd = c.students?.withdrawn_at?.slice(0, 10);
  return [c.end_date, wd ? prevDay(wd) : null].filter(Boolean).sort()[0] || null;
};

interface Row {
  courseId: string; studentId: string; name: string; schoolLevel: string | null;
  startDate: string; endDate: string | null; subjectCount: number; isSibling: boolean; days: number[];
  grade: string; daySource: 'schedule' | 'lessons' | 'manual' | 'none'; withdrawn: boolean; withdrawnAt: string | null;
}

export function EnglishPayrollTab() {
  const now = new Date();
  const [month, setMonth] = useState(format(now, 'yyyy-MM'));
  const [rows, setRows] = useState<Row[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { amount: number | null; memo: string | null; days: number[] | null }>>({});
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'grade' | 'start' | 'none'>('grade');
  const [gradeFilter, setGradeFilter] = useState('all');

  const months = Array.from({ length: 8 }, (_, i) => format(new Date(now.getFullYear(), now.getMonth() + i - 5, 1), 'yyyy-MM'));

  const load = async () => {
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const mStart = `${month}-01`;
    const mEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const { data: courses } = await supabase
      .from('student_courses')
      .select('id, student_id, enrollment_date, end_date, course_policies(subject), students(name, school_level, grade, grade_year, sibling_group_id, withdrawn_at)')
      .eq('teacher_id', TEACHER_ID)
      .lte('enrollment_date', mEnd);
    const list = (courses || []).filter((c: any) => {
      const end = endOf(c);
      return (c.course_policies?.subject === '영어') && (!end || end >= mStart);
    });
    const ids = [...new Set(list.map((c: any) => c.student_id))];

    const NONE = ['00000000-0000-0000-0000-000000000000'];
    const lookback = format(new Date(y, m - 3, 1), 'yyyy-MM-dd');
    const [{ data: allCourses }, { data: cls }, { data: sibs }, { data: ov }, { data: lessons }] = await Promise.all([
      supabase.from('student_courses').select('student_id, enrollment_date, end_date, is_active, course_policies(subject)').in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('class_students').select('student_id, classes(class_schedules(day_of_week, teacher_id, is_active))').in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('students').select('id, sibling_group_id, enrollment_status').not('sibling_group_id', 'is', null),
      (supabase as any).from('teacher_payroll_overrides').select('student_course_id, override_amount, memo, class_days').eq('billing_month', month),
      supabase.from('lesson_records').select('student_id, lesson_date').eq('teacher_id', TEACHER_ID).in('student_id', ids.length ? ids : NONE).gte('lesson_date', lookback).lte('lesson_date', mEnd).limit(5000),
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
    // 퇴원 등으로 시간표가 지워진 학생: 최근 수업일지 요일로 대체
    const lessonDays = new Map<string, Map<number, number>>();
    (lessons || []).forEach((l: any) => {
      const [ly, lm, ld] = l.lesson_date.split('-').map(Number);
      const dw = new Date(ly, lm - 1, ld).getDay();
      const mp = lessonDays.get(l.student_id) || new Map(); mp.set(dw, (mp.get(dw) || 0) + 1); lessonDays.set(l.student_id, mp);
    });
    const ovMap = new Map<string, any>((ov || []).map((o: any) => [o.student_course_id, o]));
    const groupCount = new Map<number, number>();
    (sibs || []).forEach((s: any) => groupCount.set(s.sibling_group_id, (groupCount.get(s.sibling_group_id) || 0) + 1));

    setRows(list.map((c: any) => {
      const end = endOf(c);
      const g = c.students?.sibling_group_id;
      const manual: number[] | null = ovMap.get(c.id)?.class_days || null;
      const sched = [...(daysBy.get(c.student_id) || [])].sort();
      const lmp = lessonDays.get(c.student_id);
      const fromLessons = lmp ? [...lmp.entries()].filter(([, n]) => n >= 2 || lmp.size <= 3).map(([d]) => d).sort() : [];
      let days = sched, daySource: Row['daySource'] = sched.length ? 'schedule' : 'none';
      if (manual && manual.length) { days = [...manual].sort(); daySource = 'manual'; }
      else if (!sched.length && fromLessons.length) { days = fromLessons; daySource = 'lessons'; }
      const st = c.students || {};
      const grade = st.grade || (st.school_level && st.grade_year ? `${st.school_level}${st.grade_year}` : (st.school_level === '고' ? '고등' : '중등'));
      return {
        grade, daySource, withdrawn: !!st.withdrawn_at, withdrawnAt: st.withdrawn_at?.slice(0, 10) || null,
        courseId: c.id, studentId: c.student_id, name: c.students?.name || '-',
        schoolLevel: c.students?.school_level, startDate: c.enrollment_date, endDate: end,
        subjectCount: Math.max(1, subjBy.get(c.student_id)?.size || 1),
        isSibling: g != null && (groupCount.get(g) || 0) >= 2,
        days,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko')));
    setOverrides(Object.fromEntries((ov || []).map((o: any) => [o.student_course_id, { amount: o.override_amount, memo: o.memo, days: o.class_days }])));
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
      if (overrides[courseId]?.days?.length) await t.update({ override_amount: null }).eq('student_course_id', courseId).eq('billing_month', month);
      else await t.delete().eq('student_course_id', courseId).eq('billing_month', month);
    } else {
      const amount = Math.round(Number(value.replace(/,/g, '')));
      if (!Number.isFinite(amount)) return toast.error('숫자를 입력하세요');
      const { data: u } = await supabase.auth.getUser();
      const { error } = await t.upsert({ student_course_id: courseId, billing_month: month, override_amount: amount, updated_by: u.user?.id }, { onConflict: 'student_course_id,billing_month' });
      if (error) return toast.error('저장 실패');
    }
    toast.success('금액 저장'); load();
  };

  const saveDays = async (courseId: string, days: number[] | null) => {
    const t = (supabase as any).from('teacher_payroll_overrides');
    const o = overrides[courseId];
    if (!days && o?.amount == null) {
      await t.delete().eq('student_course_id', courseId).eq('billing_month', month);
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await t.upsert({ student_course_id: courseId, billing_month: month, override_amount: o?.amount ?? null, class_days: days, updated_by: u.user?.id }, { onConflict: 'student_course_id,billing_month' });
      if (error) return toast.error('요일 저장 실패');
    }
    toast.success(days ? '수업 요일 조정' : '기본 요일로 복원'); load();
  };

  const toggleDay = (r: Row, d: number) => {
    const next = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d].sort();
    saveDays(r.courseId, next.length ? next : null);
  };

  const grades = useMemo(() => [...new Set(rows.map(r => r.grade))].sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const visible = computed.filter(x => gradeFilter === 'all' || x.r.grade === gradeFilter);
  const groups = useMemo(() => {
    const mp = new Map<string, typeof computed>();
    const gradeGroupLabel = (r: Row) => {
      const ym = r.grade.match(/(\d+)/)?.[1];
      const lv = r.schoolLevel === '고' ? '고' : r.schoolLevel === '중' ? '중' : '';
      if (lv && ym) return `${lv}${ym}그룹`;
      if (ym) return `${ym}학년 그룹`;
      return '학년 미상';
    };
    visible.forEach(x => {
      const k = groupBy === 'grade' ? gradeGroupLabel(x.r) : groupBy === 'start' ? x.r.startDate : '전체';
      mp.set(k, [...(mp.get(k) || []), x]);
    });
    const order = (k: string) => {
      const m = k.match(/^([중고])(\d)/);
      if (m) return (m[1] === '중' ? 0 : 10) + Number(m[2]);
      return 99;
    };
    return [...mp.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0], 'ko', { numeric: true }));
  }, [visible, groupBy]);

  const printSheet = () => {
    const [y, m] = month.split('-');
    const rowsHtml = computed.map(({ r, c, fee }) => `<tr><td>${r.name}</td><td>${r.days.map(d => DOW[d]).join('')}</td><td></td><td class="n">${c.total}</td><td class="n">${c.attended}</td><td class="n">${won(Math.round(fee * 0.4))}</td><td>${r.endDate ? '종료 ' + r.endDate : ''}</td></tr>`).join('');
    const blank = Array.from({ length: Math.max(0, 5 - 0) }, () => '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
    const w = window.open('', '_blank');
    if (!w) return toast.error('팝업이 차단되었습니다');
    w.document.write(`<html><head><title>월별 강사 정산서 ${month}</title><style>
      @page{size:A4;margin:14mm}body{font-family:'Noto Sans KR',sans-serif;font-size:11px;color:#111}
      h1{color:#1f2a6b;font-size:22px;margin:0 0 14px}
      .top{display:flex;justify-content:space-between;margin-bottom:14px}.info td{padding:3px 14px 3px 0}
      table{border-collapse:collapse}.sum td{border:1px solid #333;padding:3px 8px}.sum td:first-child{background:#e5e7eb;font-weight:bold;text-align:center}
      .main{width:100%}.main th{background:#1f2a6b;color:#fff;padding:4px;border:1px solid #333}.main td{border:1px solid #555;padding:2px 6px;text-align:center}
      .main tr:nth-child(even) td{background:#f1f3f9}.n{text-align:right!important}
      .foot{display:flex;justify-content:space-between;margin-top:24px}.sign div{margin-bottom:22px}
    </style></head><body>
      <h1>월별 강사 정산서</h1>
      <div class="top"><table class="info"><tr><td><b>강사명</b></td><td>이재진</td></tr><tr><td><b>정산월</b></td><td>${y}-${m}</td></tr></table>
      <table class="sum"><tr><td>총 정산 급여</td><td class="n">${won(pay.gross)}</td></tr><tr><td>공제액 (3.3%)</td><td class="n">${won(pay.tax)}</td></tr><tr><td>실 지급액</td><td class="n">${won(pay.net)}</td></tr></table></div>
      <table class="main"><thead><tr><th>학생명</th><th>기본 요일</th><th>당월 요일</th><th>당월 총회차</th><th>실제 출석</th><th>강사 급여</th><th>비고</th></tr></thead><tbody>${rowsHtml}${blank}</tbody></table>
      <div class="foot"><div>위와 같이 정산 내역을 확인합니다.</div><div class="sign"><div>일자:</div><div>서명:</div></div></div>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m.replace('-', '년 ')}월</SelectItem>)}</SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={v => setGroupBy(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="grade">학년별 보기</SelectItem><SelectItem value="start">수강 시작일별</SelectItem><SelectItem value="none">묶지 않음</SelectItem></SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">전체 학년</SelectItem>{grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={printSheet} disabled={loading} className="gap-1.5"><Printer className="h-4 w-4" />정산서 인쇄</Button>
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
            <Table className="min-w-[1150px]">
              <TableHeader><TableRow>
                <TableHead className="sticky left-0 z-30 bg-card">학생</TableHead><TableHead>시작일</TableHead><TableHead>요일</TableHead>
                <TableHead className="text-right">기본</TableHead><TableHead className="text-right">할인</TableHead>
                <TableHead className="text-right">시수</TableHead><TableHead className="text-right">계산 원비</TableHead>
                <TableHead className="text-right">최종 원비(수정)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {groups.map(([key, items]) => [
                  groupBy !== 'none' && <TableRow key={'g-' + key} className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={8} className="py-1.5 text-xs font-semibold">
                    {groupBy === 'start' ? `시작 ${key}` : key} · {items.length}명 · 원비 {won(items.reduce((s, x) => s + x.fee, 0))}
                  </TableCell></TableRow>,
                  ...items.map(({ r, c, fee, overridden }) => (
                  <TableRow key={r.courseId}>
                    <TableCell className="font-medium whitespace-nowrap sticky left-0 z-20 bg-card group-hover/tr:bg-card">
                      {r.name} <span className="text-xs text-muted-foreground">{r.grade}</span>
                      {r.withdrawn && <div className="text-[10px] text-destructive">퇴원 {r.withdrawnAt || '날짜 미상'} · {r.endDate || '?'}까지 반영</div>}
                      {!r.withdrawn && r.endDate && <div className="text-[10px] text-destructive">수업 종료 {r.endDate} · {r.endDate}까지 반영</div>}
                    </TableCell>
                    <TableCell>
                      <Input type="date" defaultValue={r.startDate} className="h-8 w-36" onBlur={e => e.target.value !== r.startDate && saveStart(r.courseId, e.target.value)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex gap-0.5">{[1, 2, 3, 4, 5, 6, 0].map(d => (
                        <button key={d} type="button" onClick={() => toggleDay(r, d)}
                          className={`h-6 w-6 rounded text-[11px] border ${r.days.includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:bg-muted'}`}>{DOW[d]}</button>
                      ))}</div>
                      <div className="text-[10px] mt-0.5 text-muted-foreground">
                        {r.daySource === 'manual' && <>직접 조정 · <button type="button" className="underline" onClick={() => saveDays(r.courseId, null)}>기본으로</button></>}
                        {r.daySource === 'lessons' && '지난 수업일지 기준'}
                        {r.daySource === 'none' && <span className="text-destructive">요일을 눌러 지정</span>}
                      </div>
                    </TableCell>
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
                ))])}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">최종 원비 칸에 금액을 넣으면 그 달만 그 금액으로 계산되고, 비우면 자동 계산으로 돌아갑니다. 출결·공휴일은 반영하지 않습니다. 요일 버튼으로 그 달 수업 요일을 조정할 수 있고, 퇴원생은 퇴원일 전날까지 계산됩니다.</p>
    </div>
  );
}
