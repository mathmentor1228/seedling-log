import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { StatCard } from '@/components/ui/stat-card';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Plus, Loader2, BookMarked, Send, ChevronsUpDown, Check, Users, CheckCircle2, Package, Clock, Copy, ChevronDown, MessageCircle, ShoppingBag, ShoppingCart, Search, X, Trash2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TextbookOrder {
  id: string;
  textbook_name: string;
  unit_price: number;
  quantity: number;
  distributed_qty: number;
  status: string;
  subject: string;
  textbook_type?: string;
}

interface Distribution {
  id: string;
  order_id: string;
  student_id: string;
  student_name: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  paid_at: string | null;
  confirmed_by: string | null;
  billed_at: string | null;
  distributed_by_name: string;
  distributed_confirmed_at: string | null;
  distributed_confirmed_by: string | null;
  message_sent_at: string | null;
  message_resent_at: string | null;
  depositor_name: string | null;
  created_at: string;
  textbook_orders?: { textbook_name: string; unit_price: number; subject: string } | null;
  parent_phone?: string | null;
  parent_name?: string | null;
}

interface Student { id: string; name: string; parent_name?: string | null; }

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
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [distQty, setDistQty] = useState('1');
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);
  const [studentPopoverOpen, setStudentPopoverOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const [paymentTarget, setPaymentTarget] = useState<Distribution | null>(null);
  const [depositorName, setDepositorName] = useState('');
  const [parentNameInput, setParentNameInput] = useState('');
  const [resendTarget, setResendTarget] = useState<Distribution | null>(null);
  const [resendType, setResendType] = useState<'payment' | 'selfpurchase'>('payment');

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<Date | undefined>();
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    const [distRes, orderRes, studentRes] = await Promise.all([
      supabase.from('textbook_distributions').select('*, textbook_orders(textbook_name, unit_price, subject)').order('created_at', { ascending: false }),
      supabase.from('textbook_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('students').select('id, name, parent_name, parent_phone').in('enrollment_status', ['재학', '재등원']).order('name'),
    ]);

    const dists = (distRes.data as any[]) || [];
    const studentMap = new Map((studentRes.data as any[] || []).map((s: any) => [s.id, { parent_phone: s.parent_phone, parent_name: s.parent_name }]));
    dists.forEach((d: any) => {
      const info = studentMap.get(d.student_id);
      d.parent_phone = info?.parent_phone || null;
      d.parent_name = info?.parent_name || null;
    });

    setDistributions(dists);
    setOrders((orderRes.data as any[]) || []);
    setStudents((studentRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('dist-payment-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'textbook_distributions' }, (payload) => {
        const updated = payload.new as any;
        const old = payload.old as any;
        if (updated.payment_status === '수납완료' && old.payment_status !== '수납완료') {
          toast.success(`💰 ${updated.student_name} 학생의 교재비가 수납 완료되었습니다!`, { duration: 8000 });
        }
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  // Filter out teacher-only textbooks from available orders
  const availableOrders = useMemo(() => {
    return orders.filter(o => (o.quantity - (o.distributed_qty || 0)) > 0 && (o as any).textbook_type !== 'teacher');
  }, [orders]);

  const handleAssign = async () => {
    if (!selectedOrder || selectedStudents.length === 0) { toast.error('교재와 학생을 선택해주세요'); return; }
    const order = orders.find(o => o.id === selectedOrder);
    if (!order) return;
    const qty = parseInt(distQty) || 1;
    const discountedPrice = Math.round(order.unit_price * 0.9);
    const totalAmount = discountedPrice * qty;
    setCreating(true);

    const insertRows = selectedStudents.map(studentId => {
      const student = students.find(s => s.id === studentId);
      return { order_id: selectedOrder, student_id: studentId, student_name: student?.name || '', quantity: qty, total_amount: totalAmount, distributed_by: user!.id, distributed_by_name: userName };
    });

    const { error } = await supabase.from('textbook_distributions').insert(insertRows as any);
    if (error) { toast.error('배정 등록 실패'); console.error(error); }
    else {
      const totalNeeded = qty * selectedStudents.length;
      await supabase.from('textbook_orders').update({ distributed_qty: (order.distributed_qty || 0) + totalNeeded } as any).eq('id', selectedOrder);
      setShowDialog(false); setSelectedOrder(''); setSelectedStudents([]); setDistQty('1');
      fetchData();
      toast.success(`${selectedStudents.length}명 배정 완료`);
    }
    setCreating(false);
  };

  // Cancel distribution - fully delete from DB
  const handleCancelDistribution = async (dist: Distribution) => {
    if (!confirm(`${dist.student_name} 학생의 "${dist.textbook_orders?.textbook_name}" 배정을 취소하시겠습니까?\n이력이 완전히 삭제됩니다.`)) return;
    
    // Restore distributed_qty on the order
    const order = orders.find(o => o.id === dist.order_id);
    if (order) {
      await supabase.from('textbook_orders').update({
        distributed_qty: Math.max(0, (order.distributed_qty || 0) - dist.quantity),
      } as any).eq('id', dist.order_id);
    }

    const { error } = await supabase.from('textbook_distributions').delete().eq('id', dist.id);
    if (error) { toast.error('취소 실패'); console.error(error); }
    else { toast.success(`${dist.student_name} 학생 배정이 취소되었습니다`); fetchData(); }
  };

  const generatePaymentMessage = (studentName: string, studentDists: Distribution[]) => {
    const parentName = studentDists[0]?.parent_name;
    const depositGuidance = parentName && parentName !== studentName
      ? `\n입금 시 "${studentName}" 또는 "${parentName}"으로 입금 부탁드립니다.`
      : `\n입금 시 "${studentName}" 이름으로 입금 부탁드립니다.`;

    if (studentDists.length === 1) {
      const dist = studentDists[0]; const bookName = dist.textbook_orders?.textbook_name || '교재'; const subject = dist.textbook_orders?.subject || '수학';
      return `더멘토학원 교재안내\n\n${studentName} 학생 ${subject} 교재 구매 안내\n\n1. 교재명 : ${bookName}\n2. 교재가격 : ${dist.total_amount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
    }
    const totalAmount = studentDists.reduce((sum, d) => sum + d.total_amount, 0);
    const itemList = studentDists.map((d, i) => `${i + 1}. ${d.textbook_orders?.subject ? `[${d.textbook_orders.subject}] ` : ''}${d.textbook_orders?.textbook_name || '교재'} : ${d.total_amount.toLocaleString()}원`).join('\n');
    return `더멘토학원 교재안내\n\n${studentName} 학생 교재 구매 안내\n\n${itemList}\n\n합계 : ${totalAmount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
  };

  const generateSelfPurchaseMessage = (studentName: string, studentDists: Distribution[]) => {
    const bookLines = studentDists.map((d, i) => `${i + 1}. ${d.textbook_orders?.subject ? `[${d.textbook_orders.subject}] ` : ''}${d.textbook_orders?.textbook_name || '교재'}`).join('\n');
    return `더멘토학원 교재안내\n\n#${studentName} 학생 교재 개별 구매 안내\n\n${bookLines}\n\n해당 교재는 가정에서 직접 구매해주셔야 합니다.\n인터넷 서점에서 구매 가능합니다.\n\n수업 진행을 위해 빠른 준비 부탁드립니다.`;
  };

  const markBilled = async (distIds: string[]) => {
    const now = new Date().toISOString();
    for (const id of distIds) { await supabase.from('textbook_distributions').update({ billed_at: now, message_sent_at: now } as any).eq('id', id); }
    fetchData();
  };

  const handleSendMessage = async (studentId: string, type: 'payment' | 'selfpurchase') => {
    const studentDists = distributions.filter(d => d.student_id === studentId && d.payment_status === '미납');
    if (studentDists.length === 0) return;
    const anySent = studentDists.some(d => !!d.message_sent_at);
    if (anySent) { setResendTarget(studentDists[0]); setResendType(type); return; }
    const msg = type === 'payment' ? generatePaymentMessage(studentDists[0].student_name, studentDists) : generateSelfPurchaseMessage(studentDists[0].student_name, studentDists);
    await navigator.clipboard.writeText(msg);
    toast.success('메시지가 복사되었습니다');
    markBilled(studentDists.map(d => d.id));
  };

  const handleCopyAndOpenKakao = async (studentId: string, type: 'payment' | 'selfpurchase') => {
    const studentDists = distributions.filter(d => d.student_id === studentId && d.payment_status === '미납');
    if (studentDists.length === 0) return;
    const msg = type === 'payment' ? generatePaymentMessage(studentDists[0].student_name, studentDists) : generateSelfPurchaseMessage(studentDists[0].student_name, studentDists);
    await navigator.clipboard.writeText(msg);
    toast.success('문구가 복사되었습니다');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) window.location.href = 'kakaotalk://launch';
    else window.open('https://accounts.kakao.com/login?continue=https://e.kakao.com/', '_blank');
    markBilled(studentDists.map(d => d.id));
  };

  const handleConfirmResend = async () => {
    if (!resendTarget) return;
    const studentDists = distributions.filter(d => d.student_id === resendTarget.student_id && d.payment_status === '미납');
    const msg = resendType === 'payment' ? generatePaymentMessage(studentDists[0]?.student_name || '', studentDists) : generateSelfPurchaseMessage(studentDists[0]?.student_name || '', studentDists);
    await navigator.clipboard.writeText(msg);
    const now = new Date().toISOString();
    await Promise.all(studentDists.map(d => supabase.from('textbook_distributions').update({ message_resent_at: now } as any).eq('id', d.id)));
    toast.success('메시지가 복사되었습니다');
    setResendTarget(null); fetchData();
  };

  const openPaymentConfirm = (dist: Distribution) => {
    setPaymentTarget(dist); setDepositorName(dist.student_name); setParentNameInput(dist.parent_name || '');
  };

  const handleConfirmPayment = async () => {
    if (!paymentTarget) return;
    const { error } = await supabase.from('textbook_distributions').update({
      payment_status: '수납완료', paid_at: new Date().toISOString(), confirmed_by: userName, depositor_name: depositorName.trim() || null,
    } as any).eq('id', paymentTarget.id);
    if (error) { toast.error('수납 처리 실패'); return; }
    if (parentNameInput.trim()) { await supabase.from('students').update({ parent_name: parentNameInput.trim() } as any).eq('id', paymentTarget.student_id); }
    toast.success(`${paymentTarget.student_name} 수납 완료`);
    setPaymentTarget(null); setDepositorName(''); setParentNameInput(''); fetchData();
  };

  const handleSelfPurchase = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({ payment_status: '개별구매', paid_at: new Date().toISOString(), confirmed_by: userName, depositor_name: null } as any).eq('id', dist.id);
    if (error) { toast.error('처리 실패'); return; }
    toast.success(`${dist.student_name} 개별구매 처리`); fetchData();
  };

  const handleRevertPayment = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({ payment_status: '미납', paid_at: null, confirmed_by: null, billed_at: null, depositor_name: null } as any).eq('id', dist.id);
    if (error) toast.error('상태 변경 실패');
    else { toast.success('미납으로 변경'); fetchData(); }
  };

  const handleConfirmDistribution = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({ distributed_confirmed_at: new Date().toISOString(), distributed_confirmed_by: userName } as any).eq('id', dist.id);
    if (error) { toast.error('배부 확인 실패'); }
    else { toast.success(`${dist.student_name} 학생 교재 배부 완료`); fetchData(); }
  };

  // Filtered distributions
  const filteredDistributions = useMemo(() => {
    let filtered = distributions;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(d =>
        d.student_name.toLowerCase().includes(q) ||
        (d.textbook_orders?.textbook_name || '').toLowerCase().includes(q) ||
        (d.distributed_by_name || '').toLowerCase().includes(q)
      );
    }
    if (dateFilter) {
      const dateStr = format(dateFilter, 'yyyy-MM-dd');
      filtered = filtered.filter(d => d.created_at.startsWith(dateStr));
    }
    return filtered;
  }, [distributions, searchQuery, dateFilter]);

  // Stages based on filtered distributions
  const stage1_assigned = useMemo(() => filteredDistributions.filter(d => d.payment_status === '미납' && !d.billed_at), [filteredDistributions]);
  const stage2_billed = useMemo(() => filteredDistributions.filter(d => d.payment_status === '미납' && !!d.billed_at), [filteredDistributions]);
  const stage3_paid = useMemo(() => filteredDistributions.filter(d => d.payment_status === '수납완료' && !d.distributed_confirmed_at), [filteredDistributions]);
  const stage4_distributed = useMemo(() => filteredDistributions.filter(d => (d.payment_status === '수납완료' || d.payment_status === '개별구매') && !!d.distributed_confirmed_at), [filteredDistributions]);
  const selfPurchasePending = useMemo(() => filteredDistributions.filter(d => d.payment_status === '개별구매' && !d.distributed_confirmed_at), [filteredDistributions]);

  const groupByStudent = (list: Distribution[]) => {
    const grouped = new Map<string, { studentName: string; parentName: string | null; dists: Distribution[] }>();
    for (const d of list) {
      if (!grouped.has(d.student_id)) grouped.set(d.student_id, { studentName: d.student_name, parentName: d.parent_name || null, dists: [] });
      grouped.get(d.student_id)!.dists.push(d);
    }
    return Array.from(grouped.values());
  };

  const stage1ByStudent = useMemo(() => groupByStudent(stage1_assigned), [stage1_assigned]);
  const stage2ByStudent = useMemo(() => groupByStudent(stage2_billed), [stage2_billed]);

  const filteredStudents = studentSearch ? students.filter(s => s.name.includes(studentSearch)) : students;

  // Summary stats
  const summaryStats = useMemo(() => ({
    total: distributions.length,
    pending: stage1_assigned.length + stage2_billed.length,
    paid: stage3_paid.length,
    distributed: stage4_distributed.length,
  }), [distributions.length, stage1_assigned.length, stage2_billed.length, stage3_paid.length, stage4_distributed.length]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="전체 배정" value={summaryStats.total} icon={<BookMarked className="w-5 h-5" />} iconColor="primary" />
        <StatCard title="미납/대기" value={summaryStats.pending} icon={<Clock className="w-5 h-5" />} iconColor="warning" />
        <StatCard title="수납 완료" value={summaryStats.paid} icon={<CheckCircle2 className="w-5 h-5" />} iconColor="success" />
        <StatCard title="배부 완료" value={summaryStats.distributed} icon={<Package className="w-5 h-5" />} iconColor="muted" />
      </div>

      {/* Search bar & actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="학생명, 교재명, 담당자 검색..." className="pl-8 pr-8" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </div>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5", dateFilter && "text-primary border-primary")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateFilter ? format(dateFilter, 'MM/dd') : '날짜'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar mode="single" selected={dateFilter} onSelect={(d) => { setDateFilter(d); setDatePopoverOpen(false); }} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(searchQuery || dateFilter) && (
          <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" onClick={() => { setSearchQuery(''); setDateFilter(undefined); }}>
            <X className="w-3 h-3" />초기화
          </Button>
        )}
        <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) { setSelectedStudents([]); setSelectedOrder(''); setDistQty('1'); setStudentSearch(''); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />학생 배정</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>교재 학생 배정</DialogTitle></DialogHeader>
            <DialogDescription className="text-xs">학생용 교재만 배정 가능합니다.</DialogDescription>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">교재 선택 *</label>
                <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {selectedOrder ? (() => { const o = availableOrders.find(o => o.id === selectedOrder); return o ? `${o.textbook_name} [${o.quantity - (o.distributed_qty || 0)}권]` : '교재 선택'; })() : '교재 검색...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="교재명 검색..." />
                      <CommandList><CommandEmpty>결과 없음</CommandEmpty>
                        <CommandGroup>
                          {availableOrders.map(o => {
                            const remaining = o.quantity - (o.distributed_qty || 0);
                            const statusLabel = o.status === '입고완료' ? '✅' : o.status === '주문중' ? '📦' : '📋';
                            return (
                              <CommandItem key={o.id} value={o.textbook_name} onSelect={() => { setSelectedOrder(o.id); setOrderPopoverOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", selectedOrder === o.id ? "opacity-100" : "opacity-0")} />
                                {statusLabel} {o.textbook_name} ({o.unit_price.toLocaleString()}원) [남은 {remaining}권]
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedOrder && (() => {
                  const o = orders.find(o => o.id === selectedOrder);
                  if (o && o.status !== '입고완료') return <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />입고 전 교재입니다. 배정은 가능하지만 배부는 입고 후 가능합니다.</p>;
                  return null;
                })()}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">학생 선택 * <span className="text-xs text-muted-foreground">(복수 선택)</span></label>
                {selectedStudents.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {selectedStudents.map(id => {
                      const s = students.find(s => s.id === id);
                      return <Badge key={id} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleStudent(id)}>{s?.name} ✕</Badge>;
                    })}
                  </div>
                )}
                <Popover open={studentPopoverOpen} onOpenChange={setStudentPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      {selectedStudents.length > 0 ? `${selectedStudents.length}명 선택됨` : '학생 이름 검색...'}
                      <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="학생 이름 검색..." value={studentSearch} onValueChange={setStudentSearch} />
                      <CommandList><CommandEmpty>결과 없음</CommandEmpty>
                        <CommandGroup>
                          {filteredStudents.map(s => (
                            <CommandItem key={s.id} value={s.name} onSelect={() => toggleStudent(s.id)}>
                              <Checkbox checked={selectedStudents.includes(s.id)} className="mr-2" />{s.name}
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
                <div className="p-3 rounded-md bg-muted/50 space-y-1">
                  <p className="text-sm font-medium text-foreground">{selectedStudents.length}명 × {distQty}권 = 총 {selectedStudents.length * (parseInt(distQty) || 1)}권</p>
                  <p className="text-sm text-muted-foreground">1인당(10%할인): {Math.round((orders.find(o => o.id === selectedOrder)?.unit_price || 0) * 0.9 * (parseInt(distQty) || 1)).toLocaleString()}원</p>
                </div>
              )}
              <Button onClick={handleAssign} disabled={creating} className="w-full">
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {selectedStudents.length > 1 ? `${selectedStudents.length}명 배정` : '배정 등록'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stage sections with Accordion */}
      <Accordion type="multiple" defaultValue={['stage1', 'stage2', 'stage3']} className="space-y-3">
        {/* Stage 1: 배정 완료 */}
        {stage1ByStudent.length > 0 && (
          <AccordionItem value="stage1" className="border rounded-xl overflow-hidden border-l-4 border-l-blue-400">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-sm">① 배정 완료 · 안내문자 대기</span>
                <Badge variant="secondary" className="text-[10px]">{stage1_assigned.length}건</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 space-y-2">
              {stage1ByStudent.map(group => {
                const totalAmount = group.dists.reduce((sum, d) => sum + d.total_amount, 0);
                return (
                  <Card key={group.studentName + '-s1'} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-foreground">{group.studentName}</p>
                          {group.parentName && <span className="text-xs text-muted-foreground">({group.parentName})</span>}
                          <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300">배정완료</Badge>
                        </div>
                        {group.dists.map(dist => (
                          <div key={dist.id} className="flex items-center justify-between mt-1">
                            <p className="text-xs text-muted-foreground">· {dist.textbook_orders?.textbook_name} · {dist.quantity}권 · {dist.total_amount.toLocaleString()}원</p>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive/60 hover:text-destructive" onClick={() => handleCancelDistribution(dist)} title="배정 취소">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        {group.dists.length > 1 && <p className="text-xs font-medium text-foreground mt-1">합계: {totalAmount.toLocaleString()}원</p>}
                        <p className="text-[11px] text-muted-foreground mt-1">배정일: {format(new Date(group.dists[0].created_at), 'yyyy-MM-dd')} · {group.dists[0].distributed_by_name}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => handleSendMessage(group.dists[0].student_id, 'payment')}><Send className="w-3 h-3" />안내문자</Button>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-muted-foreground" onClick={() => handleSendMessage(group.dists[0].student_id, 'selfpurchase')}><ShoppingCart className="w-3 h-3" />개별구매</Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Stage 2: 청구 완료 */}
        {stage2ByStudent.length > 0 && (
          <AccordionItem value="stage2" className="border rounded-xl overflow-hidden border-l-4 border-l-yellow-400">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                <span className="font-semibold text-sm">② 청구 완료 · 수납 대기</span>
                <Badge variant="secondary" className="text-[10px]">{stage2_billed.length}건</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 space-y-2">
              {stage2ByStudent.map(group => {
                const totalAmount = group.dists.reduce((sum, d) => sum + d.total_amount, 0);
                return (
                  <Card key={group.studentName + '-s2'} className="p-3 bg-yellow-50/40 dark:bg-yellow-950/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-foreground">{group.studentName}</p>
                          <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-yellow-300">수납대기</Badge>
                          <span className="text-sm font-medium text-destructive">{totalAmount.toLocaleString()}원</span>
                        </div>
                        {group.dists.map(dist => (
                          <div key={dist.id} className="flex items-center justify-between mt-1.5">
                            <p className="text-xs text-muted-foreground">· {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원</p>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-0.5 text-orange-600" onClick={() => handleSelfPurchase(dist)}><ShoppingBag className="w-3 h-3" />개별구매</Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-0.5 text-green-600" onClick={() => openPaymentConfirm(dist)}><CheckCircle2 className="w-3 h-3" />수납</Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive/60" onClick={() => handleCancelDistribution(dist)} title="취소"><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2"><Copy className="w-3 h-3" />재전송<ChevronDown className="w-3 h-3" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleSendMessage(group.dists[0].student_id, 'payment')} className="text-xs gap-2"><Send className="w-3.5 h-3.5" />수납 안내</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyAndOpenKakao(group.dists[0].student_id, 'payment')} className="text-xs gap-2"><MessageCircle className="w-3.5 h-3.5" />카톡 열기</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Stage 3: 수납 완료 · 배부 대기 */}
        {(stage3_paid.length > 0 || selfPurchasePending.length > 0) && (
          <AccordionItem value="stage3" className="border rounded-xl overflow-hidden border-l-4 border-l-primary/60">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">③ 수납 완료 · 배부 대기</span>
                <Badge variant="secondary" className="text-[10px]">{stage3_paid.length + selfPurchasePending.length}건</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 space-y-2">
              {[...stage3_paid, ...selfPurchasePending].map(dist => (
                <Card key={dist.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm text-foreground">{dist.student_name}</p>
                        <Badge className={cn("text-[10px]", dist.payment_status === '개별구매' ? 'border-orange-400 text-orange-600 bg-orange-50' : 'bg-primary/15 text-primary border-primary/30')}>
                          {dist.payment_status === '개별구매' ? '개별구매' : '수납완료'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{dist.textbook_orders?.textbook_name} · {dist.quantity}권 · {dist.total_amount.toLocaleString()}원</p>
                      {dist.paid_at && <p className="text-[11px] text-muted-foreground mt-0.5">{dist.payment_status === '수납완료' ? '수납' : '처리'}: {format(new Date(dist.paid_at), 'MM/dd')}{dist.confirmed_by && ` · ${dist.confirmed_by}`}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => handleConfirmDistribution(dist)}><CheckCircle2 className="w-3 h-3" />교재배부</Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleRevertPayment(dist)} title="미납으로"><span className="text-xs">↩</span></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Stage 4: 배부 완료 */}
        {stage4_distributed.length > 0 && (
          <AccordionItem value="stage4" className="border rounded-xl overflow-hidden border-l-4 border-l-emerald-400">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="font-semibold text-sm">④ 배부 완료</span>
                <Badge variant="secondary" className="text-[10px]">{stage4_distributed.length}건</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 space-y-1.5">
              {stage4_distributed.map(dist => (
                <div key={dist.id} className="flex items-center gap-2 flex-wrap py-1.5 px-3 rounded-lg bg-muted/30 text-sm">
                  <p className="font-medium text-foreground">{dist.student_name}</p>
                  <Badge variant="outline" className="text-[10px] border-green-400 text-green-600">완료</Badge>
                  <span className="text-xs text-muted-foreground">{dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원</span>
                  <span className="text-xs text-muted-foreground ml-auto">{dist.distributed_confirmed_by} · {dist.distributed_confirmed_at ? format(new Date(dist.distributed_confirmed_at), 'MM/dd') : ''}</span>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      {distributions.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">배정 기록이 없습니다</p>}

      {/* Dialogs */}
      <Dialog open={!!resendTarget} onOpenChange={(open) => !open && setResendTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>메시지 재전송</DialogTitle><DialogDescription>{resendTarget?.student_name} 학생에게 메시지를 재전송하시겠습니까?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setResendTarget(null)}>취소</Button><Button onClick={handleConfirmResend}>재전송</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentTarget} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>입금 확인</DialogTitle><DialogDescription>{paymentTarget?.student_name} 학생의 교재비 수납 처리</DialogDescription></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="text-muted-foreground">교재: <span className="font-medium text-foreground">{paymentTarget?.textbook_orders?.textbook_name}</span></p>
              <p className="text-muted-foreground">금액: <span className="font-medium text-foreground">{paymentTarget?.total_amount?.toLocaleString()}원</span></p>
            </div>
            <div><label className="text-sm font-medium text-foreground">입금자명</label><Input value={depositorName} onChange={(e) => setDepositorName(e.target.value)} placeholder="입금자 이름" className="mt-1" /></div>
            <div><label className="text-sm font-medium text-foreground">학부모 성함 (선택)</label><Input value={parentNameInput} onChange={(e) => setParentNameInput(e.target.value)} placeholder="학부모 이름" className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentTarget(null)}>취소</Button><Button onClick={handleConfirmPayment}>수납 확인</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
