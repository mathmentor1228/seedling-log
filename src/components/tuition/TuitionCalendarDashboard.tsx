import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import { cn, getTodayKST, getKSTDateObject } from '@/lib/utils';
import { allRows, loadMonthLedger, recordManualPayment } from '@/lib/tuitionLedgerApi';
import { supabase } from '@/integrations/supabase/client';
import { dueDate } from '@/lib/tuitionLedger';
import { scheduledPaymentDate, studentMonthPaymentDates, type PaymentSchedule } from '@/lib/tuitionPaymentDates';
import { PaymentTiming } from './PaymentTiming';
import { MonthInput } from './LedgerControls';
import { StudentPaymentLink, useTuitionLedger } from './TuitionLedgerContext';
import { SourceBadge } from './LedgerControls';
import { filterTuitionStudents, sortTuitionStudents, type TuitionStatusFilter, type TuitionSortKey, type TuitionSortDirection } from './tuitionCalendarFilters';
import {
  ChevronLeft, ChevronRight, Loader2, Check, Wallet, Users,
  CalendarDays, TrendingUp, AlertTriangle, Search, X, RotateCcw, ArrowUpNarrowWide, ArrowDownWideNarrow
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';

interface StudentDue {
  id: string;
  name: string;
  payment_due_day: number;
  scheduledDueDate?: string | null;
  dueDateBasis?: 'billing' | 'current' | 'unknown';
  school: string | null;
  grade: string | null;
  parent_phone: string | null;
  tuition_memo: string | null;
  totalFee: number;
  isPaid: boolean;
  paidAmount: number;
  paymentId?: string;
}

export function TuitionCalendarDashboard() {
  const [currentMonth, setCurrentMonth] = useState(getKSTDateObject());
  const { revision, changed } = useTuitionLedger();
  const [loadError, setLoadError] = useState('');
  const [payBillingMonth, setPayBillingMonth] = useState('');
  const [payDate, setPayDate] = useState(getTodayKST());
  const [students, setStudents] = useState<StudentDue[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TuitionStatusFilter>('all');
  const [sortKey, setSortKey] = useState<TuitionSortKey>('due_date');
  const [sortDirection, setSortDirection] = useState<TuitionSortDirection>('asc');

  // Payment modal
  const [payModalStudent, setPayModalStudent] = useState<StudentDue | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('계좌이체');
  const [payMemo, setPayMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    loadData();
  }, [monthStr, revision]);

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ledger, billings] = await Promise.all([
        loadMonthLedger(monthStr),
        allRows(() => supabase.from('billing_schedules').select('student_id,billing_month,due_date,status').eq('billing_month', monthStr).order('id')),
      ]);
      setSchedules(billings);
      setStudents(ledger.students.map(student => {
        const scheduled = scheduledPaymentDate(student.id, monthStr, billings, student.payment_due_day);
        return {...student, scheduledDueDate: scheduled.date, dueDateBasis: scheduled.basis};
      }));
      setPayments(ledger.payments.filter(p => !p.canceled_at));
    } catch { setLoadError('수납 정보를 불러오지 못했습니다'); }
    finally { setLoading(false); }
  };

  // Calendar data
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    return days;
  }, [currentMonth]);

  const filteredStudents = useMemo(
    () => filterTuitionStudents(students, search, statusFilter),
    [students, search, statusFilter],
  );

  const dayData = useMemo(() => {
    const map: Record<number, { due: number; paid: number; count: number; paidCount: number }> = {};
    for (const s of filteredStudents) {
      if (!s.scheduledDueDate) continue;
      const day = Number(s.scheduledDueDate.slice(-2));
      if (!map[day]) map[day] = { due: 0, paid: 0, count: 0, paidCount: 0 };
      map[day].due += s.totalFee;
      map[day].paid += s.paidAmount;
      map[day].count += 1;
      if (s.isPaid) map[day].paidCount += 1;
    }
    return map;
  }, [filteredStudents, monthStr]);

  const selectedStudents = useMemo(() => {
    const selected = selectedDay === null ? filteredStudents
      : filteredStudents.filter(s => s.scheduledDueDate && Number(s.scheduledDueDate.slice(-2)) === selectedDay);
    return sortTuitionStudents(selected, monthStr, sortKey, sortDirection);
  }, [filteredStudents, selectedDay, monthStr, sortKey, sortDirection]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSelectedDay(null);
  };

  const changeMonth = (nextMonth: Date) => {
    setCurrentMonth(nextMonth);
    setSelectedDay(null);
  };

  // Summary stats
  const totalDue = students.reduce((s, st) => s + st.totalFee, 0);
  const totalPaid = students.reduce((s, st) => s + st.paidAmount, 0);
  const unpaidStudents = students.filter(s => !s.isPaid && s.totalFee > 0);
  const paidStudents = students.filter(s => s.isPaid);

  const handlePay = async () => {
    if (!payModalStudent) return;
    const amount = Number(payAmount);
    if (!payDate || !payBillingMonth) { toast.error('납부일과 청구월을 입력해주세요'); return; }
    if (!amount || amount <= 0) { toast.error('금액을 입력해주세요'); return; }
    setSaving(true);
    try {
      const warning = await recordManualPayment({student_id:payModalStudent.id, billing_month:payBillingMonth, amount, paid_date:payDate, payment_method:payMethod, memo:payMemo || null});
      if(warning) toast.warning(warning); else toast.success(`${payModalStudent.name} 납부 기록 완료`);
      changed();
      setPayModalStudent(null);
      setPayAmount('');
      setPayMemo('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || '수납 처리 실패');
    } finally {
      setSaving(false);
    }
  };

  const openPayModal = (student: StudentDue) => {
    setPayModalStudent(student);
    setPayAmount(String(Math.max(0, student.totalFee - student.paidAmount)));
    setPayBillingMonth(monthStr);
    setPayDate(getTodayKST());
    setPayMethod('계좌이체');
    setPayMemo('');
  };

  const firstDayOfWeek = getDay(startOfMonth(currentMonth));
  const today = getKSTDateObject();
  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : -1;

  if (loadError) return <div role="alert" className="py-8 text-destructive">{loadError}<Button variant="outline" onClick={loadData} className="ml-3">다시 불러오기</Button></div>;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wallet className="w-3.5 h-3.5" />이번 달 청구 총액
            </div>
            <p className="text-xl font-bold">{totalDue.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3.5 h-3.5" />수납 완료
            </div>
            <p className="text-xl font-bold text-success">{totalPaid.toLocaleString()}원</p>
            <p className="text-[10px] text-muted-foreground">{paidStudents.length}명 완료</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />미납 잔액
            </div>
            <p className={cn("text-xl font-bold", (totalDue - totalPaid) > 0 ? "text-destructive" : "")}>
              {students.reduce((sum, s) => sum + Math.max(0, s.totalFee - s.paidAmount), 0).toLocaleString()}원
            </p>
            <p className="text-[10px] text-muted-foreground">{unpaidStudents.length}명 미납</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="w-3.5 h-3.5" />수납률
            </div>
            <p className="text-xl font-bold">
              {totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0}%
            </p>
            <p className="text-[10px] text-muted-foreground">{paidStudents.length}/{students.length}명</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3" role="search" aria-label="납부 대상 학생 검색">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="학생 이름, 학교, 학년 검색"
              placeholder="이름 · 학교 · 학년 검색"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedDay(null); }}
              className="pl-9 pr-10"
            />
            {search && <Button variant="ghost" size="icon" aria-label="검색어 지우기" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => setSearch('')}><X className="h-4 w-4" /></Button>}
          </div>
          <ToggleGroup type="single" value={statusFilter} onValueChange={value => { if (value === 'all' || value === 'unpaid' || value === 'paid') setStatusFilter(value); }} variant="outline" size="sm" aria-label="수납 상태 필터" className="grid w-full grid-cols-3 lg:w-auto">
            <ToggleGroupItem value="all" className="gap-1 whitespace-nowrap px-1 text-xs sm:gap-1.5 sm:px-2.5 sm:text-sm data-[state=on]:bg-primary/15 data-[state=on]:text-primary">전체 <span className="text-xs tabular-nums">{students.length}</span></ToggleGroupItem>
            <ToggleGroupItem value="unpaid" className="gap-1 whitespace-nowrap px-1 text-xs sm:gap-1.5 sm:px-2.5 sm:text-sm data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive"><AlertTriangle className="hidden h-3.5 w-3.5 shrink-0 sm:inline-block" />미납·부분납 <span className="text-xs tabular-nums">{unpaidStudents.length}</span></ToggleGroupItem>
            <ToggleGroupItem value="paid" className="gap-1 whitespace-nowrap px-1 text-xs sm:gap-1.5 sm:px-2.5 sm:text-sm data-[state=on]:bg-success/15 data-[state=on]:text-success"><Check className="hidden h-3.5 w-3.5 shrink-0 sm:inline-block" />완납 <span className="text-xs tabular-nums">{paidStudents.length}</span></ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex min-h-7 flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground" role="status" aria-live="polite">조회 {selectedStudents.length}명 / 전체 {students.length}명</span>
          {selectedDay !== null && <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs" aria-label="선택 날짜 해제" onClick={() => setSelectedDay(null)}>{month}월 {selectedDay}일<X className="h-3 w-3" /></Button>}
          {(search || statusFilter !== 'all' || selectedDay !== null) && <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={resetFilters}><RotateCcw className="h-3 w-3" />초기화</Button>}
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" aria-label="이전 달" onClick={() => changeMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-lg">
              {format(currentMonth, 'yyyy년 M월', { locale: ko })}
            </CardTitle>
            <Button variant="ghost" size="icon" aria-label="다음 달" onClick={() => changeMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="py-1 font-medium">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {/* Empty cells for first week offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-background p-1 min-h-[80px]" />
            ))}
            {calendarDays.map(day => {
              const dayNum = day.getDate();
              const data = dayData[dayNum];
              const isSelected = selectedDay === dayNum;
              const isToday = dayNum === todayDay;
              const hasData = data && data.count > 0;
              const allPaid = hasData && data.paidCount === data.count;

              return (
                <Button
                  variant="ghost"
                  key={dayNum}
                  aria-label={`${month}월 ${dayNum}일 납부 대상`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDay(isSelected ? null : dayNum)}
                  className={cn(
                    "flex h-auto min-h-[80px] min-w-0 flex-col items-start justify-start rounded-none bg-background p-1.5 text-left transition-colors hover:bg-accent/50",
                    isSelected && "ring-2 ring-primary ring-inset bg-primary/5",
                    isToday && "bg-accent/30"
                  )}
                >
                  <div className={cn(
                    "text-xs font-medium mb-1",
                    isToday && "text-primary font-bold",
                    getDay(day) === 0 && "text-destructive",
                    getDay(day) === 6 && "text-info"
                  )}>
                    {dayNum}
                  </div>
                  {hasData && (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-muted-foreground">
                        {data.count}명
                      </div>
                      <div className="text-[10px] font-medium">
                        {(data.due / 10000).toFixed(0)}만
                      </div>
                      {data.paid > 0 && (
                        <div className="text-[10px] text-success font-medium">
                          ✓{(data.paid / 10000).toFixed(0)}만
                        </div>
                      )}
                      {allPaid ? (
                        <Badge variant="default" className="text-[8px] px-1 py-0 h-3.5 bg-success">완납</Badge>
                      ) : data.paidCount > 0 ? (
                        <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5">{data.paidCount}/{data.count}</Badge>
                      ) : null}
                    </div>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Students */}
      {(
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {month}월 {selectedDay === null ? '전체 납부 대상' : `${selectedDay}일 납부 대상`}
                <Badge variant="outline">{selectedStudents.length}명</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="tuition-list-sort" className="shrink-0 text-xs text-muted-foreground">정렬</Label>
                <Select value={sortKey} onValueChange={value => {
                  if (value === 'due_date' || value === 'name' || value === 'school' || value === 'fee' || value === 'unpaid_amount') setSortKey(value);
                }}>
                  <SelectTrigger id="tuition-list-sort" aria-label="납부 목록 정렬방식" className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_date">원비수납일자 순</SelectItem>
                    <SelectItem value="name">이름 순</SelectItem>
                    <SelectItem value="school">학교/학년 순</SelectItem>
                    <SelectItem value="fee">수강료 순</SelectItem>
                    <SelectItem value="unpaid_amount">미납액 순</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                  aria-label={`정렬순서: ${sortDirection === 'asc' ? '오름차순' : '내림차순'}`}
                  title={`${sortDirection === 'asc' ? '오름차순 · 내림차순으로 변경' : '내림차순 · 오름차순으로 변경'}`}
                  onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')}>
                  {sortDirection === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{search || statusFilter !== 'all' ? '조건에 맞는 학생이 없습니다' : '해당일 납부 대상 학생이 없습니다'}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1160px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>학교/학년</TableHead>
                      <TableHead className="whitespace-nowrap">원비수납일자</TableHead>
                      <TableHead className="whitespace-nowrap">실제 납부일 / 차이</TableHead>
                      <TableHead className="text-right">수강료</TableHead>
                      <TableHead className="text-right">납부액</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>출처</TableHead><TableHead>메모</TableHead>
                      <TableHead className="text-center">수납</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStudents.map(s => (
                      <TableRow key={s.id} className={cn(s.isPaid && "opacity-60")}>
                        <TableCell className="font-medium"><StudentPaymentLink id={s.id} name={s.name} /></TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {s.school || '-'} {s.grade || ''}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          <div>{s.scheduledDueDate || '확인 필요'}</div>
                          <div className="text-[10px] text-muted-foreground">{s.dueDateBasis === 'billing' ? '청구된 납부 예정일' : s.dueDateBasis === 'current' ? '현재 납입일 설정 기준' : '예정일 확인 필요'}</div>
                        </TableCell>
                        <TableCell className="min-w-52">
                          {studentMonthPaymentDates(payments, s.id, monthStr).length ? <div className="space-y-2">
                            {studentMonthPaymentDates(payments, s.id, monthStr).map(payment => <PaymentTiming key={payment.id} payment={payment} schedules={schedules} dueDay={s.payment_due_day} showDue={false} showAmount />)}
                          </div> : <span className="text-xs text-muted-foreground">납부 기록 없음</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {s.totalFee.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right">
                          {s.paidAmount > 0 ? (
                            <span className="text-success font-medium">{s.paidAmount.toLocaleString()}원</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.isPaid ? (
                            <Badge className="bg-success text-[10px]">완납</Badge>
                          ) : s.paidAmount > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">부분납</Badge>
                          ) : s.totalFee > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">미납</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">과정없음</Badge>
                          )}
                        </TableCell>
                        <TableCell><div className="flex gap-1 flex-wrap">{[...new Set(payments.filter(p=>p.student_id===s.id).map(p=>p.source))].map(source=><SourceBadge key={source} source={source}/>)}</div></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                          {s.tuition_memo || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {!s.isPaid && s.totalFee > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => openPayModal(s)}
                            >
                              <Check className="w-3 h-3" />수납
                            </Button>
                          ) : s.isPaid ? (
                            <Check className="w-4 h-4 text-success mx-auto" />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Day summary */}
                <div className="flex flex-wrap justify-end gap-4 mt-3 text-sm border-t pt-3">
                  <span className="text-muted-foreground">
                    청구: <span className="font-medium text-foreground">{selectedStudents.reduce((s, st) => s + st.totalFee, 0).toLocaleString()}원</span>
                  </span>
                  <span className="text-muted-foreground">
                    수납: <span className="font-medium text-success">{selectedStudents.reduce((s, st) => s + st.paidAmount, 0).toLocaleString()}원</span>
                  </span>
                  <span className="text-muted-foreground">
                    잔액: <span className="font-medium text-destructive">
                      {selectedStudents.reduce((s, st) => s + Math.max(0,st.totalFee - st.paidAmount), 0).toLocaleString()}원
                    </span>
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Modal */}
      <Dialog open={!!payModalStudent} onOpenChange={(open) => !open && setPayModalStudent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>수납 처리 - {payModalStudent?.name}</DialogTitle>
          </DialogHeader>
          {payModalStudent && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">청구금액</span>
                  <span className="font-medium">{payModalStudent.totalFee.toLocaleString()}원</span>
                </div>
                {payModalStudent.paidAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">기납부액</span>
                    <span className="text-success">{payModalStudent.paidAmount.toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">잔액</span>
                  <span className="font-bold text-destructive">
                    {Math.max(0, payModalStudent.totalFee - payModalStudent.paidAmount).toLocaleString()}원
                  </span>
                </div>
              </div>

              <div><Label>청구월</Label><MonthInput value={payBillingMonth} onChange={setPayBillingMonth}/></div>
              <div><Label htmlFor="calendar-paid-date">실제 납부일</Label><Input id="calendar-paid-date" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></div>
              <div>
                <Label className="text-sm">납부 금액 *</Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-sm">납부 방법</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="계좌이체">계좌이체</SelectItem>
                    <SelectItem value="카드">카드</SelectItem>
                    <SelectItem value="현금">현금</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">메모</Label>
                <Textarea value={payMemo} onChange={e => setPayMemo(e.target.value)} rows={2} className="text-sm" />
              </div>
              <Button onClick={handlePay} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                수납 처리
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
