import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, BookMarked, Copy } from 'lucide-react';
import { format } from 'date-fns';

interface TextbookOrder {
  id: string;
  textbook_name: string;
  unit_price: number;
  quantity: number;
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
  textbook_orders?: { textbook_name: string; unit_price: number } | null;
}

interface Student {
  id: string;
  name: string;
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
      supabase.from('textbook_distributions').select('*, textbook_orders(textbook_name, unit_price)').order('created_at', { ascending: false }),
      supabase.from('textbook_orders').select('*').eq('status', '입고완료').order('created_at', { ascending: false }),
      supabase.from('students').select('id, name').eq('enrollment_status', '재원').order('name'),
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
    const totalAmount = order.unit_price * qty;

    setCreating(true);
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
      toast.success(`${student.name} 학생에게 교재 배부가 등록되었습니다`);
      setShowDialog(false);
      setSelectedOrder(''); setSelectedStudent(''); setDistQty('1');
      fetchData();
    }
    setCreating(false);
  };

  const handleCopyMessage = (dist: Distribution) => {
    const bookName = dist.textbook_orders?.textbook_name || '교재';
    const subject = '수학'; // TODO: could be dynamic based on order context
    const msg = `우리 아이의 가능성을 믿습니다.\n\n#${dist.student_name} 학생 ${subject} 교재 구매 안내\n\n1. 교재명 : #${bookName}\n2. 교재가격 : #${dist.total_amount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 담장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
    navigator.clipboard.writeText(msg);
    toast.success('안내 문자가 복사되었습니다');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const unpaid = distributions.filter(d => d.payment_status === '미납');
  const paid = distributions.filter(d => d.payment_status === '수납완료');

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
                    {orders.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.textbook_name} ({o.unit_price.toLocaleString()}원)
                      </SelectItem>
                    ))}
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
                <Input type="number" min="1" value={distQty} onChange={e => setDistQty(e.target.value)} />
              </div>
              {selectedOrder && (
                <p className="text-sm text-muted-foreground">
                  금액: {((orders.find(o => o.id === selectedOrder)?.unit_price || 0) * (parseInt(distQty) || 1)).toLocaleString()}원
                </p>
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
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => handleCopyMessage(dist)}>
                    <Copy className="w-3.5 h-3.5" />안내문자
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Paid distributions */}
      {paid.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">수납 완료 ({paid.length}건)</h3>
          <div className="space-y-2">
            {paid.map(dist => (
              <Card key={dist.id} className="p-4 opacity-70">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{dist.student_name}</p>
                  <Badge variant="success" className="text-[10px]">수납완료</Badge>
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
    </div>
  );
}
