import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, AlertCircle, Clock, MinusCircle, Bell, X } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface HomeworkStats {
  completed: number;
  partial: number;
  notDone: number;
  unchecked: number;
}

interface DetailRow {
  studentName: string;
  studentId: string;
  subject: string;
  content: string;
  assignedDate: string;
  teacherName: string;
  teacherId: string;
  checkStatus: string;
}

interface TeacherUncheckedSummary {
  teacherId: string;
  teacherName: string;
  uncheckedCount: number;
  totalCount: number;
  rate: number;
}

const CHART_COLORS = [
  'hsl(160, 84%, 39%)',  // success - completed
  'hsl(38, 92%, 50%)',   // warning - partial
  'hsl(0, 84%, 60%)',    // destructive - not done
  'hsl(215, 16%, 47%)',  // muted - unchecked
];

const STATUS_CONFIG = [
  { key: 'completed', label: '완료', icon: CheckCircle2, colorClass: 'text-success', filterStatuses: ['checked', 'completed', '완료', '확인함'] },
  { key: 'partial', label: '일부완료', icon: Clock, colorClass: 'text-warning', filterStatuses: ['partial', '일부완료', '부분완료'] },
  { key: 'notDone', label: '미이행', icon: AlertCircle, colorClass: 'text-destructive', filterStatuses: ['not_done', '미이행', '미완료'] },
  { key: 'unchecked', label: '미확인', icon: MinusCircle, colorClass: 'text-muted-foreground', filterStatuses: [] },
] as const;

