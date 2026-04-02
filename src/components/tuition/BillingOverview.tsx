import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import { DollarSign, Users, AlertTriangle, CheckCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  paid: 'hsl(var(--chart-2))',
  pending: 'hsl(var(--chart-4))',
  overdue: 'hsl(var(--chart-1))',
  cancelled: 'hsl(var(--muted-foreground))',
};

const STATUS_LABELS: Record<string, string> = {
  paid: '납부완료',
  pending: '대기',
  overdue: '미납',
  cancelled: '취소',
};

export function BillingOverview() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));
  const [billings, setBillings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const months = useMemo(() => {
    const arr: string[] = [];
    for (let i = -2; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      arr.push(format(d, 'yyyy-MM'));
    }
    return arr;
  }, []);

  useEffect(() => {
    loadBillings();
  }, [selectedMonth]);

  const loadBillings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('billing_schedules')
      .select('*, students(name)')
      .eq('billing_month', selectedMonth)
      .order('due_date');
    setBillings(data || []);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const total = billings.length;
    const paid = billings.filter(b => b.status === 'paid');
    const overdue = billings.filter(b => b.status === 'overdue');
    const pending = billings.filter(b => b.status === 'pending');
    const totalAmount = billings.reduce((s, b) => s + Number(b.final_amount), 0);
    const paidAmount = paid.reduce((s, b) => s + Number(b.final_amount), 0);
    const overdueAmount = overdue.reduce((s, b) => s + Number(b.final_amount) + Number(b.late_fee), 0);
    const totalLateFee = billings.reduce((s, b) => s + Number(b.late_fee), 0);

    return { total, paid: paid.length, overdue: overdue.length, pending: pending.length, totalAmount, paidAmount, overdueAmount, totalLateFee };
  }, [billings]);

  const pieData = useMemo(() => {
    return ['paid', 'pending', 'overdue', 'cancelled']
      .map(status => ({
        name: STATUS_LABELS[status],
        value: billings.filter(b => b.status === status).length,
        color: STATUS_COLORS[status],
      }))
      .filter(d => d.value > 0);
  }, [billings]);

  if (loading) return <div className="space-y-3 mt-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m} value={m}>{m.replace('-', '년 ')}월</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="총 청구" value={`${stats.totalAmount.toLocaleString()}원`} sub={`${stats.total}건`} />
        <StatCard icon={CheckCircle} label="납부 완료" value={`${stats.paidAmount.toLocaleString()}원`} sub={`${stats.paid}건`} className="text-green-600" />
        <StatCard icon={AlertTriangle} label="미납" value={`${stats.overdueAmount.toLocaleString()}원`} sub={`${stats.overdue}건`} className="text-red-600" />
        <StatCard icon={Users} label="대기중" value={`${stats.pending}건`} sub={stats.totalLateFee > 0 ? `연체료 ${stats.totalLateFee.toLocaleString()}원` : ''} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {pieData.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">납부 상태 분포</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} ${value}`}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">수납률</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <div className="text-4xl font-bold">
              {stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0}%
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.paid} / {stats.total} 건 납부 완료
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, className }: { icon: any; label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${className || 'text-muted-foreground'}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-lg font-bold ${className || ''}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
