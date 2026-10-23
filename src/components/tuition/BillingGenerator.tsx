import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, Zap, Pencil, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { allRows, monthlyFees, recalculatePendingBillings } from '@/lib/tuitionLedgerApi';
import { useAuth } from '@/lib/auth';
import { buildStudentBillings, billingDisplayStatus, LEDGER_START } from '@/lib/tuitionLedger';
import { currentTuitionMonth, MonthInput } from './LedgerControls';
import { StudentPaymentLink, useTuitionLedger } from './TuitionLedgerContext';

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '대기', variant: 'secondary' },
  paid: { label: '납부완료', variant: 'default' },
  overdue: { label: '미납', variant: 'destructive' },
  cancelled: { label: '취소', variant: 'outline' },
};

export function BillingGenerator() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentTuitionMonth());
  const { revision, changed } = useTuitionLedger();
  const { role } = useAuth();
  const [loadError, setLoadError] = useState('');
  const [billings, setBillings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculationResult, setRecalculationResult] = useState('');
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editDiscount, setEditDiscount] = useState('0');
  const [editExtra, setEditExtra] = useState('0');
  const [editExtraMemo, setEditExtraMemo] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editLateFee, setEditLateFee] = useState('0');
  const [editStatus, setEditStatus] = useState('pending');

  useEffect(() => { loadBillings(); }, [selectedMonth, revision]);

  const loadBillings = async () => {
    setLoading(true); setLoadError('');
    try { setBillings(await allRows(() => supabase.from('billing_schedules').select('*, students(name, payment_due_day)').eq('billing_month', selectedMonth).order('due_date').order('id'))); }
    catch { setLoadError('청구 목록을 불러오지 못했습니다'); }
    finally { setLoading(false); }
  };
  const generateBillings = async () => {
    if (selectedMonth < LEDGER_START) { toast.error('2026년 10월부터 생성할 수 있습니다'); return; }
    setGenerating(true);
    try {
      const [students, existing, intensiveApps] = await Promise.all([
        allRows(() => supabase.from('students').select('id,payment_due_day').in('enrollment_status',['재학','재등원']).order('id')),
        allRows(() => supabase.from('billing_schedules').select('student_id').eq('billing_month', selectedMonth).order('id')),
        allRows(() => supabase.from('intensive_applications').select('student_id,fee,child_name').eq('billed_month',selectedMonth).not('student_id','is',null).order('id')),
      ]);
      const fees = await monthlyFees(students.map(s => s.id), selectedMonth);
      const intensive: Record<string,{fee:number;memo:string}> = {};
      for (const app of intensiveApps) {
        const fee=(intensive[app.student_id]?.fee || 0)+Number(app.fee || 0);
        intensive[app.student_id]={fee,memo:`특강료 ${fee.toLocaleString()}원`};
      }
      const inserts=buildStudentBillings(students,fees,new Set(existing.map(b=>b.student_id)),selectedMonth,intensive);
      if (!inserts.length) { toast.info('추가로 생성할 청구가 없습니다'); return; }
      const {error}=await supabase.from('billing_schedules').insert(inserts);
      if(error) throw error;
      toast.success(`${inserts.length}건 청구 생성 완료`); await loadBillings();
    } catch(err:any) { toast.error(err.message || '청구 생성 실패'); }
    finally { setGenerating(false); }
  };

  const recalculate = async () => {
    if (role !== 'admin' || recalculating || selectedMonth < LEDGER_START) return;
    const month = selectedMonth;
    setRecalculating(true); setRecalculationResult('');
    try {
      const result = await recalculatePendingBillings(month);
      const message = `${month} 대기 청구 ${result.changed}건 변경${result.skipped ? ` · 처리 중 변경된 ${result.skipped}건 제외` : ''}`;
      setRecalculationResult(message); toast.success(message);
    } catch (err) { toast.error(err instanceof Error ? err.message : '대기 청구 다시 계산 실패'); }
    finally { changed(); setRecalculating(false); }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditDiscount(String(item.discount_amount));
    setEditExtra(String(item.extra_amount || 0));
    setEditExtraMemo(item.extra_memo || '');
    setEditMemo(item.memo || '');
    setEditLateFee(String(item.late_fee));
    setEditStatus(item.status);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const discount = Number(editDiscount) || 0;
    const extra = Number(editExtra) || 0;
    const lateFee = Number(editLateFee) || 0;
    const finalAmount = Number(editItem.base_amount) - discount + extra;

    const { error } = await supabase
      .from('billing_schedules')
      .update({
        discount_amount: discount,
        extra_amount: extra,
        extra_memo: editExtraMemo || null,
        final_amount: finalAmount,
        late_fee: lateFee,
        memo: editMemo || null,
        status: editStatus,
      } as any)
      .eq('id', editItem.id);

    if (error) { toast.error('수정 실패'); return; }
    toast.success('청구 수정 완료');
    setEditItem(null);
    loadBillings();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <MonthInput value={selectedMonth} onChange={month => { setSelectedMonth(month); setRecalculationResult(''); }} />
        <Button onClick={generateBillings} disabled={generating || recalculating || loading || selectedMonth < LEDGER_START} className="gap-1.5">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          자동 청구 생성
        </Button>
        {role === 'admin' && <Button variant="outline" onClick={recalculate} disabled={recalculating || generating || loading || selectedMonth < LEDGER_START} className="gap-1.5">
          {recalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}대기 청구 다시 계산
        </Button>}
      </div>
      {recalculationResult && <p role="status" className="text-sm text-muted-foreground">{recalculationResult}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{selectedMonth.replace('-', '년 ')}월 청구 목록 ({billings.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadError ? <div role="alert" className="p-8 text-destructive">{loadError}</div> : loading ? (
            <div className="p-8 text-center text-muted-foreground">로딩 중...</div>
          ) : billings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">청구 내역이 없습니다. 자동 청구 생성을 눌러주세요.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead className="text-right">기본금액</TableHead>
                    <TableHead className="text-right">할인</TableHead>
                    <TableHead className="text-right">특강/추가</TableHead>
                    <TableHead className="text-right">최종금액</TableHead>
                    <TableHead className="text-right">연체료</TableHead>
                    <TableHead>납부기한</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billings.map(b => {
                    const badge = STATUS_BADGE[billingDisplayStatus(b, getTodayKST())] || STATUS_BADGE.pending;
                    const extra = Number((b as any).extra_amount || 0);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium"><StudentPaymentLink id={b.student_id} name={b.students?.name || '미지정'} /></TableCell>
                        <TableCell className="text-right">{Number(b.base_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(b.discount_amount) > 0 ? `-${Number(b.discount_amount).toLocaleString()}` : '-'}</TableCell>
                        <TableCell className="text-right">
                          {extra > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-warn font-medium">+{extra.toLocaleString()}</span>
                              {(b as any).extra_memo && <span className="text-[10px] text-muted-foreground">{(b as any).extra_memo}</span>}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{Number(b.final_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-destructive">{Number(b.late_fee) > 0 ? Number(b.late_fee).toLocaleString() : '-'}</TableCell>
                        <TableCell>{b.due_date}</TableCell>
                        <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>청구 수정 - {(editItem as any)?.students?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">기본 금액</Label>
              <Input value={Number(editItem?.base_amount || 0).toLocaleString() + '원'} disabled className="h-8" />
            </div>
            <div>
              <Label className="text-sm">할인 금액</Label>
              <Input type="number" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-sm">특강/추가 금액</Label>
              <Input type="number" value={editExtra} onChange={e => setEditExtra(e.target.value)} className="h-8" />
              <Input value={editExtraMemo} onChange={e => setEditExtraMemo(e.target.value)} placeholder="예: 여름특강료" className="h-8 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-sm">연체료</Label>
              <Input type="number" value={editLateFee} onChange={e => setEditLateFee(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-sm">상태</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기</SelectItem>
                  <SelectItem value="paid">납부완료</SelectItem>
                  <SelectItem value="overdue">미납</SelectItem>
                  <SelectItem value="cancelled">취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">메모</Label>
              <Textarea value={editMemo} onChange={e => setEditMemo(e.target.value)} rows={2} />
            </div>
            <Button onClick={saveEdit} className="w-full">저장</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
