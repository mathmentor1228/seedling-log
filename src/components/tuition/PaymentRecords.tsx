import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const PAYMENT_METHODS = ['현금', '카드', '계좌이체', '기타'];

export function PaymentRecords() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [pendingBillings, setPendingBillings] = useState<any[]>([]);

  // form state
  const [formStudentId, setFormStudentId] = useState('');
  const [formBillingId, setFormBillingId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formMethod, setFormMethod] = useState('계좌이체');
  const [formMemo, setFormMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPayments(); }, []);

  const loadPayments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_records')
      .select('*, students(name), billing_schedules(billing_month, final_amount)')
      .order('paid_date', { ascending: false })
      .limit(100);
    setPayments(data || []);
    setLoading(false);
  };

  const openAdd = async () => {
    const [{ data: studentsData }, { data: billingsData }] = await Promise.all([
      supabase.from('students').select('id, name').eq('enrollment_status', '재원').order('name'),
      supabase.from('billing_schedules').select('id, student_id, billing_month, final_amount, students(name)').in('status', ['pending', 'overdue']).order('due_date'),
    ]);
    setStudents(studentsData || []);
    setPendingBillings(billingsData || []);
    setFormStudentId('');
    setFormBillingId('');
    setFormAmount('');
    setFormDate(new Date());
    setFormMethod('계좌이체');
    setFormMemo('');
    setShowAdd(true);
  };

  const onSelectBilling = (billingId: string) => {
    setFormBillingId(billingId);
    const billing = pendingBillings.find(b => b.id === billingId);
    if (billing) {
      setFormStudentId(billing.student_id);
      setFormAmount(String(billing.final_amount));
    }
  };

  const handleSave = async () => {
    if (!formStudentId) { toast.error('학생을 선택해주세요'); return; }
    if (!formAmount || Number(formAmount) <= 0) { toast.error('금액을 입력해주세요'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('payment_records').insert({
        student_id: formStudentId,
        billing_schedule_id: formBillingId || null,
        amount: Number(formAmount),
        paid_date: format(formDate, 'yyyy-MM-dd'),
        payment_method: formMethod,
        memo: formMemo || null,
        recorded_by: user?.id || null,
      } as any);
      if (error) throw error;

      // Update billing status to paid if linked
      if (formBillingId) {
        await supabase.from('billing_schedules').update({ status: 'paid' } as any).eq('id', formBillingId);
      }

      toast.success('납부 기록 완료');
      setShowAdd(false);
      loadPayments();
    } catch (err: any) {
      toast.error(err.message || '납부 기록 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">최근 납부 기록</h3>
        <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" />납부 등록</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">로딩 중...</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">납부 기록이 없습니다</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>청구월</TableHead>
                    <TableHead className="text-right">납부금액</TableHead>
                    <TableHead>납부일</TableHead>
                    <TableHead>방법</TableHead>
                    <TableHead>메모</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{(p as any).students?.name || '-'}</TableCell>
                      <TableCell>{(p as any).billing_schedules?.billing_month || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(p.amount).toLocaleString()}원</TableCell>
                      <TableCell>{p.paid_date}</TableCell>
                      <TableCell>{p.payment_method}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate">{p.memo || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>납부 등록</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">미납 청구서에서 선택 (선택사항)</Label>
              <Select value={formBillingId} onValueChange={onSelectBilling}>
                <SelectTrigger className="h-8"><SelectValue placeholder="청구서 선택" /></SelectTrigger>
                <SelectContent>
                  {pendingBillings.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b as any).students?.name} - {b.billing_month} ({Number(b.final_amount).toLocaleString()}원)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">학생 *</Label>
              <Select value={formStudentId} onValueChange={setFormStudentId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="학생 선택" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">금액 *</Label>
              <Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} className="h-8" placeholder="0" />
            </div>
            <div>
              <Label className="text-sm">납부일</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 w-full justify-start text-left text-sm">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(formDate, 'yyyy-MM-dd')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formDate} onSelect={d => d && setFormDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-sm">납부 방법</Label>
              <Select value={formMethod} onValueChange={setFormMethod}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">메모</Label>
              <Textarea value={formMemo} onChange={e => setFormMemo(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? '저장 중...' : '납부 등록'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
