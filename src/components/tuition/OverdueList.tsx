import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, Calculator } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

const DEFAULT_LATE_FEE_RATE = 0.05; // 5% per month

export function OverdueList() {
  const [overdue, setOverdue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lateFeeRate, setLateFeeRate] = useState('5');

  useEffect(() => { loadOverdue(); }, []);

  const loadOverdue = async () => {
    setLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');

    // Get pending billings where due_date < today
    const { data } = await supabase
      .from('billing_schedules')
      .select('*, students(name, parent_phone, phone)')
      .in('status', ['pending', 'overdue'])
      .lt('due_date', today)
      .order('due_date');

    setOverdue(data || []);
    setLoading(false);
  };

  const markOverdueAll = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const pendingIds = overdue.filter(b => b.status === 'pending').map(b => b.id);
    if (pendingIds.length === 0) { toast.info('이미 모두 미납 처리되었습니다'); return; }

    const { error } = await supabase
      .from('billing_schedules')
      .update({ status: 'overdue' } as any)
      .in('id', pendingIds);

    if (error) { toast.error('상태 변경 실패'); return; }
    toast.success(`${pendingIds.length}건 미납 처리 완료`);
    loadOverdue();
  };

  const calculateLateFees = async () => {
    const rate = Number(lateFeeRate) / 100;
    const today = new Date();
    let updated = 0;

    for (const b of overdue) {
      const dueDate = new Date(b.due_date);
      const daysLate = differenceInDays(today, dueDate);
      const monthsLate = Math.max(1, Math.ceil(daysLate / 30));
      const lateFee = Math.round(Number(b.final_amount) * rate * monthsLate);

      if (lateFee !== Number(b.late_fee)) {
        await supabase
          .from('billing_schedules')
          .update({ late_fee: lateFee, status: 'overdue' } as any)
          .eq('id', b.id);
        updated++;
      }
    }

    toast.success(`${updated}건 연체료 계산 완료`);
    loadOverdue();
  };

  const totalOverdueAmount = overdue.reduce((s, b) => s + Number(b.final_amount), 0);
  const totalLateFee = overdue.reduce((s, b) => s + Number(b.late_fee), 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" variant="outline" onClick={loadOverdue} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />새로고침
        </Button>
        <Button size="sm" variant="destructive" onClick={markOverdueAll} className="gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />미납 일괄 처리
        </Button>
        <div className="flex items-center gap-1.5 ml-auto">
          <Label className="text-xs whitespace-nowrap">월 연체율(%)</Label>
          <Input type="number" value={lateFeeRate} onChange={e => setLateFeeRate(e.target.value)} className="h-8 w-16" />
          <Button size="sm" variant="secondary" onClick={calculateLateFees} className="gap-1">
            <Calculator className="w-3.5 h-3.5" />연체료 계산
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">총 미납 금액</p>
            <p className="text-xl font-bold text-red-600">{totalOverdueAmount.toLocaleString()}원</p>
            <p className="text-xs text-muted-foreground">{overdue.length}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">누적 연체료</p>
            <p className="text-xl font-bold text-orange-600">{totalLateFee.toLocaleString()}원</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            미납자 목록 ({overdue.length}명)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">로딩 중...</div>
          ) : overdue.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">🎉 미납자가 없습니다</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>청구월</TableHead>
                    <TableHead className="text-right">미납금액</TableHead>
                    <TableHead className="text-right">연체료</TableHead>
                    <TableHead>납부기한</TableHead>
                    <TableHead>연체일수</TableHead>
                    <TableHead>연락처</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdue.map(b => {
                    const daysLate = differenceInDays(new Date(), new Date(b.due_date));
                    const student = (b as any).students;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{student?.name || '-'}</TableCell>
                        <TableCell>{b.billing_month}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">{Number(b.final_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-orange-600">
                          {Number(b.late_fee) > 0 ? Number(b.late_fee).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell>{b.due_date}</TableCell>
                        <TableCell>
                          <Badge variant={daysLate > 30 ? 'destructive' : 'secondary'}>{daysLate}일</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{student?.parent_phone || student?.phone || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
