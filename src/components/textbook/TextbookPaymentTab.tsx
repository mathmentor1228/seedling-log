import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Ban } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

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
  distributed_by_name: string;
  created_at: string;
  textbook_orders?: { textbook_name: string; unit_price: number } | null;
}

export function TextbookPaymentTab() {
  const { user } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('textbook_distributions')
      .select('*, textbook_orders(textbook_name, unit_price)')
      .order('created_at', { ascending: false });
    if (error) toast.error('수납 목록 로드 실패');
    else setDistributions((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConfirmPayment = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({
      payment_status: '수납완료',
      paid_at: new Date().toISOString(),
      confirmed_by: userName,
    } as any).eq('id', dist.id);
    if (error) toast.error('수납 처리 실패');
    else { toast.success(`${dist.student_name} 수납 완료 처리되었습니다`); fetchData(); }
  };

  const handleRevertPayment = async (dist: Distribution) => {
    const { error } = await supabase.from('textbook_distributions').update({
      payment_status: '미납',
      paid_at: null,
      confirmed_by: null,
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

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(format(d, 'yyyy-MM'));
    }
    return opts;
  }, []);

  const unpaid = distributions.filter(d => d.payment_status === '미납');

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
          <p className="text-xl font-bold text-success">{monthlyStats.totalPaid.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">수납 완료</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold text-destructive">{monthlyStats.totalUnpaid.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">미납액</p>
        </Card>
      </div>

      {/* Unpaid list */}
      {unpaid.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">미납 목록 ({unpaid.length}건)</h3>
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
                      {dist.textbook_orders?.textbook_name} · {dist.total_amount.toLocaleString()}원
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      배부일: {format(new Date(dist.created_at), 'yyyy-MM-dd')}
                    </p>
                  </div>
                  <Button size="sm" className="gap-1" onClick={() => handleConfirmPayment(dist)}>
                    <CheckCircle2 className="w-3.5 h-3.5" />입금 확인
                  </Button>
                </div>
              </Card>
            ))}
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
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{dist.student_name}</p>
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
    </div>
  );
}
