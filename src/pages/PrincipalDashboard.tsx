import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  LogOut, CheckCircle, Clock, XCircle, Users, AlertTriangle, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { PageTransition } from '@/components/ui/page-transition';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import useEmblaCarousel from 'embla-carousel-react';
import Dashboard from './Dashboard';
import { cn } from '@/lib/utils';
import { TeamNotesBoard } from '@/components/TeamNotesBoard';
import { AcademyCalendar } from '@/components/AcademyCalendar';
import { TeacherAttendanceView } from '@/components/TeacherAttendanceView';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface PatternAlert {
  id: string; type: string; description: string; priority: string;
  created_date: string; resolved: boolean; student_id: string | null;
}
interface Classroom {
  id: string; name: string; capacity: number; is_active: boolean; manager_name: string;
}
interface AttendanceLog {
  id: string; student_id: string | null; student_name: string | null;
  room_id: string | null; date: string; checked_in_at: string | null; checked_out_at: string | null;
}
interface HourlyData { hour: string; actual: number; predicted: number; }

/* ------------------------------------------------------------------ */
/*  Live Clock                                                         */
/* ------------------------------------------------------------------ */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">{fmt}</p>
      <p className="text-lg font-mono font-bold text-foreground tabular-nums">{time}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card with count-up                                            */
