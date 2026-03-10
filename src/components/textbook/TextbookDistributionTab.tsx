import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, BookMarked, Copy, ShoppingCart, CheckCircle2, Send } from 'lucide-react';
import { format } from 'date-fns';

interface TextbookOrder {
  id: string;
  textbook_name: string;
  unit_price: number;
  quantity: number;
  distributed_qty: number;
  status: string;
}

interface Distribution {
  id: string;
  order_id: string;
  student_id: string;
  student_name: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  distributed_by_name: string;
  created_at: string;
  textbook_orders?: { textbook_name: string; unit_price: number; subject: string } | null;
}

interface Student {
  id: string;
  name: string;
  parent_name?: string | null;
}

const ACCOUNT_INFO = '카카오 3333156191775 최윤기';

export function TextbookDistributionTab() {
  const { user, role } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [orders, setOrders] = useState<TextbookOrder[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userName, setUserName] = useState('');
  // MESSAGE-RESEND-V1: Resend confirmation dialog
  const [resendTarget, setResendTarget] = useState<Distribution | null>(null);
  const [resendType, setResendType] = useState<'payment' | 'selfpurchase'>('payment');

  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [distQty, setDistQty] = useState('1');

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    const [distRes, orderRes, studentRes] = await Promise.all([
      supabase.from('textbook_distributions').select('*, textbook_orders(textbook_name, unit_price, subject)').order('created_at', { ascending: false }),
      supabase.from('textbook_orders').select('*').eq('status', '입고완료').order('created_at', { ascending: false }),
      supabase.from('students').select('id, name, parent_name').eq('enrollment_status', '재원').order('name'),
    ]);
    setDistributions((distRes.data as any[]) || []);
    setOrders((orderRes.data as any[]) || []);
    setStudents((studentRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDistribute = async () => {
    if (!selectedOrder || !selectedStudent) { toast.error('교재와 학생을 선택해주세요'); return; }
    const order = orders.find(o => o.id === selectedOrder);
    const student = students.find(s => s.id === selectedStudent);
    if (!order || !student) return;

    const qty = parseInt(distQty) || 1;
    const remaining = order.quantity - (order.distributed_qty || 0);
    if (qty > remaining) {
      toast.error(`재고가 부족합니다. 남은 수량: ${remaining}권`);
      return;
    }

    // 학부모 청구가: 정가에서 10% 할인
    const discountedPrice = Math.round(order.unit_price * 0.9);
    const totalAmount = discountedPrice * qty;

    setCreating(true);
    // 1. Insert distribution record
    const { error } = await supabase.from('textbook_distributions').insert({
      order_id: selectedOrder,
      student_id: selectedStudent,
      student_name: student.name,
      quantity: qty,
      total_amount: totalAmount,
      distributed_by: user!.id,
      distributed_by_name: userName,
    } as any);

    if (error) { toast.error('배부 등록 실패'); console.error(error); }
    else {
      // 2. Update distributed_qty on textbook_orders
      await supabase.from('textbook_orders').update({
        distributed_qty: (order.distributed_qty || 0) + qty,
      } as any).eq('id', selectedOrder);

      // Close dialog first, then show toast so it's not hidden behind the overlay
      setShowDialog(false);
      setSelectedOrder(''); setSelectedStudent(''); setDistQty('1');
      fetchData();
      setTimeout(() => {
        toast.success(`${student.name} 학생에게 교재 배부 완료 (재고 ${remaining - qty}권 남음)`);
      }, 300);
    }
    setCreating(false);
  };

  const copyPaymentMessage = (dist: Distribution) => {
    const bookName = dist.textbook_orders?.textbook_name || '교재';
    const subject = dist.textbook_orders?.subject || '수학';
    // Find parent name from students list
    const student = students.find(s => s.id === dist.student_id);
    const parentName = (student as any)?.parent_name;
    const depositGuidance = parentName && parentName !== dist.student_name
      ? `\n입금 시 "${dist.student_name}" 또는 "${parentName}"으로 입금 부탁드립니다.`
      : `\n입금 시 "${dist.student_name}" 이름으로 입금 부탁드립니다.`;
    const msg = `더멘토학원 교재안내\n\n#${dist.student_name} 학생 ${subject} 교재 구매 안내\n\n1. 교재명 : #${bookName}\n2. 교재가격 : #${dist.total_amount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
    navigator.clipboard.writeText(msg);
  };

  const copySelfPurchaseMessage = (dist: Distribution) => {
    const bookName = dist.textbook_orders?.textbook_name || '교재';
    const subject = dist.textbook_orders?.subject || '수학';
    const msg = `더멘토학원 교재안내\n\n#${dist.student_name} 학생 ${subject} 교재 개별 구매 안내\n\n1. 교재명 : #${bookName}\n\n해당 교재는 가정에서 직접 구매해주셔야 합니다.\n인터넷 서점(교보문고, 알라딘, YES24 등)에서 구매 가능합니다.\n\n수업 진행을 위해 빠른 준비 부탁드립니다.\n감사합니다.`;
    navigator.clipboard.writeText(msg);
  };

  const handleSendMessage = async (dist: Distribution, type: 'payment' | 'selfpurchase') => {
    const alreadySent = !!(dist as any).message_sent_at;
    if (alreadySent) {
      // Show resend confirmation
      setResendTarget(dist);
      setResendType(type);
      return;
    }
    // First time: copy + record
    if (type === 'payment') copyPaymentMessage(dist);
    else copySelfPurchaseMessage(dist);
    await supabase.from('textbook_distributions').update({ message_sent_at: new Date().toISOString() } as any).eq('id', dist.id);
    toast.success('메시지가 복사되었습니다. 발송완료 처리됨');
    fetchData();
  };

  const handleConfirmResend = async () => {
    if (!resendTarget) return;
    if (resendType === 'payment') copyPaymentMessage(resendTarget);
    else copySelfPurchaseMessage(resendTarget);
    await supabase.from('textbook_distributions').update({ message_resent_at: new Date().toISOString() } as any).eq('id', resendTarget.id);
    toast.success('메시지가 복사되었습니다. 재전송 처리됨');
    setResendTarget(null);
    fetchData();
  };

  const handleConfirmDistribution = async (dist: Distribution) => {
    const { error } = await supabase
      .from('textbook_distributions')
      .update({
        distributed_confirmed_at: new Date().toISOString(),
        distributed_confirmed_by: userName,
      } as any)
      .eq('id', dist.id);
    if (error) { toast.error('배부 확인 실패'); console.error(error); }
    else {
      toast.success(`${dist.student_name} 학생에게 교재 배부 확인 완료`);
      fetchData();
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const unpaid = distributions.filter(d => d.payment_status === '미납');
  const paid = distributions.filter(d => d.payment_status === '수납완료');
  // TEXTBOOK-DISTRIBUTE-CONFIRM-V1: Paid but not yet physically distributed
  const pendingDistribution = paid.filter(d => !(d as any).distributed_confirmed_at);
  const confirmedDistribution = paid.filter(d => !!(d as any).distributed_confirmed_at);

  // Filter orders to only show those with remaining stock
  const availableOrders = orders.filter(o => (o.quantity - (o.distributed_qty || 0)) > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">입고된 교재를 학생에게 배부하고 수납 대상을 등록합니다.</p>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />배부 등록</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>교재 배부 등록</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">교재 선택 *</label>
                <Select value={selectedOrder} onValueChange={setSelectedOrder}>
                  <SelectTrigger><SelectValue placeholder="입고된 교재 선택" /></SelectTrigger>
                  <SelectContent>
                    {availableOrders.map(o => {
                      const remaining = o.quantity - (o.distributed_qty || 0);
                      return (
                        <SelectItem key={o.id} value={o.id}>
                          {o.textbook_name} ({o.unit_price.toLocaleString()}원) [남은 {remaining}권]
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">학생 선택 *</label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger><SelectValue placeholder="학생 선택" /></SelectTrigger>
                  <SelectContent>
                    {students.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">권수</label>
                <Input type="number" min="1" max={selectedOrder ? (orders.find(o => o.id === selectedOrder)?.quantity || 0) - ((orders.find(o => o.id === selectedOrder) as any)?.distributed_qty || 0) : 99} value={distQty} onChange={e => setDistQty(e.target.value)} />
              </div>
              {selectedOrder && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    금액: {((orders.find(o => o.id === selectedOrder)?.unit_price || 0) * (parseInt(distQty) || 1)).toLocaleString()}원
                  </p>
                  <p className="text-xs text-muted-foreground">
                    남은 재고: {(() => {
                      const o = orders.find(o => o.id === selectedOrder);
                      return o ? o.quantity - (o.distributed_qty || 0) : 0;
                    })()}권
                  </p>
                </div>
              )}
              <Button onClick={handleDistribute} disabled={creating} className="w-full">
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}배부 등록
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Unpaid distributions */}
      {unpaid.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <BookMarked className="w-4 h-4" />미납 교재비 ({unpaid.length}건)
          </h3>
          <div className="space-y-2">
            {unpaid.map(dist => (
              <Card key={dist.id} className="p-4 border-l-4 border-l-destructive/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{dist.student_name}</p>
                      <Badge variant="destructive" className="text-[10px]">미납</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {dist.textbook_orders?.textbook_name} · {dist.quantity}권 · {dist.total_amount.toLocaleString()}원
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      배부: {dist.distributed_by_name} · {format(new Date(dist.created_at), 'MM/dd')}
                      {(dist as any).message_sent_at && (
                        <span className="ml-1.5 text-primary">
                          · 발송완료 {format(new Date((dist as any).message_sent_at), 'MM/dd HH:mm')}
                          {(dist as any).message_resent_at && (
                            <> · 재전송 {format(new Date((dist as any).message_resent_at), 'MM/dd HH:mm')}</>
                          )}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" variant={(dist as any).message_sent_at ? 'ghost' : 'outline'} className="gap-1" onClick={() => handleSendMessage(dist, 'payment')}>
                      <Send className="w-3.5 h-3.5" />{(dist as any).message_sent_at ? '재전송' : '안내문자'}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-muted-foreground" onClick={() => handleSendMessage(dist, 'selfpurchase')}>
                      <ShoppingCart className="w-3.5 h-3.5" />개별구매
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TEXTBOOK-DISTRIBUTE-CONFIRM-V1: Pending distribution (paid but not physically handed over) */}
      {pendingDistribution.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <BookMarked className="w-4 h-4 text-primary" />배부 대기 ({pendingDistribution.length}건)
          </h3>
          <p className="text-xs text-muted-foreground mb-2">수납 완료된 교재입니다. 학생에게 교재를 전달한 후 배부 확인 버튼을 눌러주세요.</p>
          <div className="space-y-2">
            {pendingDistribution.map(dist => (
              <Card key={dist.id} className="p-4 border-l-4 border-l-primary/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{dist.student_name}</p>
                      <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">수납완료 · 배부대기</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {dist.textbook_orders?.textbook_name} · {dist.quantity}권 · {dist.total_amount.toLocaleString()}원
                    </p>
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => handleConfirmDistribution(dist)}>
                    <CheckCircle2 className="w-3.5 h-3.5" />배부 확인
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed distributions */}
      {confirmedDistribution.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">배부 완료 ({confirmedDistribution.length}건)</h3>
          <div className="space-y-2">
            {confirmedDistribution.map(dist => (
              <Card key={dist.id} className="p-4 opacity-70">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{dist.student_name}</p>
                  <Badge variant="success" className="text-[10px]">배부완료</Badge>
                  <span className="text-sm text-muted-foreground ml-auto">
                    {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {distributions.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">배부 기록이 없습니다</p>
      )}
      {/* MESSAGE-RESEND-V1: Resend confirmation dialog */}
      <Dialog open={!!resendTarget} onOpenChange={(open) => !open && setResendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>메시지 재전송</DialogTitle>
            <DialogDescription>
              {resendTarget?.student_name} 학생에게 {resendType === 'payment' ? '교재비 안내' : '개별구매 안내'} 메시지를 재전송하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendTarget(null)}>취소</Button>
            <Button onClick={handleConfirmResend}>네, 재전송</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
