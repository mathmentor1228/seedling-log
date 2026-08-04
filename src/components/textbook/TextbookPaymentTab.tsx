import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Ban, Copy, Clock, MessageCircle, ChevronDown, BookOpen, Send, ShoppingBag } from 'lucide-react';
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
  textbook_orders?: { textbook_name: string; unit_price: number; subject: string; is_inhouse?: boolean | null; inhouse_author?: string | null } | null;
  parent_phone?: string | null;
  parent_name?: string | null;
}

export function TextbookPaymentTab() {
  const { user } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => format(new Date(), 'yyyy-MM'));
  const [searchQuery, setSearchQuery] = useState('');
  // 자체제작 교재 청구건만 따로 솔팅하기 위한 필터
  const [inhouseFilter, setInhouseFilter] = useState<string>('all'); // all | inhouse | external | author:<name>

  // Depositor name popup state
  const [paymentTarget, setPaymentTarget] = useState<Distribution | null>(null);
  const [depositorName, setDepositorName] = useState('');
  const [parentNameInput, setParentNameInput] = useState('');

  // AlimTalk send state
  const [alimtalkConfirm, setAlimtalkConfirm] = useState<{
    mode: 'before' | 'after';
    groups: { studentId: string; studentName: string; parentPhone: string | null; dists: Distribution[] }[];
  } | null>(null);
  const [sendingAlimtalk, setSendingAlimtalk] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('textbook_distributions')
      .select('*, textbook_orders(textbook_name, unit_price, subject, is_inhouse, inhouse_author)')
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
  // mode: 'before' = 배포 전 (입금 후 배부 예정), 'after' = 배포 후 (이미 배부 완료)
  const generateCombinedMessage = (studentName: string, studentDists: Distribution[], mode: 'before' | 'after' = 'before') => {
    // Get parent name for deposit guidance
    const parentName = studentDists[0]?.parent_name;
    const depositGuidance = parentName && parentName !== studentName
      ? `\n입금 시 "${studentName}" 또는 "${parentName}"으로 입금 부탁드립니다.`
      : `\n입금 시 "${studentName}" 이름으로 입금 부탁드립니다.`;

    const closingBefore = `입금 확인되는대로 아이에게 교재 배부 예정입니다.\n가정에서 개별 구매 원하실 경우 개별 구매 하신다고 답장해주시면 됩니다^^\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다. 안내된 계좌로 입금 부탁드립니다.`;
    const closingAfter = `교재는 이미 아이에게 배부 완료되었습니다.\n확인 후 아래 계좌로 입금 부탁드립니다.\n\n본래 교재는 개별적으로 가정에서 구매해주셔야 하나 편의상 원에서 제공하고 있습니다. 따라서 원비와 함께 결제가 어려운 점 양해 부탁드립니다.`;
    const closing = mode === 'after' ? closingAfter : closingBefore;

    if (studentDists.length === 1) {
      const dist = studentDists[0];
      const bookName = dist.textbook_orders?.textbook_name || '교재';
      const subject = dist.textbook_orders?.subject || '수학';
      return `더멘토학원 교재안내\n\n${studentName} 학생 ${subject} 교재 구매 안내\n\n1. 교재명 : ${bookName}\n2. 교재가격 : ${dist.total_amount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n${closing}`;
    }

    // Multiple textbooks
    const totalAmount = studentDists.reduce((sum, d) => sum + d.total_amount, 0);
    const itemList = studentDists.map((d, i) => {
      const bookName = d.textbook_orders?.textbook_name || '교재';
      const subject = d.textbook_orders?.subject || '';
      return `${i + 1}. ${subject ? `[${subject}] ` : ''}${bookName} : ${d.total_amount.toLocaleString()}원`;
    }).join('\n');

    return `더멘토학원 교재안내\n\n${studentName} 학생 교재 구매 안내\n\n${itemList}\n\n합계 : ${totalAmount.toLocaleString()}원\n\n*계좌안내\n${ACCOUNT_INFO}${depositGuidance}\n\n${closing}`;
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

  const handleCopyStudentMessage = async (studentName: string, studentDists: Distribution[], mode: 'before' | 'after' = 'before') => {
    const msg = generateCombinedMessage(studentName, studentDists, mode);
    await navigator.clipboard.writeText(msg);
    toast.success(`${studentName} ${mode === 'after' ? '배포후' : '배포전'} 문구가 복사되었습니다`);
    markBilled(studentDists.map(d => d.id));
  };

  const handleCopyAndOpenKakao = async (studentName: string, studentDists: Distribution[], mode: 'before' | 'after' = 'before') => {
    const msg = generateCombinedMessage(studentName, studentDists, mode);
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

  const handleSelfPurchase = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({
      payment_status: '개별구매',
      paid_at: new Date().toISOString(),
      confirmed_by: userName,
      depositor_name: null,
    } as any).eq('id', dist.id);
    if (error) { toast.error('처리 실패'); return; }
    toast.success(`${dist.student_name} 개별구매 처리되었습니다`);
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

  // 자체제작 필터 매칭 (all / inhouse / external / author:<선생님>)
  const matchesInhouse = useCallback((d: Distribution) => {
    const o = d.textbook_orders;
    if (inhouseFilter === 'all') return true;
    if (inhouseFilter === 'inhouse') return !!o?.is_inhouse;
    if (inhouseFilter === 'external') return !o?.is_inhouse;
    if (inhouseFilter.startsWith('author:')) return !!o?.is_inhouse && o?.inhouse_author === inhouseFilter.slice(7);
    return true;
  }, [inhouseFilter]);

  const inhouseAuthors = useMemo(
    () => [...new Set(distributions.map(d => d.textbook_orders?.inhouse_author).filter(Boolean) as string[])],
    [distributions],
  );

  // 선택 월 범위 (미납은 다음 달로 이월되어 계속 잡힘)
  const monthRange = useMemo(() => {
    const [y, m] = monthFilter.split('-').map(Number);
    return { start: startOfMonth(new Date(y, m - 1)), end: endOfMonth(new Date(y, m - 1)) };
  }, [monthFilter]);

  // 이월 여부: 이전 달에 배부됐지만 아직 미납인 건
  const isCarryOver = useCallback((d: Distribution) => (
    d.payment_status === '미납' && new Date(d.created_at) < monthRange.start
  ), [monthRange]);

  // Monthly stats (당월 배부분 + 이전 달에서 이월된 미납분)
  const monthlyStats = useMemo(() => {
    const { start, end } = monthRange;

    const monthlyDists = distributions.filter(d => {
      if (!matchesInhouse(d)) return false;
      const dt = new Date(d.created_at);
      if (dt >= start && dt <= end) return true;
      // 이전 달 미납 건은 이번 달로 이월
      return dt < start && d.payment_status === '미납';
    });

    const carryOverDists = monthlyDists.filter(isCarryOver);
    const selfPurchaseAmount = monthlyDists.filter(d => d.payment_status === '개별구매').reduce((s, d) => s + d.total_amount, 0);
    const totalBilled = monthlyDists.reduce((s, d) => s + d.total_amount, 0) - selfPurchaseAmount;
    const totalPaid = monthlyDists.filter(d => d.payment_status === '수납완료').reduce((s, d) => s + d.total_amount, 0);
    const totalUnpaid = totalBilled - totalPaid;
    const carryOverAmount = carryOverDists.reduce((s, d) => s + d.total_amount, 0);
    const inhouseBilled = monthlyDists.filter(d => d.textbook_orders?.is_inhouse && d.payment_status !== '개별구매')
      .reduce((s, d) => s + d.total_amount, 0);

    return { totalBilled, totalPaid, totalUnpaid, carryOverAmount, carryOverCount: carryOverDists.length, inhouseBilled, count: monthlyDists.length };
  }, [distributions, monthRange, inhouseFilter, matchesInhouse, isCarryOver]);


  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(format(d, 'yyyy-MM'));
    }
    return opts;
  }, []);

  // Filter distributions by search query + 자체제작 필터
  const filteredDistributions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return distributions.filter(d => {
      if (!matchesInhouse(d)) return false;
      if (!q) return true;
      return d.student_name.toLowerCase().includes(q) ||
        (d.textbook_orders?.textbook_name || '').toLowerCase().includes(q) ||
        (d.distributed_by_name || '').toLowerCase().includes(q) ||
        (d.depositor_name || '').toLowerCase().includes(q) ||
        (d.parent_name || '').toLowerCase().includes(q);
    });
  }, [distributions, searchQuery, matchesInhouse]);

  // Group unpaid by student (선택 월까지 배부된 미납 건 = 당월분 + 이월분)
  const unpaidByStudent = useMemo(() => {
    const unpaid = filteredDistributions.filter(d =>
      d.payment_status === '미납' && new Date(d.created_at) <= monthRange.end,
    );
    const grouped = new Map<string, { studentId: string; studentName: string; parentName: string | null; parentPhone: string | null; dists: Distribution[] }>();
    for (const d of unpaid) {
      if (!grouped.has(d.student_id)) {
        grouped.set(d.student_id, { studentId: d.student_id, studentName: d.student_name, parentName: d.parent_name || null, parentPhone: d.parent_phone || null, dists: [] });
      }
      grouped.get(d.student_id)!.dists.push(d);
    }
    return Array.from(grouped.values());
  }, [filteredDistributions, monthRange]);


  // Batch target: students with at least one un-billed unpaid item (최초 청구 대상)
  const batchTargets = useMemo(
    () => unpaidByStudent.filter(g => g.dists.some(d => !d.billed_at)),
    [unpaidByStudent],
  );

  const openBatchAlimtalk = (mode: 'before' | 'after') => {
    if (batchTargets.length === 0) { toast.info('청구할 미납 건이 없습니다 (전부 청구 완료 상태)'); return; }
    setAlimtalkConfirm({ mode, groups: batchTargets });
  };

  const handleSendAlimtalk = async () => {
    if (!alimtalkConfirm || sendingAlimtalk) return;
    const sendable = alimtalkConfirm.groups.filter(g => g.parentPhone);
    if (sendable.length === 0) { toast.error('발송 가능한 학부모 연락처가 없습니다'); return; }
    setSendingAlimtalk(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-textbook-bill', {
        body: {
          mode: alimtalkConfirm.mode,
          targets: sendable.map(g => ({ student_id: g.studentId, dist_ids: g.dists.map(d => d.id) })),
        },
      });
      if (error) throw error;
      if (data?.error === 'not_configured') {
        toast.error(`알림톡 연동 설정이 아직 완료되지 않았습니다. Supabase에 다음 키를 등록해주세요: ${data.missing.join(', ')}`, { duration: 8000 });
        return;
      }
      if (data?.error) { toast.error(`발송 실패: ${data.error}`); return; }
      const failures = (data?.results || []).filter((r: any) => !r.ok);
      if (data?.sent > 0) toast.success(`알림톡 ${data.sent}명 발송 완료`);
      if (failures.length > 0) {
        toast.error(`${failures.length}명 발송 안 됨: ${failures.map((f: any) => `${f.student_name}(${f.reason})`).join(', ')}`, { duration: 8000 });
      }
      setAlimtalkConfirm(null);
      fetchData();
    } catch (e: any) {
      toast.error(`알림톡 발송 중 오류: ${e.message || e}`);
    } finally {
      setSendingAlimtalk(false);
    }
  };

  const totalUnpaidCount = unpaidByStudent.reduce((s, g) => s + g.dists.length, 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Month filter & stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => (
              <SelectItem key={m} value={m}>{m.replace('-', '년 ')}월</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="학생/교재/담당자 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-48"
        />
        <Select value={inhouseFilter} onValueChange={setInhouseFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="교재 구분" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 교재</SelectItem>
            <SelectItem value="inhouse">자체제작 교재만</SelectItem>
            <SelectItem value="external">외부 교재만</SelectItem>
            {inhouseAuthors.map(a => (
              <SelectItem key={a} value={`author:${a}`}>자체제작 · {a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {inhouseFilter !== 'all' && (
          <Badge className="bg-violet-100 text-violet-700 border-violet-300">
            {inhouseFilter === 'external' ? '외부 교재' : inhouseFilter.startsWith('author:') ? `자체제작 · ${inhouseFilter.slice(7)}` : '자체제작'} 필터 적용중
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
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
        <Card className="p-4 text-center border-violet-300">
          <p className="text-xl font-bold text-violet-600">{monthlyStats.inhouseBilled.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">자체제작 교재 청구액</p>
        </Card>
      </div>


      {/* Unpaid list - grouped by student */}
      {unpaidByStudent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-foreground">미납 목록 ({totalUnpaidCount}건 · {unpaidByStudent.length}명)</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1 text-xs bg-yellow-500 hover:bg-yellow-600 text-white">
                  <MessageCircle className="w-3.5 h-3.5" />알림톡 일괄 발송
                  {batchTargets.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1 bg-white/20 text-white">{batchTargets.length}명</Badge>}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => openBatchAlimtalk('before')} className="text-xs gap-2">
                  <BookOpen className="w-3.5 h-3.5" />배포 전 (배부 예정)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBatchAlimtalk('after')} className="text-xs gap-2">
                  <Send className="w-3.5 h-3.5" />배포 후 (배부 완료)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원
                            {dist.textbook_orders?.is_inhouse && (
                              <Badge className="text-[10px] bg-violet-100 text-violet-700 border-violet-300">자체제작{dist.textbook_orders?.inhouse_author ? ` · ${dist.textbook_orders.inhouse_author}` : ''}</Badge>
                            )}
                          </p>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-orange-600 hover:text-orange-700"
                              onClick={() => handleSelfPurchase(dist)}
                            >
                              <ShoppingBag className="w-3 h-3" />개별구매
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-green-600 hover:text-green-700"
                              onClick={() => openPaymentConfirm(dist)}
                            >
                              <CheckCircle2 className="w-3 h-3" />수납
                            </Button>
                          </div>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" className="gap-1 text-xs px-2 bg-yellow-500 hover:bg-yellow-600 text-white" disabled={!group.parentPhone} title={group.parentPhone ? '' : '학부모 연락처가 없습니다'}>
                            <Send className="w-3 h-3" />알림톡<ChevronDown className="w-3 h-3 ml-0.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setAlimtalkConfirm({ mode: 'before', groups: [group] })} className="text-xs gap-2">
                            <BookOpen className="w-3.5 h-3.5" />배포 전 (배부 예정)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAlimtalkConfirm({ mode: 'after', groups: [group] })} className="text-xs gap-2">
                            <Send className="w-3.5 h-3.5" />배포 후 (배부 완료)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1 text-xs px-2">
                            <Copy className="w-3 h-3" />복사<ChevronDown className="w-3 h-3 ml-0.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleCopyStudentMessage(group.studentName, group.dists, 'before')} className="text-xs gap-2">
                            <BookOpen className="w-3.5 h-3.5" />배포 전 (배부 예정)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyStudentMessage(group.studentName, group.dists, 'after')} className="text-xs gap-2">
                            <Send className="w-3.5 h-3.5" />배포 후 (배부 완료)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1 text-xs px-2 text-yellow-700 border-yellow-300 hover:bg-yellow-50">
                            <MessageCircle className="w-3 h-3" />카톡<ChevronDown className="w-3 h-3 ml-0.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleCopyAndOpenKakao(group.studentName, group.dists, 'before')} className="text-xs gap-2">
                            <BookOpen className="w-3.5 h-3.5" />배포 전 (배부 예정)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyAndOpenKakao(group.studentName, group.dists, 'after')} className="text-xs gap-2">
                            <Send className="w-3.5 h-3.5" />배포 후 (배부 완료)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
          {filteredDistributions.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">{searchQuery ? '검색 결과가 없습니다' : '수납 이력이 없습니다'}</p>
          )}
          {filteredDistributions.map(dist => (
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
                  <Badge 
                    variant={dist.payment_status === '수납완료' ? 'success' : dist.payment_status === '개별구매' ? 'outline' : 'destructive'} 
                    className={`text-[10px] ${dist.payment_status === '개별구매' ? 'border-orange-400 text-orange-600' : ''}`}
                  >
                    {dist.payment_status}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">
                    {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원
                  </span>
                  {dist.textbook_orders?.is_inhouse && (
                    <Badge className="text-[10px] shrink-0 bg-violet-100 text-violet-700 border-violet-300">자체제작</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <span>{format(new Date(dist.created_at), 'MM/dd')}</span>
                  {(dist.payment_status === '수납완료' || dist.payment_status === '개별구매') && (
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
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="text-muted-foreground">학생: <span className="font-medium text-foreground">{paymentTarget?.student_name}</span></p>
              <p className="text-muted-foreground">금액: <span className="font-medium text-foreground">{paymentTarget?.total_amount?.toLocaleString()}원</span></p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">입금자명</label>
              <Input
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                placeholder="입금자 이름 (기본: 학생이름)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                학생이름과 다를 경우에만 수정해주세요
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">학부모 성함 (선택)</label>
              <Input
                value={parentNameInput}
                onChange={(e) => setParentNameInput(e.target.value)}
                placeholder="학부모 이름 (학생정보에 자동 저장)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                입력하면 학생 정보에 학부모 이름이 자동 연동됩니다
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>취소</Button>
            <Button onClick={handleConfirmPayment}>수납 확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlimTalk send confirmation dialog */}
      <Dialog open={!!alimtalkConfirm} onOpenChange={(open) => !open && !sendingAlimtalk && setAlimtalkConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>교재비 알림톡 발송</DialogTitle>
            <DialogDescription>
              {alimtalkConfirm?.mode === 'after' ? '배포 후(배부 완료)' : '배포 전(배부 예정)'} 안내를 학부모 카카오톡으로 발송합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
            {alimtalkConfirm?.groups.map(g => {
              const total = g.dists.reduce((s, d) => s + d.total_amount, 0);
              return (
                <div key={g.studentId} className={`flex items-center justify-between text-sm p-2 rounded-md ${g.parentPhone ? 'bg-muted/50' : 'bg-destructive/10'}`}>
                  <span className="font-medium">{g.studentName}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.dists.length}건 · {total.toLocaleString()}원
                    {!g.parentPhone && <span className="text-destructive font-medium ml-2">연락처 없음 — 제외됨</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlimtalkConfirm(null)} disabled={sendingAlimtalk}>취소</Button>
            <Button onClick={handleSendAlimtalk} disabled={sendingAlimtalk} className="gap-1.5">
              {sendingAlimtalk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {alimtalkConfirm ? `${alimtalkConfirm.groups.filter(g => g.parentPhone).length}명에게 발송` : '발송'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}