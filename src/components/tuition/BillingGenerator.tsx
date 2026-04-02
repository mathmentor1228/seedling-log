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
import { Loader2, Plus, Zap, Pencil } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '대기', variant: 'secondary' },
  paid: { label: '납부완료', variant: 'default' },
  overdue: { label: '미납', variant: 'destructive' },
  cancelled: { label: '취소', variant: 'outline' },
};

export function BillingGenerator() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));
  const [billings, setBillings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editDiscount, setEditDiscount] = useState('0');
  const [editMemo, setEditMemo] = useState('');
  const [editLateFee, setEditLateFee] = useState('0');
  const [editStatus, setEditStatus] = useState('pending');

  const months = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i - 2, 1);
    return format(d, 'yyyy-MM');
  });

  useEffect(() => { loadBillings(); }, [selectedMonth]);

  const loadBillings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('billing_schedules')
      .select('*, students(name, payment_due_day)')
      .eq('billing_month', selectedMonth)
      .order('due_date');
    setBillings(data || []);
    setLoading(false);
  };

  const generateBillings = async () => {
    setGenerating(true);
    try {
      // Get all active student_courses with course_policies
      const { data: courses } = await supabase
        .from('student_courses')
        .select('id, student_id, course_policy_id, course_policies(monthly_fee, course_name)')
        .eq('is_active', true);

      if (!courses || courses.length === 0) {
        toast.info('활성 수강 중인 학생이 없습니다');
        setGenerating(false);
        return;
      }

      // Get students' payment_due_day
      const studentIds = [...new Set(courses.map(c => c.student_id))];
      const { data: students } = await supabase
        .from('students')
        .select('id, payment_due_day')
        .in('id', studentIds);
      const studentMap = Object.fromEntries((students || []).map(s => [s.id, s]));

      // Check existing billings for this month
      const { data: existing } = await supabase
        .from('billing_schedules')
        .select('student_id, student_course_id')
        .eq('billing_month', selectedMonth);
      const existingSet = new Set((existing || []).map(e => `${e.student_id}-${e.student_course_id}`));

      const [year, month] = selectedMonth.split('-').map(Number);
      const inserts = courses
        .filter(c => !existingSet.has(`${c.student_id}-${c.id}`))
        .map(c => {
          const fee = (c as any).course_policies?.monthly_fee || 0;
          const dueDay = studentMap[c.student_id]?.payment_due_day || 1;
          const lastDay = new Date(year, month, 0).getDate();
          const adjustedDay = Math.min(dueDay, lastDay);
          const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;

          return {
            student_id: c.student_id,
            student_course_id: c.id,
            billing_month: selectedMonth,
            base_amount: fee,
            discount_amount: 0,
            final_amount: fee,
            due_date: dueDate,
            status: 'pending',
          };
        });

      if (inserts.length === 0) {
        toast.info('이미 모든 청구가 생성되어 있습니다');
        setGenerating(false);
        return;
      }

      const { error } = await supabase.from('billing_schedules').insert(inserts as any);
      if (error) throw error;
      toast.success(`${inserts.length}건 청구 생성 완료`);
      loadBillings();
    } catch (err: any) {
      toast.error(err.message || '청구 생성 실패');
    } finally {
      setGenerating(false);
    }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditDiscount(String(item.discount_amount));
    setEditMemo(item.memo || '');
    setEditLateFee(String(item.late_fee));
    setEditStatus(item.status);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const discount = Number(editDiscount) || 0;
    const lateFee = Number(editLateFee) || 0;
    const finalAmount = Number(editItem.base_amount) - discount;

    const { error } = await supabase
      .from('billing_schedules')
      .update({
        discount_amount: discount,
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
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m} value={m}>{m.replace('-', '년 ')}월</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={generateBillings} disabled={generating} className="gap-1.5">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          자동 청구 생성
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{selectedMonth.replace('-', '년 ')}월 청구 목록 ({billings.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
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
                    <TableHead className="text-right">최종금액</TableHead>
                    <TableHead className="text-right">연체료</TableHead>
                    <TableHead>납부기한</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billings.map(b => {
                    const badge = STATUS_BADGE[b.status] || STATUS_BADGE.pending;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{(b as any).students?.name || '-'}</TableCell>
                        <TableCell className="text-right">{Number(b.base_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(b.discount_amount) > 0 ? `-${Number(b.discount_amount).toLocaleString()}` : '-'}</TableCell>
                        <TableCell className="text-right font-semibold">{Number(b.final_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-red-600">{Number(b.late_fee) > 0 ? Number(b.late_fee).toLocaleString() : '-'}</TableCell>
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
