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
import { Plus, Loader2, Package, PackageCheck, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface TextbookOrder {
  id: string;
  textbook_name: string;
  quantity: number;
  subject: string;
  unit_price: number;
  status: string;
  requested_by: string;
  requested_by_name: string;
  approved_at: string | null;
  approved_by_name: string | null;
  notes: string | null;
  created_at: string;
}

export function TextbookOrderTab() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<TextbookOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userName, setUserName] = useState('');

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('수학');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('textbook_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('교재 신청 목록을 불러올 수 없습니다');
    else setOrders((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Realtime subscription for order status changes
  useEffect(() => {
    const channel = supabase
      .channel('textbook-orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'textbook_orders' }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === '입고완료' && updated.requested_by === user?.id) {
          toast.success(`📦 "${updated.textbook_name}" 교재가 입고 완료되었습니다!`, { duration: 6000 });
        }
        fetchOrders();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'textbook_orders' }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchOrders]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('교재명을 입력해주세요'); return; }
    if (!price.trim() || isNaN(Number(price))) { toast.error('단가를 입력해주세요'); return; }
    setCreating(true);
    const { error } = await supabase.from('textbook_orders').insert({
      textbook_name: name.trim(),
      quantity: parseInt(qty) || 1,
      unit_price: parseInt(price) || 0,
      requested_by: user!.id,
      requested_by_name: userName,
      notes: notes.trim() || null,
    } as any);
    if (error) { toast.error('신청 실패'); console.error(error); }
    else {
      toast.success('교재 신청이 등록되었습니다');
      setShowDialog(false);
      setName(''); setQty('1'); setPrice(''); setNotes('');
      fetchOrders();
    }
    setCreating(false);
  };

  const handleApprove = async (order: TextbookOrder) => {
    const { error } = await supabase.from('textbook_orders').update({
      status: '입고완료',
      approved_at: new Date().toISOString(),
      approved_by_name: userName,
      updated_at: new Date().toISOString(),
    } as any).eq('id', order.id);
    if (error) toast.error('입고 처리 실패');
    else { toast.success('입고 완료 처리되었습니다'); fetchOrders(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 신청을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('textbook_orders').delete().eq('id', id);
    if (error) toast.error('삭제 실패');
    else { toast.success('삭제되었습니다'); fetchOrders(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const pending = orders.filter(o => o.status === '신청');
  const completed = orders.filter(o => o.status === '입고완료');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">교재를 신청하고 입고 상태를 관리합니다.</p>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />교재 신청</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>교재 신청</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">교재명 *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="교재명 입력" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground">권수</label>
                  <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">단가 (원) *</label>
                  <Input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="15000" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">비고</label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="메모 (선택)" />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}신청하기
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{pending.length}</p>
          <p className="text-xs text-muted-foreground mt-1">입고 대기</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{completed.length}</p>
          <p className="text-xs text-muted-foreground mt-1">입고 완료</p>
        </Card>
      </div>

      {/* Pending orders */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Package className="w-4 h-4" />입고 대기</h3>
          <div className="space-y-2">
            {pending.map(order => (
              <Card key={order.id} className="p-4 border-l-4 border-l-warning">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{order.textbook_name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.quantity}권 × {order.unit_price.toLocaleString()}원 = {(order.quantity * order.unit_price).toLocaleString()}원
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      신청: {order.requested_by_name} · {format(new Date(order.created_at), 'MM/dd HH:mm')}
                    </p>
                    {order.notes && <p className="text-xs text-muted-foreground mt-0.5">📝 {order.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {role === 'admin' && (
                      <>
                        <Button size="sm" variant="default" className="gap-1" onClick={() => handleApprove(order)}>
                          <PackageCheck className="w-3.5 h-3.5" />입고 완료
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(order.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed orders */}
      {completed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><PackageCheck className="w-4 h-4" />입고 완료</h3>
          <div className="space-y-2">
            {completed.map(order => (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{order.textbook_name}</p>
                      <Badge variant="success" className="text-[10px]">입고완료</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.quantity}권 × {order.unit_price.toLocaleString()}원
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      신청: {order.requested_by_name} · 입고: {order.approved_by_name} ({order.approved_at && format(new Date(order.approved_at), 'MM/dd')})
                    </p>
                  </div>
                  {role === 'admin' && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(order.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">등록된 교재 신청이 없습니다</p>
      )}
    </div>
  );
}