/* ------------------------------------------------------------------ */
function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: number; sub?: string; color: 'green' | 'orange' | 'red' | 'blue';
  icon: React.ElementType;
}) {
  const colorMap = {
    green: 'border-success/30 shadow-glow-success',
    orange: 'border-warning/30 shadow-glow-warning',
    red: 'border-destructive/30 shadow-glow-danger',
    blue: 'border-primary/30 shadow-glow-primary',
  };
  const iconBg = {
    green: 'bg-success/15 text-success',
    orange: 'bg-warning/15 text-warning',
    red: 'bg-destructive/15 text-destructive',
    blue: 'bg-primary/15 text-primary',
  };
  const textColor = {
    green: 'text-success',
    orange: 'text-warning',
    red: 'text-destructive',
    blue: 'text-primary',
  };

  return (
    <Card className={`bg-card border ${colorMap[color]} transition-all duration-300 hover:scale-[1.02]`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${textColor[color]}`}>
            <AnimatedCounter value={value} />
            {sub?.includes('%') ? '%' : sub?.includes('명') ? '명' : ''}
          </p>
          {sub && <p className="text-2xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Classroom Bubble                                          */
/* ------------------------------------------------------------------ */
function ClassroomBubble({ name, count, capacity, blink }: {
  name: string; count: number; capacity: number; blink: boolean;
}) {
  const pct = capacity > 0 ? count / capacity : 0;
  const bg = pct >= 0.9 ? 'bg-destructive' : pct >= 0.7 ? 'bg-warning' : 'bg-success';
  return (
    <div
      className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white text-[10px] font-bold shadow-lg status-transition
        ${bg} ${blink ? 'animate-urgent-pulse ring-2 ring-destructive' : ''}`}
      title={name}
    >
      <span className="truncate max-w-[44px] leading-tight">{name}</span>
      <span className="text-[9px] font-mono opacity-80">{count}/{capacity}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Content                                             */
/* ------------------------------------------------------------------ */
function PrincipalContent() {
  const { user } = useAuth();

  const [alerts, setAlerts] = useState<PatternAlert[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertTab, setAlertTab] = useState('학생패턴');
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchAll = useCallback(async () => {
    const [alertRes, classRes, logRes] = await Promise.all([
      supabase.from('pattern_alerts').select('*').order('created_date', { ascending: false }).limit(50),
      supabase.from('classrooms').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('attendance_logs').select('*').eq('date', today),
    ]);
    if (alertRes.data) setAlerts(alertRes.data as PatternAlert[]);
    if (classRes.data) setClassrooms(classRes.data as Classroom[]);
    if (logRes.data) setLogs(logRes.data as AttendanceLog[]);
    setLoading(false);
  }, [today]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const ch = supabase
      .channel('principal-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pattern_alerts' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  const checkedIn = logs.filter(l => l.checked_in_at && !l.checked_out_at);
  const checkedOut = logs.filter(l => l.checked_out_at);
  const totalStudents = logs.length || 1;
  const attendanceRate = Math.round(((checkedIn.length + checkedOut.length) / totalStudents) * 100);
  const lateCount = logs.filter(l => l.checked_in_at && new Date(l.checked_in_at).getMinutes() > 10).length;
  const absentCount = logs.filter(l => !l.checked_in_at).length;
  const totalRoomCap = classrooms.reduce((s, c) => s + c.capacity, 0) || 1;
  const roomUsage = Math.round((checkedIn.length / totalRoomCap) * 100);

  const roomCounts = useMemo(() => {
    const m: Record<string, number> = {};
    checkedIn.forEach(l => { if (l.room_id) m[l.room_id] = (m[l.room_id] ?? 0) + 1; });
    return m;
  }, [checkedIn]);

  const blinkRooms = useMemo(() => {
    const now = Date.now();
    const rooms = new Set<string>();
    checkedIn.forEach(l => {
      if (l.checked_in_at && l.room_id && (now - new Date(l.checked_in_at).getTime()) / 60000 >= 30)
        rooms.add(l.room_id);
    });
    return rooms;
  }, [checkedIn]);

  const hourlyData: HourlyData[] = useMemo(() => {
    const hours = Array.from({ length: 9 }, (_, i) => 14 + i);
    const counts: Record<number, number> = {};
    logs.forEach(l => {
      if (l.checked_in_at) {
        const h = new Date(l.checked_in_at).getHours();
        if (h >= 14 && h <= 22) counts[h] = (counts[h] ?? 0) + 1;
      }
    });
    return hours.map(h => ({
      hour: `${h}:00`,
      actual: counts[h] ?? 0,
      predicted: Math.round((counts[h] ?? 0) * (0.9 + Math.random() * 0.2)),
    }));
  }, [logs]);

  const filteredAlerts = alerts.filter(a => {
    if (alertTab === '학생패턴') return a.type?.includes('학생') || a.student_id;
    if (alertTab === '강의실패턴') return a.type?.includes('강의실') || a.type?.includes('room');
    return a.type?.includes('트렌드') || a.type?.includes('trend');
  });

  const resolveAlert = async (id: string) => {
    await supabase.from('pattern_alerts').update({ resolved: true, resolved_at: new Date().toISOString() } as any).eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  const modalStudents = useMemo(() => {
    if (!selectedClassroom) return [];
    return checkedIn.filter(l => l.room_id === selectedClassroom.id);
  }, [selectedClassroom, checkedIn]);

  

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardSkeleton variant="stats" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DashboardSkeleton variant="list" count={4} />
          <DashboardSkeleton variant="chart" />
        </div>
      </div>
    );
  }

  const priorityColor: Record<string, string> = {
    '높음': 'bg-destructive/15 text-destructive border-destructive/30',
    '중간': 'bg-warning/15 text-warning border-warning/30',
    '낮음': 'bg-primary/15 text-primary border-primary/30',
  };

  return (
    <div className="space-y-6">
      {/* Sub-header with clock */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-bold">원장 대시보드</h1>
        <LiveClock />
      </div>

      <PageTransition>
        <div className="space-y-6">
          {/* 코멘트/요청 + 원내일정 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TeamNotesBoard />
            <AcademyCalendar />
          </div>

          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 animate-stagger">
            <StatCard icon={CheckCircle} label="전체 출석률" value={attendanceRate} sub={`${checkedIn.length + checkedOut.length}/${totalStudents}명 출석`} color="green" />
            <StatCard icon={Clock} label="지각" value={lateCount} sub="오늘 기준" color="orange" />
            <StatCard icon={XCircle} label="결석" value={absentCount} sub="미등원 학생" color="red" />
            <StatCard icon={Users} label="자습실 이용률" value={roomUsage} sub={`${checkedIn.length}/${totalRoomCap}석 사용 중`} color="blue" />
          </div>

          {/* MAIN GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Pattern Alerts */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  이상 패턴 감지
                  <Badge variant="outline" className="ml-auto text-2xs">
                    {alerts.filter(a => !a.resolved).length}건 미해결
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Tabs value={alertTab} onValueChange={setAlertTab}>
                  <TabsList className="mb-3 h-8">
                    {['학생패턴', '강의실패턴', '트렌드'].map(t => (
                      <TabsTrigger key={t} value={t} className="text-xs">{t}</TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value={alertTab} className="mt-0">
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {filteredAlerts.length === 0 && (
                        <EmptyState icon={<AlertTriangle className="w-6 h-6" />} title="감지된 패턴이 없습니다" description="이상 패턴이 발견되면 여기에 표시됩니다" />
                      )}
                      {filteredAlerts.map(a => (
                        <div
                          key={a.id}
                          className={`p-3 rounded-lg border status-transition ${
                            a.resolved
                              ? 'opacity-40 border-border bg-card'
                              : a.priority === '높음'
                                ? 'border-destructive/20 bg-destructive/5 animate-urgent-pulse'
                                : 'border-border bg-card'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={`text-2xs px-1.5 py-0 ${priorityColor[a.priority] ?? priorityColor['낮음']}`}>
                                  {a.priority}
                                </Badge>
                                <span className="text-2xs text-muted-foreground">{a.type}</span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{a.description}</p>
                              <p className="text-2xs text-muted-foreground mt-1">
                                {new Date(a.created_date).toLocaleString('ko-KR', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                            {!a.resolved && (
                              <Button size="sm" variant="ghost" className="text-2xs text-success hover:text-success hover:bg-success/10 h-7 px-2 shrink-0" onClick={() => resolveAlert(a.id)}>
                                해결 완료
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  혼잡도 예측
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={hourlyData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))', fontSize: 12 }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
                    <Bar dataKey="actual" name="실제 인원" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="predicted" name="예측 인원" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* CLASSROOM GRID */}
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              강의실 현황
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {classrooms.map(cr => {
                const count = roomCounts[cr.id] ?? 0;
                const pct = cr.capacity > 0 ? (count / cr.capacity) * 100 : 0;
                const barColor = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-success';
                return (
                  <Card key={cr.id} className="cursor-pointer hover:border-primary/30 transition-all duration-200" onClick={() => setSelectedClassroom(cr)}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold truncate">{cr.name}</p>
                        <span className="text-2xs text-muted-foreground font-mono">{count}/{cr.capacity}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <p className="text-2xs text-muted-foreground mt-1.5">{cr.manager_name || '담당 미지정'}</p>
                    </CardContent>
                  </Card>
                );
              })}
              {classrooms.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon={<Users className="w-6 h-6" />} title="등록된 강의실이 없습니다" description="강의실을 추가하면 여기에 표시됩니다" />
                </div>
              )}
            </div>
          </div>
        </div>
      </PageTransition>

      {/* FLOATING BUBBLES */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        {classrooms.slice(0, 6).map(cr => (
          <ClassroomBubble key={cr.id} name={cr.name} count={roomCounts[cr.id] ?? 0} capacity={cr.capacity} blink={blinkRooms.has(cr.id)} />
        ))}
      </div>

      {/* MODAL */}
      <Dialog open={!!selectedClassroom} onOpenChange={() => setSelectedClassroom(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedClassroom?.name} — 학생 현황</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {modalStudents.length === 0 && (
              <EmptyState icon={<Users className="w-6 h-6" />} title="현재 입실 중인 학생이 없습니다" />
            )}
            {modalStudents.map(s => {
              const mins = s.checked_in_at ? Math.round((Date.now() - new Date(s.checked_in_at).getTime()) / 60000) : 0;
              return (
                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
                  <div>
                    <p className="text-xs font-medium">{s.student_name || '이름 없음'}</p>
                    <p className="text-2xs text-muted-foreground">
                      입실: {s.checked_in_at ? new Date(s.checked_in_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                    </p>
                  </div>
                  <Badge className={`text-2xs status-transition ${mins >= 30 ? 'bg-warning/15 text-warning border-warning/30' : 'bg-success/15 text-success border-success/30'}`}>
                    {mins}분 체류
                  </Badge>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Swipeable Wrapper                                                   */
/* ------------------------------------------------------------------ */
const PANEL_LABELS = ['📊 원장 현황', '📋 수업 관리', '✅ 출석 체크'];

function SwipeablePrincipal() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, skipSnaps: false });
  const [activeIndex, setActiveIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setActiveIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, onSelect]);

  const scrollTo = (idx: number) => emblaApi?.scrollTo(idx);

  return (
    <div className="space-y-3">
      {/* Tab bar + arrows */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          disabled={activeIndex === 0}
          onClick={() => scrollTo(activeIndex - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 flex justify-center gap-2">
          {PANEL_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
                activeIndex === i
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          disabled={activeIndex === PANEL_LABELS.length - 1}
          onClick={() => scrollTo(activeIndex + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5">
        {PANEL_LABELS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              activeIndex === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {/* Swipeable panels */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          <div className="flex-[0_0_100%] min-w-0">
            <PrincipalContent />
          </div>
          <div className="flex-[0_0_100%] min-w-0">
            <Dashboard />
          </div>
          <div className="flex-[0_0_100%] min-w-0 p-2">
            <Card className="border-primary/20">
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">✅</span>
                  <h2 className="text-sm font-bold text-foreground">출석 체크</h2>
                </div>
                <LiveClock />
              </div>
              <CardContent className="pt-0 px-3 pb-4">
                <TeacherAttendanceView />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrincipalDashboard() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <SwipeablePrincipal />
    </ProtectedRoute>
  );
}
