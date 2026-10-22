import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn, getTodayKST, getKSTDateObject } from '@/lib/utils';
import { loadMonthLedger, recordManualPayment } from '@/lib/tuitionLedgerApi';
import { dueDate } from '@/lib/tuitionLedger';
import { MonthInput } from './LedgerControls';
import { StudentPaymentLink, useTuitionLedger } from './TuitionLedgerContext';
import { SourceBadge } from './LedgerControls';
import {
  ChevronLeft, ChevronRight, Loader2, Check, Wallet, Users,
  CalendarDays, TrendingUp, AlertTriangle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';

interface StudentDue {
  id: string;
  name: string;
  payment_due_day: number;
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
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
      const ledger = await loadMonthLedger(monthStr);
      setStudents(ledger.students);
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

  const dayData = useMemo(() => {
    const map: Record<number, { due: number; paid: number; count: number; paidCount: number }> = {};
    for (const s of students) {
      const day = Number(dueDate(monthStr,s.payment_due_day).slice(-2));
      if (!map[day]) map[day] = { due: 0, paid: 0, count: 0, paidCount: 0 };
      map[day].due += s.totalFee;
      map[day].paid += s.paidAmount;
      map[day].count += 1;
      if (s.isPaid) map[day].paidCount += 1;
    }
    return map;
  }, [students, monthStr]);

  const selectedStudents = useMemo(() => {
    if (selectedDay === null) return students;
    return students.filter(s => Number(dueDate(monthStr,s.payment_due_day).slice(-2)) === selectedDay);
  }, [students, selectedDay, monthStr]);

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

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" aria-label="이전 달" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-lg">
              {format(currentMonth, 'yyyy년 M월', { locale: ko })}
            </CardTitle>
            <Button variant="ghost" size="icon" aria-label="다음 달" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
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
                <div
                  key={dayNum}
                  onClick={() => setSelectedDay(isSelected ? null : dayNum)}
                  className={cn(
                    "bg-background p-1.5 min-h-[80px] cursor-pointer transition-colors hover:bg-accent/50",
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
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Students */}
      {(
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              {month}월 {selectedDay === null ? '전체 납부 대상' : `${selectedDay}일 납부 대상`}
              <Badge variant="outline" className="ml-auto">
                {selectedStudents.length}명
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">해당일 납부 대상 학생이 없습니다</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>학교/학년</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">
                          {s.school || '-'} {s.grade || ''}
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
                <div className="flex justify-end gap-4 mt-3 text-sm border-t pt-3">
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
