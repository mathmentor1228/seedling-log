import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { recordManualPayment } from '@/lib/tuitionLedgerApi';
import { keepOpenOnToast } from '@/lib/confirmAtTop';
import { getTodayKST } from '@/lib/utils';
import { confirmOverpayment } from './overpaymentConfirm';

export interface OverduePayTarget { studentId: string; name: string; month: string; required: number; paid: number }

// Same manual-payment path as the calendar: overpayment check at the top first, then record and reconcile.
export function OverduePayDialog({ target, onClose, onSaved }: { target: OverduePayTarget | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(getTodayKST());
  const [method, setMethod] = useState('계좌이체');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!target) return;
    setAmount(String(Math.max(0, target.required - target.paid)));
    setPaidDate(getTodayKST()); setMethod('계좌이체'); setMemo('');
  }, [target]);
  async function save() {
    if (!target || saving) return;
    const value = Number(amount);
    if (!value || value <= 0) { toast.error('금액을 입력해주세요'); return; }
    if (!paidDate) { toast.error('납부일을 입력해주세요'); return; }
    setSaving(true);
    try {
      const overNote = await confirmOverpayment({ studentName: target.name, studentId: target.studentId, month: target.month, amount: value });
      if (overNote === null) { toast.info('반영하지 않았어요. 금액과 청구월을 다시 확인해 주세요', { position: 'top-center' }); return; }
      const warning = await recordManualPayment({ student_id: target.studentId, billing_month: target.month, amount: value, paid_date: paidDate, payment_method: method, memo: [memo.trim(), overNote].filter(Boolean).join(' ') || null });
      if (warning) toast.warning(warning); else toast.success(`${target.name} ${target.month} 납부 기록 완료`);
      onSaved(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : '수납 처리 실패'); }
    finally { setSaving(false); }
  }
  return <Dialog open={!!target} onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-sm" onInteractOutside={keepOpenOnToast}>
      <DialogHeader><DialogTitle>수납 처리 - {target?.name}</DialogTitle><DialogDescription>{target?.month} 청구 · 잔액 {target ? Math.max(0, target.required - target.paid).toLocaleString() : 0}원</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div><Label htmlFor="overdue-paid-date">실제 납부일</Label><Input id="overdue-paid-date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} /></div>
        <div><Label htmlFor="overdue-amount">납부 금액</Label><Input id="overdue-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div><Label>납부 방법</Label><Select value={method} onValueChange={setMethod}><SelectTrigger aria-label="납부 방법"><SelectValue /></SelectTrigger><SelectContent>{['계좌이체', '카드', '현금', '기타'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="overdue-memo">메모</Label><Textarea id="overdue-memo" rows={2} value={memo} onChange={e => setMemo(e.target.value)} /></div>
        <Button className="w-full" disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}수납 처리</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
