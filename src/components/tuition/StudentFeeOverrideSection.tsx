import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { nextTuitionMonth, validOverrideInput, type FeeOverride } from '@/lib/tuitionFeeOverrides';
import { LEDGER_START } from '@/lib/tuitionLedger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MonthInput, currentTuitionMonth } from './LedgerControls';

export function StudentFeeOverrideSection({ studentId, rows, error, onChanged }: { studentId: string; rows: FeeOverride[]; error: string; onChanged: () => Promise<void> }) {
  const { role, user } = useAuth();
  const [month, setMonth] = useState(() => nextTuitionMonth(currentTuitionMonth()));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (role !== 'admin' || !user || busy) return;
    if (!validOverrideInput(month, amount)) { toast.error('2026년 10월 이후의 시작월과 0원 이상의 정수 금액을 입력해주세요'); return; }
    setBusy(true);
    try {
      const { data, error: saveError } = await supabase.from('student_fee_overrides').upsert({ student_id: studentId, from_month: month, amount: Number(amount), note: note.trim() || null, created_by: user.id }, { onConflict: 'student_id,from_month' }).select('id').single();
      if (saveError || !data) throw new Error('월 원비 고정을 저장하지 못했습니다');
      toast.success('월 원비 고정 저장 완료'); setAmount(''); setNote(''); await onChanged();
    } catch (err) { toast.error(err instanceof Error ? err.message : '저장 실패'); }
    finally { setBusy(false); }
  }
  async function remove(row: FeeOverride) {
    if (role !== 'admin' || busy || !window.confirm(`${row.from_month}부터 ${row.amount.toLocaleString()}원 고정을 삭제할까요?`)) return;
    setBusy(true);
    try {
      const { data, error: deleteError } = await supabase.from('student_fee_overrides').delete().eq('id', row.id).eq('student_id', studentId).select('id').single();
      if (deleteError || !data) throw new Error('월 원비 고정을 삭제하지 못했습니다');
      toast.success('월 원비 고정 삭제 완료'); await onChanged();
    } catch (err) { toast.error(err instanceof Error ? err.message : '삭제 실패'); }
    finally { setBusy(false); }
  }
  return <section aria-label="월 원비 고정" className="space-y-3 border-y py-4">
    <h3 className="text-sm font-semibold">월 원비 고정</h3>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : rows.length ? <div className="overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>적용 시작월</TableHead><TableHead className="text-right">금액</TableHead><TableHead>메모</TableHead>{role === 'admin' && <TableHead className="w-12" />}</TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{row.from_month}</TableCell><TableCell className="whitespace-nowrap text-right">{row.amount.toLocaleString()}원</TableCell><TableCell className="min-w-32 whitespace-pre-wrap break-words">{row.note || '—'}</TableCell>{role === 'admin' && <TableCell><Button type="button" variant="ghost" size="icon" title="월 원비 고정 삭제" aria-label={`${row.from_month} 월 원비 고정 삭제`} disabled={busy} onClick={() => remove(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>}</TableRow>)}</TableBody>
    </Table></div> : <p className="text-sm text-muted-foreground">고정 내역이 없습니다</p>}
    {role === 'admin' && <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label htmlFor={`override-month-${studentId}`}>적용 시작월</Label><MonthInput id={`override-month-${studentId}`} value={month} onChange={setMonth} min={LEDGER_START} label="고정 적용 시작월" /></div>
      <div className="space-y-1"><Label htmlFor={`override-amount-${studentId}`}>금액 (원)</Label><Input id={`override-amount-${studentId}`} type="number" min={0} max={2147483647} step={1} required className="w-40" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="min-w-40 flex-1 space-y-1"><Label htmlFor={`override-note-${studentId}`}>메모</Label><Input id={`override-note-${studentId}`} value={note} onChange={e => setNote(e.target.value)} /></div>
      <Button type="submit" disabled={busy || !!error}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}저장</Button>
    </form>}
  </section>;
}