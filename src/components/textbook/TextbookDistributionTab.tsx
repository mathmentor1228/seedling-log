import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Loader2, BookMarked, ShoppingCart, CheckCircle2, Send, ChevronsUpDown, Check, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  const [resendTarget, setResendTarget] = useState<Distribution | null>(null);
  const [resendType, setResendType] = useState<'payment' | 'selfpurchase'>('payment');

  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [distQty, setDistQty] = useState('1');
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);
  const [studentPopoverOpen, setStudentPopoverOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

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

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const handleDistribute = async () => {
    if (!selectedOrder || selectedStudents.length === 0) { toast.error('교재와 학생을 선택해주세요'); return; }
    const order = orders.find(o => o.id === selectedOrder);
    if (!order) return;

    const qty = parseInt(distQty) || 1;
    const totalNeeded = qty * selectedStudents.length;
    const remaining = order.quantity - (order.distributed_qty || 0);
    if (totalNeeded > remaining) {
      toast.error(`재고가 부족합니다. 필요: ${totalNeeded}권, 남은 수량: ${remaining}권`);
      return;
    }

    const discountedPrice = Math.round(order.unit_price * 0.9);
    const totalAmount = discountedPrice * qty;

    setCreating(true);

    const insertRows = selectedStudents.map(studentId => {
      const student = students.find(s => s.id === studentId);
      return {
        order_id: selectedOrder,
        student_id: studentId,
        student_name: student?.name || '',
        quantity: qty,
        total_amount: totalAmount,
        distributed_by: user!.id,
        distributed_by_name: userName,
      };
    });

    const { error } = await supabase.from('textbook_distributions').insert(insertRows as any);

    if (error) { toast.error('배부 등록 실패'); console.error(error); }
    else {
      await supabase.from('textbook_orders').update({
        distributed_qty: (order.distributed_qty || 0) + totalNeeded,
      } as any).eq('id', selectedOrder);

      const names = selectedStudents.map(id => students.find(s => s.id === id)?.name).filter(Boolean).join(', ');
      setShowDialog(false);
      setSelectedOrder(''); setSelectedStudents([]); setDistQty('1');
      fetchData();
      setTimeout(() => {
        toast.success(`${names} 학생에게 교재 배부 완료 (${selectedStudents.length}명, 재고 ${remaining - totalNeeded}권 남음)`);
      }, 300);
    }
    setCreating(false);
  };

  // Group unpaid distributions by student for consolidated messaging
  const buildStudentPaymentMessage = (studentId: string) => {
    const studentDists = distributions.filter(d => d.student_id === studentId && d.payment_status === '미납');
    if (studentDists.length === 0) return '';
    const studentName = studentDists[0].student_name;
    const student = students.find(s => s.id === studentId);
    const parentName = (student as any)?.parent_name;
    const depositGuidance = parentName && parentName !== studentName
      ? `\n입금 시 "${studentName}" 또는 "${parentName}"으로 입금 부탁드립니다.`
      : `\n입금 시 "${studentName}" 이름으로 입금 부탁드립니다.`;

    let totalOriginal = 0;
    let totalDiscounted = 0;
    const bookLines = studentDists.map((dist, i) => {
      const bookName = dist.textbook_orders?.textbook_name || '교재';
      const subject = dist.textbook_orders?.subject || '';
      const originalPrice = (dist.textbook_orders?.unit_price || 0) * (dist.quantity || 1);
      totalOriginal += originalPrice;
      totalDiscounted += dist.total_amount;
      return `${i + 1}. ${subject ? `[${subject}] ` : ''}${bookName} (${dist.quantity}권)\n   정가: ${originalPrice.toLocaleString()}원 → 청구: ${dist.total_amount.toLocaleString()}원`;
    }).join('\n');

    return `더멘토학원 교재안내\n\n#${studentName} 학생 교재 구매 안내\n\n${bookLines}\n\n합계 정가: ${totalOriginal.toLocaleString()}원\n합계 청구금액(10%할인): #${totalDiscounted.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
  };

  const buildStudentSelfPurchaseMessage = (studentId: string) => {
    const studentDists = distributions.filter(d => d.student_id === studentId && d.payment_status === '미납');
    if (studentDists.length === 0) return '';
    const studentName = studentDists[0].student_name;

    const bookLines = studentDists.map((dist, i) => {
      const bookName = dist.textbook_orders?.textbook_name || '교재';
      const subject = dist.textbook_orders?.subject || '';
      return `${i + 1}. ${subject ? `[${subject}] ` : ''}${bookName}`;
    }).join('\n');

    return `더멘토학원 교재안내\n\n#${studentName} 학생 교재 개별 구매 안내\n\n${bookLines}\n\n해당 교재는 가정에서 직접 구매해주셔야 합니다.\n인터넷 서점(교보문고, 알라딘, YES24 등)에서 구매 가능합니다.\n\n수업 진행을 위해 빠른 준비 부탁드립니다.\n감사합니다.`;
  };

  const handleSendGroupMessage = async (studentId: string, type: 'payment' | 'selfpurchase') => {
    const studentDists = distributions.filter(d => d.student_id === studentId && d.payment_status === '미납');
    const anySent = studentDists.some(d => !!(d as any).message_sent_at);

    if (anySent) {
      setResendTarget(studentDists[0]);
      setResendType(type);
      return;
    }

    const msg = type === 'payment' ? buildStudentPaymentMessage(studentId) : buildStudentSelfPurchaseMessage(studentId);
    navigator.clipboard.writeText(msg);

    // Mark all as sent
    await Promise.all(studentDists.map(d =>
      supabase.from('textbook_distributions').update({ message_sent_at: new Date().toISOString() } as any).eq('id', d.id)
    ));
    toast.success('메시지가 복사되었습니다. 발송완료 처리됨');
    fetchData();
  };

  const handleConfirmResend = async () => {
    if (!resendTarget) return;
    const studentId = resendTarget.student_id;
    const studentDists = distributions.filter(d => d.student_id === studentId && d.payment_status === '미납');

    const msg = resendType === 'payment' ? buildStudentPaymentMessage(studentId) : buildStudentSelfPurchaseMessage(studentId);
    navigator.clipboard.writeText(msg);

    await Promise.all(studentDists.map(d =>
      supabase.from('textbook_distributions').update({ message_resent_at: new Date().toISOString() } as any).eq('id', d.id)
    ));
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
  const pendingDistribution = paid.filter(d => !(d as any).distributed_confirmed_at);
  const confirmedDistribution = paid.filter(d => !!(d as any).distributed_confirmed_at);

  // Group unpaid by student
  const unpaidByStudent = unpaid.reduce<Record<string, Distribution[]>>((acc, d) => {
    if (!acc[d.student_id]) acc[d.student_id] = [];
    acc[d.student_id].push(d);
    return acc;
  }, {});

  const availableOrders = orders.filter(o => (o.quantity - (o.distributed_qty || 0)) > 0);

  const filteredStudents = studentSearch
    ? students.filter(s => s.name.includes(studentSearch))
    : students;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">입고된 교재를 학생에게 배부하고 수납 대상을 등록합니다.</p>
        <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) { setSelectedStudents([]); setSelectedOrder(''); setDistQty('1'); setStudentSearch(''); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />배부 등록</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>교재 배부 등록</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">교재 선택 *</label>
                <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={orderPopoverOpen} className="w-full justify-between font-normal">
                      {selectedOrder
                        ? (() => { const o = availableOrders.find(o => o.id === selectedOrder); return o ? `${o.textbook_name} [${o.quantity - (o.distributed_qty || 0)}권]` : '교재 선택'; })()
                        : '입고된 교재 검색...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="교재명 검색..." />
                      <CommandList>
                        <CommandEmpty>결과 없음</CommandEmpty>
                        <CommandGroup>
                          {availableOrders.map(o => {
                            const remaining = o.quantity - (o.distributed_qty || 0);
                            return (
                              <CommandItem key={o.id} value={o.textbook_name} onSelect={() => { setSelectedOrder(o.id); setOrderPopoverOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", selectedOrder === o.id ? "opacity-100" : "opacity-0")} />
                                {o.textbook_name} ({o.unit_price.toLocaleString()}원) [남은 {remaining}권]
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  학생 선택 * <span className="text-xs text-muted-foreground">(복수 선택 가능)</span>
                </label>
                {selectedStudents.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {selectedStudents.map(id => {
                      const s = students.find(s => s.id === id);
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleStudent(id)}>
                          {s?.name} ✕
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <Popover open={studentPopoverOpen} onOpenChange={setStudentPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={studentPopoverOpen} className="w-full justify-between font-normal">
                      {selectedStudents.length > 0
                        ? `${selectedStudents.length}명 선택됨`
                        : '학생 이름 검색...'}
                      <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="학생 이름 검색..." value={studentSearch} onValueChange={setStudentSearch} />
                      <CommandList>
                        <CommandEmpty>결과 없음</CommandEmpty>
                        <CommandGroup>
                          {filteredStudents.map(s => (
                            <CommandItem key={s.id} value={s.name} onSelect={() => toggleStudent(s.id)}>
                              <Checkbox checked={selectedStudents.includes(s.id)} className="mr-2" />
                              {s.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">1인당 권수</label>
                <Input type="number" min="1" value={distQty} onChange={e => setDistQty(e.target.value)} />
              </div>
              {selectedOrder && selectedStudents.length > 0 && (
                <div className="space-y-1 p-3 rounded-md bg-muted/50">
                  <p className="text-sm text-foreground font-medium">
                    배부 요약: {selectedStudents.length}명 × {distQty}권 = 총 {selectedStudents.length * (parseInt(distQty) || 1)}권
                  </p>
                  <p className="text-sm text-muted-foreground">
                    1인당 청구액(10%할인): {Math.round((orders.find(o => o.id === selectedOrder)?.unit_price || 0) * 0.9 * (parseInt(distQty) || 1)).toLocaleString()}원
                  </p>
                  <p className="text-xs text-muted-foreground">
                    남은 재고: {(() => {
                      const o = orders.find(o => o.id === selectedOrder);
                      const r = o ? o.quantity - (o.distributed_qty || 0) : 0;
                      const needed = selectedStudents.length * (parseInt(distQty) || 1);
                      return `${r}권 → 배부 후 ${r - needed}권`;
                    })()}
                  </p>
                </div>
              )}
              <Button onClick={handleDistribute} disabled={creating} className="w-full">
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {selectedStudents.length > 1 ? `${selectedStudents.length}명에게 배부 등록` : '배부 등록'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Unpaid distributions - grouped by student */}
      {Object.keys(unpaidByStudent).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <BookMarked className="w-4 h-4" />미납 교재비 ({unpaid.length}건 · {Object.keys(unpaidByStudent).length}명)
          </h3>
          <div className="space-y-2">
            {Object.entries(unpaidByStudent).map(([studentId, dists]) => {
              const totalAmount = dists.reduce((sum, d) => sum + d.total_amount, 0);
              const anySent = dists.some(d => !!(d as any).message_sent_at);
              const latestSent = dists.reduce((latest, d) => {
                const t = (d as any).message_sent_at;
                return t && (!latest || t > latest) ? t : latest;
              }, null as string | null);
              const latestResent = dists.reduce((latest, d) => {
                const t = (d as any).message_resent_at;
                return t && (!latest || t > latest) ? t : latest;
              }, null as string | null);

              return (
                <Card key={studentId} className="p-4 border-l-4 border-l-destructive/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{dists[0].student_name}</p>
                        <Badge variant="destructive" className="text-[10px]">미납 {dists.length}건</Badge>
                        <span className="text-sm font-medium text-destructive">{totalAmount.toLocaleString()}원</span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {dists.map(dist => (
                          <p key={dist.id} className="text-sm text-muted-foreground">
                            · {dist.textbook_orders?.textbook_name} · {dist.quantity}권 · {dist.total_amount.toLocaleString()}원
                            <span className="text-xs ml-1">({dist.distributed_by_name} {format(new Date(dist.created_at), 'MM/dd')})</span>
                          </p>
                        ))}
                      </div>
                      {latestSent && (
                        <p className="text-xs text-primary mt-1">
                          발송완료 {format(new Date(latestSent), 'MM/dd HH:mm')}
                          {latestResent && <> · 재전송 {format(new Date(latestResent), 'MM/dd HH:mm')}</>}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button size="sm" variant={anySent ? 'ghost' : 'outline'} className="gap-1" onClick={() => handleSendGroupMessage(studentId, 'payment')}>
                        <Send className="w-3.5 h-3.5" />{anySent ? '재전송' : '안내문자'}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-muted-foreground" onClick={() => handleSendGroupMessage(studentId, 'selfpurchase')}>
                        <ShoppingCart className="w-3.5 h-3.5" />개별구매
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending distribution */}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">{dist.student_name}</p>
                  <Badge variant="success" className="text-[10px]">배부완료</Badge>
                  <span className="text-xs text-muted-foreground">배부: {dist.distributed_by_name}</span>
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

      {/* Resend confirmation dialog */}
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
