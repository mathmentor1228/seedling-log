import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cancelWithdrawalMonthBill } from '@/lib/tuitionLedgerApi';
import { canCancelWithdrawalMonth } from './unpaidDue';

// #35: the withdrawal-month badge becomes a cancel button while the bill is untouched.
export function WithdrawalCancelButton({ name, month, amount, billIds, status, paid, onCancelled }: { name: string; month: string; amount: number; billIds: string[]; status: string; paid: number; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!billIds.length || !canCancelWithdrawalMonth({ status }, paid)) {
    return <Badge variant="outline" className="ml-1.5 border-warning/60 text-warning text-[10px]" title={paid > 0 || status !== 'pending' ? '결제 기록이 있어 취소할 수 없습니다' : '퇴원(휴학) 당월 청구입니다. 받을지 확인해 주세요'}>퇴원 당월 · 확인</Badge>;
  }
  async function confirm() {
    setBusy(true);
    try { await cancelWithdrawalMonthBill(billIds); toast.success('청구를 취소했습니다'); setOpen(false); onCancelled(); }
    catch (e) { toast.error(e instanceof Error ? e.message : '청구를 취소하지 못했습니다'); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="outline" className="ml-1.5 h-5 border-warning/60 px-1.5 text-[10px] text-warning hover:bg-warning/10 hover:text-warning" onClick={() => setOpen(true)}>퇴원 당월 · 청구 취소</Button>
    <AlertDialog open={open} onOpenChange={v => !busy && setOpen(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>퇴원 당월 청구 취소</AlertDialogTitle>
          <AlertDialogDescription>{name} {month} 청구 {amount.toLocaleString()}원을 취소합니다. 퇴원 당월이라 받지 않는 것으로 처리됩니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>돌아가기</AlertDialogCancel>
          <AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={e => { e.preventDefault(); confirm(); }}>{busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}취소 처리</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
