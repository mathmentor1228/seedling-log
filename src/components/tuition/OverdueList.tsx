import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw } from 'lucide-react';
import { loadPaymentsByPaidRange, loadUnpaidByDueRange } from '@/lib/tuitionLedgerApi';
import { paymentMonth } from '@/lib/tuitionLedger';
import { cn, formatStudentGrade, getTodayKST } from '@/lib/utils';
import { SourceBadge } from './LedgerControls';
import { StudentPaymentLink, useTuitionLedger } from './TuitionLedgerContext';
import { OverduePayDialog, type OverduePayTarget } from './OverduePayDialog';
import { BillNoteCell } from './BillNoteCell';
import { WithdrawalCancelButton } from './WithdrawalCancelButton';
import { OVERDUE_PRESETS, OVERDUE_RANGE_KEY, buildDueRangeRows, overdueRange, rangeSummary, useShowUpcomingUnpaid, type OverdueRangePreset, type RangeUnpaidRow } from './unpaidDue';

interface SavedRange { preset: OverdueRangePreset; from?: string; to?: string }
function readSavedRange(): SavedRange {
  try { const v = JSON.parse(localStorage.getItem(OVERDUE_RANGE_KEY) || 'null'); if (v && OVERDUE_PRESETS.some(p => p.key === v.preset)) return v; } catch { /* ignore */ }
  return { preset: 'today' };
}
const won = (n: number) => `${n.toLocaleString()}원`;

function StatusBadge({ s }: { s: RangeUnpaidRow['student'] }) {
  if (s.enrollment_status !== '퇴원' && s.enrollment_status !== '휴학') return null;
  return <Badge variant="outline" className="ml-1.5 border-warning/60 text-warning text-[10px]">{s.enrollment_status}</Badge>;
}

