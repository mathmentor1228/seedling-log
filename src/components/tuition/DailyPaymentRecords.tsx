import {useEffect, useMemo, useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {allRows} from '@/lib/tuitionLedgerApi';
import {getTodayKST} from '@/lib/utils';
import {paymentMonth, paymentReference} from '@/lib/tuitionLedger';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {AlertTriangle, CalendarDays, Loader2, Receipt, RefreshCw} from 'lucide-react';
import {SourceBadge, currentTuitionMonth} from './LedgerControls';
import {StudentPaymentLink, useTuitionLedger} from './TuitionLedgerContext';
import {filterDailyPayments, groupDailyPayments, IMPORTED_PAYMENT_SOURCES, paymentRecordDate, paymentRecordState, summarizeDailyPayments, type DailyPayment, type DailyPaymentFilters} from './dailyPaymentSummary';

const money = (value: number) => `${value.toLocaleString()}원`;
const stateLabels = {recorded: '수납 기록', review: '확인 필요', canceled: '취소 / 제외'} as const;
const matchLabels: Record<string, string> = {name: '이름 매칭', alias: '입금자 별칭', manual: '직접 확인'};

export function DailyPaymentRecords({onReview}: {onReview: () => void}) {
  const {revision, openReceipt} = useTuitionLedger();
  const [payments, setPayments] = useState<DailyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState<DailyPaymentFilters>({from: `${currentTuitionMonth()}-01`, to: getTodayKST(), source: 'imported', state: 'all', basis: 'paid', search: ''});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    allRows(() => supabase.from('payment_records').select('*,students(name,school,grade),billing_schedules(billing_month)').order('paid_date', {ascending: false}).order('id'))
      .then(rows => {if (alive) setPayments(rows);})
      .catch(() => {if (alive) setError('날짜별 수납 내역을 불러오지 못했습니다');})
      .finally(() => {if (alive) setLoading(false);});
    return () => {alive = false;};
  }, [revision, reload]);

  const invalidRange = !!filters.from && !!filters.to && filters.from > filters.to;
  const visible = useMemo(() => filterDailyPayments(payments, filters), [payments, filters]);
  const groups = useMemo(() => groupDailyPayments(visible, filters.basis), [visible, filters.basis]);
  const totals = useMemo(() => summarizeDailyPayments(visible), [visible]);

  function update<K extends keyof DailyPaymentFilters>(key: K, value: DailyPaymentFilters[K]) {
    setFilters(previous => ({...previous, [key]: value}));
  }

  return <div className="mt-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="h-5 w-5 text-primary"/>날짜별 수납</h2>
      <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)} disabled={loading}>
        <RefreshCw className="mr-1.5 h-4 w-4"/>새로고침
      </Button>
    </div>
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5"><Label htmlFor="daily-payment-basis">날짜 기준</Label><Select value={filters.basis} onValueChange={value => update('basis', value as DailyPaymentFilters['basis'])}><SelectTrigger id="daily-payment-basis"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="paid">실제 결제일</SelectItem><SelectItem value="registered">장부 등록일</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="daily-payment-from">시작일</Label><Input id="daily-payment-from" type="date" value={filters.from} onChange={event => update('from', event.target.value)}/></div>
      <div className="space-y-1.5"><Label htmlFor="daily-payment-to">종료일</Label><Input id="daily-payment-to" type="date" value={filters.to} onChange={event => update('to', event.target.value)}/></div>
      <div className="space-y-1.5"><Label htmlFor="daily-payment-source">수납 출처</Label><Select value={filters.source} onValueChange={value => update('source', value)}><SelectTrigger id="daily-payment-source"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="imported">외부 결제내역</SelectItem><SelectItem value="all">전체 (수기 포함)</SelectItem>{IMPORTED_PAYMENT_SOURCES.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}<SelectItem value="수기">수기</SelectItem></SelectContent></Select></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-full sm:max-w-xs" aria-label="날짜별 수납 검색" placeholder="학생 / 학교 / 귀속월 / 입금자 검색" value={filters.search} onChange={event => update('search', event.target.value)}/>
      <Select value={filters.state} onValueChange={value => update('state', value as DailyPaymentFilters['state'])}><SelectTrigger className="w-40" aria-label="수납 기록 상태"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="recorded">수납 기록</SelectItem><SelectItem value="review">확인 필요</SelectItem><SelectItem value="canceled">취소 / 제외</SelectItem></SelectContent></Select>
      <Button variant="ghost" size="sm" onClick={() => setFilters({from: `${currentTuitionMonth()}-01`, to: getTodayKST(), source: 'imported', state: 'all', basis: 'paid', search: ''})}>초기화</Button>
    </div>
    {invalidRange ? <p role="alert" className="text-sm text-destructive">시작일은 종료일보다 늦을 수 없습니다</p> : loading ? <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin"/>수납 내역 불러오는 중</div> : error ? <div role="alert" className="space-y-2"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>다시 불러오기</Button></div> : <>
      <dl className="grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">수납 기록 · {totals.recorded}건</dt><dd className="text-xl font-semibold text-success">{money(totals.recordedAmount)}</dd></div>
        <div><dt><Button variant="link" className="h-auto p-0 text-warning" onClick={onReview}><AlertTriangle className="mr-1 h-4 w-4"/>확인 필요 · {totals.review}건</Button></dt><dd className="text-xl font-semibold">{money(totals.reviewAmount)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">취소 / 제외 · {totals.canceled}건</dt><dd className="text-xl font-semibold text-muted-foreground">{money(totals.canceledAmount)}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">{groups.length}일 · {visible.length}건</p>
      {!groups.length ? <p className="py-12 text-center text-muted-foreground">조건에 맞는 결제내역이 없습니다</p> : groups.map((group, index) => <details key={`${filters.basis}-${group.date}`} open={index < 3} className="border-b border-border pb-3">
        <summary className="cursor-pointer py-3 marker:text-muted-foreground">
          <span className="ml-1 font-semibold">{group.date}</span>
          <span className="ml-3 text-sm text-muted-foreground">{group.payments.length}건</span>
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-5 text-sm">
            <span className="text-success">수납 기록 {group.recorded}건 · {money(group.recordedAmount)}</span>
            {group.review > 0 && <span className="text-warning">확인 필요 {group.review}건 · {money(group.reviewAmount)}</span>}
            {group.canceled > 0 && <span className="text-muted-foreground">취소 / 제외 {group.canceled}건 · {money(group.canceledAmount)}</span>}
          </span>
        </summary>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow>{['학생', '금액', '귀속월', '결제일', '장부 등록일', '출처', '처리 확인', '상세 / 메모', '영수증'].map(heading => <TableHead key={heading} className="whitespace-nowrap">{heading}</TableHead>)}</TableRow></TableHeader><TableBody>
          {group.payments.map(payment => {
            const state = paymentRecordState(payment);
            return <TableRow key={payment.id} className={state === 'canceled' ? 'opacity-60' : ''}>
              <TableCell className="whitespace-nowrap">{payment.student_id ? <StudentPaymentLink id={payment.student_id} name={payment.students?.name || '미지정'}/> : '미지정'}<div className="text-xs text-muted-foreground">{payment.students?.school} {payment.students?.grade}</div></TableCell>
              <TableCell className="whitespace-nowrap font-semibold">{money(Number(payment.amount))}</TableCell>
              <TableCell className="whitespace-nowrap">{paymentMonth(payment) || '확인 필요'}</TableCell>
              <TableCell className="whitespace-nowrap">{payment.paid_date}</TableCell>
              <TableCell className="whitespace-nowrap">{paymentRecordDate(payment, 'registered') || '—'}</TableCell>
              <TableCell><SourceBadge source={payment.source}/></TableCell>
              <TableCell className="whitespace-nowrap"><Badge variant={state === 'review' ? 'warning' : state === 'canceled' ? 'muted' : 'success'}>{stateLabels[state]}</Badge><div className="mt-1 text-xs text-muted-foreground">{payment.matched_by ? matchLabels[payment.matched_by] || payment.matched_by : '—'}</div></TableCell>
              <TableCell className="min-w-48 max-w-72 text-xs"><p>{paymentReference(payment) || payment.payment_method || '—'}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{payment.memo}</p>{payment.review_note && <p className={state === 'review' ? 'text-warning' : 'text-muted-foreground'}>{payment.review_note}</p>}{payment.raw_text && <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">수집 원문</summary><p className="whitespace-pre-wrap break-all">{payment.raw_text}</p></details>}</TableCell>
              <TableCell><Button variant="ghost" size="icon" aria-label={`${payment.students?.name || '미지정'} ${payment.paid_date} 영수증`} title="영수증" onClick={() => openReceipt([payment])}><Receipt className="h-4 w-4"/></Button></TableCell>
            </TableRow>;
          })}
        </TableBody></Table></div>
      </details>)}
    </>}
  </div>;
}