export function HomeworkCompletionChart() {
  const [stats, setStats] = useState<HomeworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState<any[]>([]);
  const [students, setStudents] = useState<Map<string, string>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  
  // Drill-down state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillCategory, setDrillCategory] = useState<string>('');
  const [drillRows, setDrillRows] = useState<DetailRow[]>([]);
  
  // Teacher alert state
  const [teacherAlertOpen, setTeacherAlertOpen] = useState(false);
  const [teacherSummaries, setTeacherSummaries] = useState<TeacherUncheckedSummary[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    async function fetchStats() {
      try {
        const since = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        
        const [hwRes, studRes, profRes] = await Promise.all([
          supabase.from('homework_assignments').select('id, student_id, subject, content, assigned_date, check_status, created_by').gte('assigned_date', since),
          supabase.from('students').select('id, name').in('enrollment_status', ['재학', '재등원']),
          supabase.from('profiles').select('id, full_name'),
        ]);

        if (hwRes.error) throw hwRes.error;

        const studentMap = new Map((studRes.data || []).map(s => [s.id, s.name]));
        const profileMap = new Map((profRes.data || []).map(p => [p.id, p.full_name]));
        setStudents(studentMap);
        setProfiles(profileMap);
        setRawData(hwRes.data || []);

        const counts: HomeworkStats = { completed: 0, partial: 0, notDone: 0, unchecked: 0 };
        (hwRes.data || []).forEach((hw: any) => {
          const s = (hw.check_status || '').toLowerCase().trim();
          if (['checked', 'completed', '완료', '확인함'].includes(s)) counts.completed++;
          else if (['partial', '일부완료', '부분완료'].includes(s)) counts.partial++;
          else if (['not_done', '미이행', '미완료'].includes(s)) counts.notDone++;
          else counts.unchecked++;
        });

        setStats(counts);
        
        // Build teacher unchecked summaries
        const teacherAgg = new Map<string, { total: number; unchecked: number }>();
        (hwRes.data || []).forEach((hw: any) => {
          const tid = hw.created_by || 'unknown';
          if (!teacherAgg.has(tid)) teacherAgg.set(tid, { total: 0, unchecked: 0 });
          const agg = teacherAgg.get(tid)!;
          agg.total++;
          const s = (hw.check_status || '').toLowerCase().trim();
          if (!['checked', 'completed', '완료', '확인함', 'partial', '일부완료', '부분완료', 'not_done', '미이행', '미완료'].includes(s)) {
            agg.unchecked++;
          }
        });
        
        const summaries: TeacherUncheckedSummary[] = [];
        for (const [tid, agg] of teacherAgg) {
          if (agg.unchecked > 0) {
            summaries.push({
              teacherId: tid,
              teacherName: profileMap.get(tid) || '(알 수 없음)',
              uncheckedCount: agg.unchecked,
              totalCount: agg.total,
              rate: Math.round((agg.unchecked / agg.total) * 100),
            });
          }
        }
        summaries.sort((a, b) => b.uncheckedCount - a.uncheckedCount);
        setTeacherSummaries(summaries);
      } catch (err) {
        console.error('Error fetching homework stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const handleCategoryClick = (categoryKey: string) => {
    const config = STATUS_CONFIG.find(c => c.key === categoryKey);
    if (!config) return;
    
    const filtered = rawData.filter((hw: any) => {
      const s = (hw.check_status || '').toLowerCase().trim();
      if (categoryKey === 'unchecked') {
        return !['checked', 'completed', '완료', '확인함', 'partial', '일부완료', '부분완료', 'not_done', '미이행', '미완료'].includes(s);
      }
      return (config.filterStatuses as readonly string[]).includes(s);
    });

    const rows: DetailRow[] = filtered.map((hw: any) => ({
      studentName: students.get(hw.student_id) || '(알 수 없음)',
      studentId: hw.student_id,
      subject: hw.subject || '-',
      content: hw.content || '-',
      assignedDate: hw.assigned_date,
      teacherName: profiles.get(hw.created_by) || '(알 수 없음)',
      teacherId: hw.created_by || '',
      checkStatus: hw.check_status || 'unchecked',
    }));

    setDrillCategory(config.label);
    setDrillRows(rows);
    setDrillOpen(true);
  };

  const sendTeacherReminder = async (teacher: TeacherUncheckedSummary) => {
    try {
      // Create a team_note directed at the teacher to remind them
      const { error } = await supabase.from('team_notes').insert({
        title: `숙제 확인 요청 (미확인 ${teacher.uncheckedCount}건)`,
        body: `최근 7일간 배정하신 숙제 중 ${teacher.uncheckedCount}건이 아직 미확인 상태입니다. 확인 부탁드립니다.`,
        scope: 'general',
        priority: 'high',
        target_user_id: teacher.teacherId,
        target_role: 'teacher',
        created_by: (await supabase.auth.getUser()).data.user?.id || '',
      });
      if (error) throw error;
      toast({ title: '알림 전송 완료', description: `${teacher.teacherName} 선생님에게 숙제 확인 요청을 보냈습니다.` });
    } catch (err) {
      console.error('Error sending reminder:', err);
      toast({ title: '전송 실패', description: '알림을 보내지 못했습니다.', variant: 'destructive' });
    }
  };

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

  // Check if there are teachers with high unchecked rates (>50% or 5+ unchecked)
  const highAlertTeachers = teacherSummaries.filter(t => t.uncheckedCount >= 5 || t.rate >= 50);

  return (
    <>
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </div>
            숙제 이행률
            <span className="text-xs font-normal text-muted-foreground ml-1">최근 7일</span>
            {highAlertTeachers.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setTeacherAlertOpen(true)}
              >
                <Bell className="w-3.5 h-3.5 mr-1" />
                미확인 알림 ({highAlertTeachers.length})
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col @[420px]:flex-row items-center @[420px]:items-center gap-4 @[420px]:gap-6 @container">
            {/* Donut Chart */}
            <div className="relative w-32 h-32 @[420px]:w-40 @[420px]:h-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={58}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                    style={{ cursor: 'pointer' }}
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
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl @[420px]:text-2xl font-extrabold text-foreground">{completionRate}%</span>
                <span className="text-[10px] text-muted-foreground font-medium">완료율</span>
              </div>
            </div>

            {/* Legend - clickable */}
            <div className="w-full @[420px]:flex-1 min-w-0 space-y-1.5">
              {STATUS_CONFIG.map((config, i) => {
                const value = stats[config.key as keyof HomeworkStats];
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                const Icon = config.icon;
                return (
                  <button
                    key={config.key}
                    className="flex items-center justify-between gap-2 text-sm w-full hover:bg-muted/50 rounded-md px-1.5 py-1 transition-colors cursor-pointer min-w-0"
                    onClick={() => value > 0 && handleCategoryClick(config.key)}
                    disabled={value === 0}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i] }} />
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${config.colorClass}`} />
                      <span className="text-foreground font-medium whitespace-nowrap text-xs @[420px]:text-sm">{config.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 shrink-0">
                      <span className="text-foreground tabular-nums text-xs @[420px]:text-sm whitespace-nowrap">{value}건</span>
                      <span className="text-muted-foreground/70 tabular-nums text-[10px] @[420px]:text-xs whitespace-nowrap">{pct}%</span>
                    </div>
                  </button>
                );
              })}
              <div className="pt-2 border-t border-border mt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">전체</span>
                  <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">{total}건</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down Dialog */}
      <Dialog open={drillOpen} onOpenChange={setDrillOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>숙제 상세 - {drillCategory} ({drillRows.length}건)</DialogTitle>
          </DialogHeader>
          {drillRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">데이터가 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>숙제 내용</TableHead>
                    <TableHead>배정일</TableHead>
                    <TableHead>담당 선생님</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.studentName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.subject}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{row.content}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.assignedDate}</TableCell>
                      <TableCell className="text-sm">{row.teacherName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Teacher Alert Dialog */}
      <Dialog open={teacherAlertOpen} onOpenChange={setTeacherAlertOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-destructive" />
              숙제 미확인 선생님 알림
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            미확인 숙제가 많은 선생님에게 확인 요청 알림을 보낼 수 있습니다.
          </p>
          <div className="space-y-3">
            {teacherSummaries.map((t) => (
              <div key={t.teacherId} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <span className="font-medium text-sm">{t.teacherName}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    전체 {t.totalCount}건 중 미확인 <span className="text-destructive font-semibold">{t.uncheckedCount}건</span> ({t.rate}%)
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={t.uncheckedCount >= 5 || t.rate >= 50 ? 'destructive' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => sendTeacherReminder(t)}
                >
                  <Bell className="w-3 h-3 mr-1" />
                  알림 전송
                </Button>
              </div>
            ))}
            {teacherSummaries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">미확인 숙제가 있는 선생님이 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