export function OverdueList() {
  const { revision, changed } = useTuitionLedger();
  const today = getTodayKST();
  const [saved, setSaved] = useState<SavedRange>(readSavedRange);
  const range = useMemo(() => overdueRange(saved.preset, today, saved.from && saved.to ? { from: saved.from, to: saved.to } : undefined), [saved, today]);
  const [data, setData] = useState<{ bills: any[]; payments: any[]; paidRows: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpcoming, setShowUpcoming] = useShowUpcomingUnpaid();
  const [payTarget, setPayTarget] = useState<OverduePayTarget | null>(null);
  const [reload, setReload] = useState(0);

  function choose(next: SavedRange) {
    setSaved(next);
    try { localStorage.setItem(OVERDUE_RANGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }
  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    Promise.all([loadUnpaidByDueRange(range.from, range.to), loadPaymentsByPaidRange(range.from, range.to)])
      .then(([unpaid, paidRows]) => { if (alive) setData({ ...unpaid, paidRows }); })
      .catch(() => { if (alive) setError('미납·결제내역을 불러오지 못했습니다'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to, revision, reload]);

  const { due, upcoming } = useMemo(() => data ? buildDueRangeRows(data.bills, data.payments, range.from, range.to) : { due: [], upcoming: [] }, [data, range]);
  const shown = showUpcoming ? [...due, ...upcoming] : due;
  const upcomingKeys = new Set(upcoming.map(r => r.key));
  const summary = rangeSummary(shown); const upcomingSummary = rangeSummary(upcoming);
  const paidRows = data?.paidRows || [];
  const paidTotal = paidRows.filter(p => !p.canceled_at).reduce((s, p) => s + Number(p.amount), 0);

  return <div className="space-y-6 mt-4">
    <section aria-label="기간 선택" className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {OVERDUE_PRESETS.map(p => <Button key={p.key} size="sm" variant={saved.preset === p.key ? 'default' : 'outline'}
          onClick={() => choose(p.key === 'custom' ? { preset: 'custom', from: range.from, to: range.to } : { preset: p.key })}>{p.label}</Button>)}
        <Button variant="outline" size="icon" aria-label="미납 새로고침" onClick={() => setReload(v => v + 1)}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor="overdue-from">시작일</Label><Input id="overdue-from" type="date" className="w-40" value={range.from} disabled={saved.preset !== 'custom'} onChange={e => e.target.value && choose({ preset: 'custom', from: e.target.value, to: range.to })} /></div>
        <div className="space-y-1"><Label htmlFor="overdue-to">종료일</Label><Input id="overdue-to" type="date" className="w-40" value={range.to} disabled={saved.preset !== 'custom'} onChange={e => e.target.value && choose({ preset: 'custom', from: range.from, to: e.target.value })} /></div>
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><Switch id="overdue-show-upcoming" checked={showUpcoming} onCheckedChange={setShowUpcoming} /><Label htmlFor="overdue-show-upcoming" className="text-sm cursor-pointer">기한 전 학생도 보기</Label></div>
      </div>
    </section>

    {loading ? <Loader2 className="animate-spin mx-auto" /> : error ? <div role="alert" className="text-destructive">{error} <Button variant="outline" size="sm" onClick={() => setReload(v => v + 1)}>다시 불러오기</Button></div> : <>
      <section aria-label="기간 미납" className="space-y-2">
        <h3 className="font-semibold">미납 (기한 {range.from} ~ {range.to})</h3>
        <p className="text-sm">미납 {summary.unpaid}명 · 부분납 {summary.partial}명 · 잔액 <span className="font-bold text-destructive">{won(summary.balance)}</span></p>
        <p className="text-xs text-muted-foreground">{showUpcoming ? (upcoming.length ? `그중 기한 전 ${upcomingSummary.count}명 · ${won(upcomingSummary.balance)}` : '기한 전 미납자 없음') : `납부기한이 이 기간에 든 청구만 · 기한 전 ${upcomingSummary.count}명 제외`}</p>
        <div className="overflow-x-auto border rounded-lg"><Table>
          <TableHeader><TableRow>{['기한', '학생', '학교/학년', '청구월', '청구액', '납부액', '잔액', '상태', '비고', '수납'].map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{shown.map(r => { const isUp = upcomingKeys.has(r.key); return <TableRow key={r.key} className={cn(isUp && 'text-muted-foreground bg-muted/30')}>
            <TableCell className="whitespace-nowrap tabular-nums">{r.due}</TableCell>
            <TableCell className="whitespace-nowrap"><StudentPaymentLink id={r.student.id} name={r.student.name} /><StatusBadge s={r.student} /></TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.student.school || '-'} {formatStudentGrade(r.student as any)}</TableCell>
            <TableCell className="whitespace-nowrap">{r.billing_month}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{won(r.required)}{r.withdrawalCheck && <WithdrawalCancelButton name={r.student.name} month={r.billing_month} amount={r.required} billIds={r.billIds} status={r.billStatus} paid={r.paid} onCancelled={() => { setData(d => d && { ...d, bills: d.bills.filter(b => !r.billIds.includes(b.id)) }); changed(); }} />}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{won(r.paid)}</TableCell>
            <TableCell className={cn('whitespace-nowrap text-right font-semibold tabular-nums', isUp ? 'text-muted-foreground' : 'text-destructive')}>{won(r.balance)}</TableCell>
            <TableCell className="whitespace-nowrap"><Badge variant={isUp ? 'outline' : r.state === '부분납' ? 'secondary' : 'destructive'}>{r.state}</Badge>{isUp && <span className="block text-xs text-muted-foreground">기한 전</span>}</TableCell>
            <TableCell><BillNoteCell billId={r.billId} value={r.note} label={`${r.student.name} ${r.billing_month}`} studentMemo={r.student.tuition_memo}
              onSaved={next => setData(d => d && { ...d, bills: d.bills.map(b => b.id === r.billId ? { ...b, note: next } : b) })} /></TableCell>
            <TableCell><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayTarget({ studentId: r.student.id, name: r.student.name, month: r.billing_month, required: r.required, paid: r.paid })}>수납</Button></TableCell>
          </TableRow>; })}</TableBody>
        </Table>{!shown.length && <p className="p-8 text-center text-muted-foreground">이 기간에 기한이 온 미납이 없습니다{upcoming.length ? ` (기한 전 ${upcoming.length}명)` : ''}</p>}</div>
      </section>

      <section aria-label="기간 결제내역" className="space-y-2">
        <h3 className="font-semibold">이 기간 결제내역 ({range.from} ~ {range.to})</h3>
        <p className="text-xs text-muted-foreground">실제 결제일 기준 · 청구월과 상관없이 모두 표시</p>
        <div className="overflow-x-auto border rounded-lg"><Table>
          <TableHeader><TableRow>{['결제일', '학생', '금액', '청구월', '출처', '확인 필요'].map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{paidRows.map(p => <TableRow key={p.id} className={cn(p.canceled_at && 'opacity-50')}>
            <TableCell className="whitespace-nowrap tabular-nums">{p.paid_date}</TableCell>
            <TableCell className="whitespace-nowrap">{p.student_id ? <StudentPaymentLink id={p.student_id} name={p.students?.name || '학생'} /> : <span className="text-muted-foreground">학생 미지정</span>}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{won(Number(p.amount))}{p.canceled_at && <span className="block text-xs text-destructive">취소</span>}</TableCell>
            <TableCell className="whitespace-nowrap">{paymentMonth(p) || '확인 필요'}</TableCell>
            <TableCell><SourceBadge source={p.source} /></TableCell>
            <TableCell>{p.needs_review ? <Badge variant="destructive" className="text-[10px]">확인 필요</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
          </TableRow>)}</TableBody>
        </Table>{!paidRows.length && <p className="p-8 text-center text-muted-foreground">이 기간 결제내역이 없습니다</p>}</div>
        {paidRows.length > 0 && <p className="text-sm text-right">합계 (취소 제외) <span className="font-semibold">{won(paidTotal)}</span> · {paidRows.filter(p => !p.canceled_at).length}건</p>}
      </section>
    </>}
    <OverduePayDialog target={payTarget} onClose={() => setPayTarget(null)} onSaved={changed} />
  </div>;
}
