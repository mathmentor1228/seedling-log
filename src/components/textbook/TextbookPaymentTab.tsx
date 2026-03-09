import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Ban, Copy, Clock, MessageCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const ACCOUNT_INFO = '카카오 3333156191775 최윤기';

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
  created_at: string;
  depositor_name: string | null;
  textbook_orders?: { textbook_name: string; unit_price: number; subject: string } | null;
  parent_phone?: string | null;
  parent_name?: string | null;
}

export function TextbookPaymentTab() {
  const { user } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => format(new Date(), 'yyyy-MM'));

  // Depositor name popup state
  const [paymentTarget, setPaymentTarget] = useState<Distribution | null>(null);
  const [depositorName, setDepositorName] = useState('');
  const [parentNameInput, setParentNameInput] = useState('');

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('textbook_distributions')
      .select('*, textbook_orders(textbook_name, unit_price, subject)')
      .order('created_at', { ascending: false });
    if (error) { toast.error('수납 목록 로드 실패'); setLoading(false); return; }

    const dists = (data as any[]) || [];

    const studentIds = [...new Set(dists.map(d => d.student_id))];
    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from('students')
        .select('id, parent_phone, parent_name')
        .in('id', studentIds);
      const studentMap = new Map((students || []).map((s: any) => [s.id, { parent_phone: s.parent_phone, parent_name: s.parent_name }]));
      dists.forEach(d => {
        const info = studentMap.get(d.student_id);
        d.parent_phone = info?.parent_phone || null;
        d.parent_name = info?.parent_name || null;
      });
    }

    setDistributions(dists);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Generate combined message for a student (all unpaid items)
  const generateCombinedMessage = (studentName: string, studentDists: Distribution[]) => {
    // Get parent name for deposit guidance
    const parentName = studentDists[0]?.parent_name;
    const depositGuidance = parentName && parentName !== studentName
      ? `\n입금 시 "${studentName}" 또는 "${parentName}"으로 입금 부탁드립니다.`
      : `\n입금 시 "${studentName}" 이름으로 입금 부탁드립니다.`;

    if (studentDists.length === 1) {
      const dist = studentDists[0];
      const bookName = dist.textbook_orders?.textbook_name || '교재';
      const subject = dist.textbook_orders?.subject || '수학';
      return `더멘토학원 교재안내\n\n${studentName} 학생 ${subject} 교재 구매 안내\n\n1. 교재명 : ${bookName}\n2. 교재가격 : ${dist.total_amount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
    }

    // Multiple textbooks
    const totalAmount = studentDists.reduce((sum, d) => sum + d.total_amount, 0);
    const itemList = studentDists.map((d, i) => {
      const bookName = d.textbook_orders?.textbook_name || '교재';
      const subject = d.textbook_orders?.subject || '';
      return `${i + 1}. ${subject ? `[${subject}] ` : ''}${bookName} : ${d.total_amount.toLocaleString()}원`;
    }).join('\n');

    return `더멘토학원 교재안내\n\n${studentName} 학생 교재 구매 안내\n\n${itemList}\n\n합계 : ${totalAmount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
  };

  const markBilled = async (distIds: string[]) => {
    const now = new Date().toISOString();
    for (const id of distIds) {
      await supabase.from('textbook_distributions').update({
        billed_at: now,
      } as any).eq('id', id);
    }
    setDistributions(prev => prev.map(d =>
      distIds.includes(d.id) ? { ...d, billed_at: now } : d
    ));
  };

  const handleCopyStudentMessage = async (studentName: string, studentDists: Distribution[]) => {
    const msg = generateCombinedMessage(studentName, studentDists);
    await navigator.clipboard.writeText(msg);
    toast.success(`${studentName} 카톡 문구가 복사되었습니다`);
    markBilled(studentDists.map(d => d.id));
  };

  const handleCopyAndOpenKakao = async (studentName: string, studentDists: Distribution[]) => {
    const msg = generateCombinedMessage(studentName, studentDists);
    await navigator.clipboard.writeText(msg);
    toast.success('문구가 복사되었습니다. 카카오톡에서 붙여넣기 해주세요!');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = 'kakaotalk://launch';
    } else {
      window.open('https://accounts.kakao.com/login?continue=https://e.kakao.com/', '_blank');
    }
    markBilled(studentDists.map(d => d.id));
  };

  // Open depositor name popup instead of directly confirming
  const openPaymentConfirm = (dist: Distribution) => {
    setPaymentTarget(dist);
    // 기본값: 학생이름으로 입금자명 설정, 학부모 이름이 다르면 별도 표시
    setDepositorName(dist.student_name);
    setParentNameInput(dist.parent_name || '');
  };

  const handleConfirmPayment = async () => {
    if (!paymentTarget) return;
    const { error } = await supabase.from('textbook_distributions').update({
      payment_status: '수납완료',
      paid_at: new Date().toISOString(),
      confirmed_by: userName,
      depositor_name: depositorName.trim() || null,
    } as any).eq('id', paymentTarget.id);
    if (error) { toast.error('수납 처리 실패'); return; }

    // Sync parent_name to students table if provided
    const trimmedParent = parentNameInput.trim();
    if (trimmedParent) {
      await supabase.from('students').update({ parent_name: trimmedParent } as any).eq('id', paymentTarget.student_id);
    }

    toast.success(`${paymentTarget.student_name} 수납 완료 처리되었습니다`);
    setPaymentTarget(null);
    setDepositorName('');
    setParentNameInput('');
    fetchData();
  };

  const handleRevertPayment = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({
      payment_status: '미납',
      paid_at: null,
      confirmed_by: null,
      billed_at: null,
      depositor_name: null,
    } as any).eq('id', dist.id);
    if (error) toast.error('상태 변경 실패');
    else { toast.success('미납으로 변경되었습니다'); fetchData(); }
  };

  // Monthly stats
  const monthlyStats = useMemo(() => {
    const [y, m] = monthFilter.split('-').map(Number);
    const start = startOfMonth(new Date(y, m - 1));
    const end = endOfMonth(new Date(y, m - 1));

    const monthlyDists = distributions.filter(d => {
      const dt = new Date(d.created_at);
      return dt >= start && dt <= end;
    });

    const totalBilled = monthlyDists.reduce((s, d) => s + d.total_amount, 0);
    const totalPaid = monthlyDists.filter(d => d.payment_status === '수납완료').reduce((s, d) => s + d.total_amount, 0);
    const totalUnpaid = totalBilled - totalPaid;

    return { totalBilled, totalPaid, totalUnpaid, count: monthlyDists.length };
  }, [distributions, monthFilter]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(format(d, 'yyyy-MM'));
    }
    return opts;
  }, []);

  // Group unpaid by student
  const unpaidByStudent = useMemo(() => {
    const unpaid = distributions.filter(d => d.payment_status === '미납');
    const grouped = new Map<string, { studentName: string; parentName: string | null; dists: Distribution[] }>();
    for (const d of unpaid) {
      if (!grouped.has(d.student_id)) {
        grouped.set(d.student_id, { studentName: d.student_name, parentName: d.parent_name || null, dists: [] });
      }
      grouped.get(d.student_id)!.dists.push(d);
    }
    return Array.from(grouped.values());
  }, [distributions]);

  const totalUnpaidCount = unpaidByStudent.reduce((s, g) => s + g.dists.length, 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Month filter & stats */}
      <div className="flex items-center gap-3">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => (
              <SelectItem key={m} value={m}>{m.replace('-', '년 ')}월</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="text-xl font-bold text-foreground">{monthlyStats.totalBilled.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">총 청구액</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold text-green-600">{monthlyStats.totalPaid.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">수납 완료</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold text-destructive">{monthlyStats.totalUnpaid.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">미납액</p>
        </Card>
      </div>

      {/* Unpaid list - grouped by student */}
      {unpaidByStudent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">미납 목록 ({totalUnpaidCount}건 · {unpaidByStudent.length}명)</h3>
          <div className="space-y-3">
            {unpaidByStudent.map(group => {
              const allBilled = group.dists.every(d => !!d.billed_at);
              const totalAmount = group.dists.reduce((s, d) => s + d.total_amount, 0);
              const latestBilledAt = group.dists
                .filter(d => d.billed_at)
                .sort((a, b) => (b.billed_at || '').localeCompare(a.billed_at || ''))[0]?.billed_at;

              return (
                <Card
                  key={group.studentName}
                  className={`p-4 border-l-4 transition-colors ${
                    allBilled
                      ? 'border-l-yellow-400 bg-yellow-50/60 dark:bg-yellow-950/20'
                      : 'border-l-destructive/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground">{group.studentName}</p>
                        {group.parentName && (
                          <span className="text-xs text-muted-foreground">(학부모: {group.parentName})</span>
                        )}
                        {allBilled ? (
                          <Badge className="text-[10px] bg-yellow-500 text-white border-yellow-500">
                            <Clock className="w-2.5 h-2.5 mr-0.5" />청구 완료
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">미납</Badge>
                        )}
                        {group.dists.length > 1 && (
                          <Badge variant="outline" className="text-[10px]">{group.dists.length}건</Badge>
                        )}
                      </div>

                      {/* List individual textbooks */}
                      {group.dists.map(dist => (
                        <div key={dist.id} className="flex items-center justify-between mt-1.5">
                          <p className="text-sm text-muted-foreground">
                            {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-green-600 hover:text-green-700"
                            onClick={() => openPaymentConfirm(dist)}
                          >
                            <CheckCircle2 className="w-3 h-3" />수납
                          </Button>
                        </div>
                      ))}

                      {group.dists.length > 1 && (
                        <p className="text-sm font-medium text-foreground mt-1.5">
                          합계: {totalAmount.toLocaleString()}원
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground mt-1">
                        배부일: {format(new Date(group.dists[0].created_at), 'yyyy-MM-dd')}
                      </p>
                      {latestBilledAt && (
                        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                          📨 청구: {format(new Date(latestBilledAt), 'MM/dd HH:mm')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="gap-1 text-xs px-2" onClick={() => handleCopyStudentMessage(group.studentName, group.dists)} title="문구 복사">
                          <Copy className="w-3 h-3" />복사
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-xs px-2 text-yellow-700 border-yellow-300 hover:bg-yellow-50" onClick={() => handleCopyAndOpenKakao(group.studentName, group.dists)} title="복사 후 카카오톡 열기">
                          <MessageCircle className="w-3 h-3" />카톡
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* All distributions */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">전체 이력</h3>
        <div className="space-y-2">
          {distributions.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">수납 이력이 없습니다</p>
          )}
          {distributions.map(dist => (
            <Card key={dist.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <p className="font-medium text-sm text-foreground">{dist.student_name}</p>
                  {dist.parent_name && (
                    <span className="text-xs text-muted-foreground">{dist.parent_name}</span>
                  )}
                  {dist.depositor_name && (
                    <span className="text-xs font-bold text-primary">[입금: {dist.depositor_name}]</span>
                  )}
                  <Badge variant={dist.payment_status === '수납완료' ? 'success' : 'destructive'} className="text-[10px]">
                    {dist.payment_status}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">
                    {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <span>{format(new Date(dist.created_at), 'MM/dd')}</span>
                  {dist.payment_status === '수납완료' && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleRevertPayment(dist)} title="미납으로 변경">
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Depositor name confirmation dialog */}
      <Dialog open={!!paymentTarget} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>입금 확인</DialogTitle>
            <DialogDescription>
              {paymentTarget?.student_name} 학생의 교재비 수납을 처리합니다.
              실제 입금자 성함을 확인해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">학부모 성함</label>
              <Input
                value={parentNameInput}
                onChange={(e) => setParentNameInput(e.target.value)}
                placeholder="학부모 이름 (학생정보에 저장됩니다)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                입력하면 학생 정보에도 자동 반영됩니다
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">실제 입금자 성함</label>
              <Input
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                placeholder="입금자 이름"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                통장에 표시된 입금자명을 입력해주세요
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>취소</Button>
            <Button onClick={handleConfirmPayment}>수납 확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}