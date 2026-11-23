import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { acceptPaymentAmount, loadAmountMismatchReviews } from '@/lib/tuitionLedgerApi';
import { pendingBillAmount, type MismatchBill } from '@/lib/tuitionLedger';
import { SourceBadge } from './LedgerControls';
import { StudentPaymentLink, useTuitionLedger } from './TuitionLedgerContext';
import { StudentCoursesTuitionTab } from './StudentCoursesTuitionTab';

const won = (n: number) => `${n.toLocaleString()}원`;

// #36: review payments the collector could not attach to a bill because the amounts differ.
export function AmountMismatchBanner() {
  const { revision, changed } = useTuitionLedger();
  const [rows, setRows] = useState<any[]>([]);
  const [bills, setBills] = useState<MismatchBill[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [feeFor, setFeeFor] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAmountMismatchReviews()
      .then(d => { if (alive) { setRows(d.payments); setBills(d.bills as MismatchBill[]); setError(''); } })
      .catch(() => { if (alive) setError('확인 필요 건을 불러오지 못했습니다'); });
    return () => { alive = false; };
  }, [revision]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!rows.length) return null;

  const billOf = (p: any) => pendingBillAmount(bills, p.student_id, p.billing_month);
  async function accept() {
    if (!confirm) return;
    setSaving(true);
    try {
      await acceptPaymentAmount(confirm.id);
      toast.success(`${confirm.students?.name || '학생'} ${confirm.billing_month} 청구를 납부액으로 바꾸고 완납 처리했어요`);
      setConfirm(null);
      changed();
    } catch (e) { toast.error(e instanceof Error ? e.message : '청구 수정 실패'); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-warning/50 bg-warning/10">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-warning" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">확인 필요 {rows.length}건: 청구 금액과 납부 금액이 다릅니다</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-warning/30 px-2 pb-3 pt-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{['학생', '결제일', '납부액', '그 달 청구액', '출처', '메모', ''].map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rows.map(p => {
                  const bill = billOf(p);
                  const ready = !!p.student_id && !!p.billing_month;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{p.student_id ? <StudentPaymentLink id={p.student_id} name={p.students?.name || '학생'} /> : '미지정'}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.paid_date}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{won(Number(p.amount))}</TableCell>
                      <TableCell className="whitespace-nowrap">{bill == null ? <span className="text-muted-foreground">청구 없음</span> : <>{won(bill)} <span className="text-xs text-muted-foreground">({p.billing_month})</span></>}</TableCell>
                      <TableCell><SourceBadge source={p.source} /></TableCell>
                      <TableCell className="min-w-32 max-w-64 whitespace-pre-wrap break-all text-xs">{p.memo || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 whitespace-nowrap px-2 text-xs" disabled={!ready} onClick={() => setFeeFor(feeFor?.id === p.id ? null : p)}>원비 변경 반영</Button>
                          <Button size="sm" variant="outline" className="h-7 whitespace-nowrap px-2 text-xs" disabled={!ready || bill == null} onClick={() => setConfirm(p)}>이 금액으로 청구 수정</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {feeFor && (
            <div className="rounded-md border bg-background p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{feeFor.students?.name} 원비 변경 · {feeFor.billing_month}부터</p>
                  <p className="text-xs text-muted-foreground">과목의 연필 버튼으로 원비를 바꾸면 미리보기 후 미납 청구에 반영돼요. 이미 돈이 들어온 달 청구는 바뀌지 않으니, 그 달은 "이 금액으로 청구 수정"으로 정리하세요.</p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="원비 변경 닫기" onClick={() => setFeeFor(null)}><X className="h-4 w-4" /></Button>
              </div>
              <StudentCoursesTuitionTab key={feeFor.id} studentId={feeFor.student_id} studentName={feeFor.students?.name || ''} initialSyncMonth={feeFor.billing_month} />
            </div>
          )}
        </div>
      )}
      <AlertDialog open={!!confirm} onOpenChange={o => { if (!o && !saving) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>청구 금액 수정</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && `${confirm.students?.name || '학생'} ${confirm.billing_month} 청구 ${(billOf(confirm) ?? 0).toLocaleString()}원을 납부액 ${Number(confirm.amount).toLocaleString()}원으로 바꾸고 납부 완료로 처리합니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={e => { e.preventDefault(); accept(); }}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}수정하고 완납 처리</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
