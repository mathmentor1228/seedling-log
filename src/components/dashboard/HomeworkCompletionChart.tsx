import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle, Clock, MinusCircle } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface HomeworkStats {
  completed: number;
  partial: number;
  notDone: number;
  unchecked: number;
}

const CHART_COLORS = [
  'hsl(160, 84%, 39%)',  // success - completed
  'hsl(38, 92%, 50%)',   // warning - partial
  'hsl(0, 84%, 60%)',    // destructive - not done
  'hsl(215, 16%, 47%)',  // muted - unchecked
];

const STATUS_CONFIG = [
  { key: 'completed', label: '완료', icon: CheckCircle2, colorClass: 'text-success' },
  { key: 'partial', label: '일부완료', icon: Clock, colorClass: 'text-warning' },
  { key: 'notDone', label: '미이행', icon: AlertCircle, colorClass: 'text-destructive' },
  { key: 'unchecked', label: '미확인', icon: MinusCircle, colorClass: 'text-muted-foreground' },
] as const;

export function HomeworkCompletionChart() {
  const [stats, setStats] = useState<HomeworkStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const since = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        
        const { data, error } = await supabase
          .from('homework_assignments')
          .select('check_status')
          .gte('assigned_date', since);

        if (error) throw error;

        const counts: HomeworkStats = { completed: 0, partial: 0, notDone: 0, unchecked: 0 };
        (data || []).forEach((hw: any) => {
          const s = (hw.check_status || '').toLowerCase().trim();
          if (['checked', 'completed', '완료', '확인함'].includes(s)) counts.completed++;
          else if (['partial', '일부완료', '부분완료'].includes(s)) counts.partial++;
          else if (['not_done', '미이행', '미완료'].includes(s)) counts.notDone++;
          else counts.unchecked++;
        });

        setStats(counts);
      } catch (err) {
        console.error('Error fetching homework stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>숙제 이행률</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const total = stats.completed + stats.partial + stats.notDone + stats.unchecked;
  const completionRate = total > 0 ? Math.round((stats.completed / total) * 100) : 0;

  const chartData = [
    { name: '완료', value: stats.completed },
    { name: '일부완료', value: stats.partial },
    { name: '미이행', value: stats.notDone },
    { name: '미확인', value: stats.unchecked },
  ].filter(d => d.value > 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          숙제 이행률
          <span className="text-xs font-normal text-muted-foreground ml-1">최근 7일</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Donut Chart */}
          <div className="relative w-40 h-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((_, index) => {
                    const originalIndex = [
                      stats.completed > 0 ? 0 : -1,
                      stats.partial > 0 ? 1 : -1,
                      stats.notDone > 0 ? 2 : -1,
                      stats.unchecked > 0 ? 3 : -1,
                    ].filter(i => i >= 0)[index];
                    return <Cell key={index} fill={CHART_COLORS[originalIndex]} />;
                  })}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value}건`, name]}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                    fontSize: '0.75rem',
                    boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.08)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-foreground">{completionRate}%</span>
              <span className="text-[10px] text-muted-foreground font-medium">완료율</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2.5">
            {STATUS_CONFIG.map((config, i) => {
              const value = stats[config.key as keyof HomeworkStats];
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              const Icon = config.icon;
              return (
                <div key={config.key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i] }} />
                    <Icon className={`w-3.5 h-3.5 ${config.colorClass}`} />
                    <span className="text-foreground font-medium">{config.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{value}건</span>
                    <span className="text-muted-foreground/60 tabular-nums text-xs w-8 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-border mt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">전체</span>
                <span className="font-semibold text-foreground tabular-nums">{total}건</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
