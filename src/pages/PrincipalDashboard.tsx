import { useState, useEffect, useCallback, useMemo, Component, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle, Clock, XCircle, Loader2, ChevronLeft, ChevronRight, LogIn, LogOut, Users,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { PageTransition } from '@/components/ui/page-transition';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import useEmblaCarousel from 'embla-carousel-react';
import Dashboard from './Dashboard';
import { cn } from '@/lib/utils';
import { TeamNotesBoard } from '@/components/TeamNotesBoard';
import { AcademyCalendar } from '@/components/AcademyCalendar';
import { TeacherAttendanceView } from '@/components/TeacherAttendanceView';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface AttendanceLog {
  id: string; student_id: string | null; student_name: string | null;
  room_id: string | null; date: string; checked_in_at: string | null; checked_out_at: string | null;
}

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
/*  Room config (강의실 목록)                                           */
/* ------------------------------------------------------------------ */
const ROOMS = [
  { id: 'room2',  label: '2강의실',  teacher: '최윤기' },
  { id: 'room4',  label: '4강의실',  teacher: '조준희' },
  { id: 'room5',  label: '5강의실',  teacher: '고대영' },
  { id: 'room6',  label: '6강의실',  teacher: '이나연' },
  { id: 'room7',  label: '7강의실',  teacher: '정선호' },
  { id: 'room8',  label: '8강의실',  teacher: '김민희' },
  { id: 'room9',  label: '9강의실',  teacher: '황은지' },
];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

/* ------------------------------------------------------------------ */
/*  Main Dashboard Content                                             */
/* ------------------------------------------------------------------ */
function PrincipalContent() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchAll = useCallback(async () => {
    try {
      const [logsRes, capRes] = await Promise.all([
        supabase.from('attendance_logs').select('*').eq('date', today),
        supabase.from('room_capacities').select('*'),
      ]);
      if (logsRes.data) setLogs(logsRes.data as AttendanceLog[]);
      if (capRes.data) {
        const map: Record<string, number> = {};
        capRes.data.forEach((r: any) => { map[r.room_id] = r.capacity; });
        setCapacities(map);
      }
    } catch (err) {
      console.error('PrincipalContent fetchAll error:', err);
    }
    setLoading(false);
  }, [today]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const ch = supabase
      .channel('principal-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => { fetchAll().catch(() => {}); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  const checkedIn = logs.filter(l => l.checked_in_at && !l.checked_out_at);
  const checkedOut = logs.filter(l => l.checked_out_at);
  const totalStudents = logs.length || 1;
  const attendanceRate = Math.round(((checkedIn.length + checkedOut.length) / totalStudents) * 100);
  const lateCount = logs.filter(l => l.checked_in_at && new Date(l.checked_in_at).getMinutes() > 10).length;
  const absentCount = logs.filter(l => !l.checked_in_at).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardSkeleton variant="stats" />
        <DashboardSkeleton variant="list" count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">원장 대시보드</h1>
        <LiveClock />
      </div>

      <PageTransition>
        <div className="space-y-5">
          {/* 출석 현황 */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={CheckCircle}
              label="전체 출석률"
              value={attendanceRate}
              sub={`${checkedIn.length + checkedOut.length}/${totalStudents}명 출석`}
              color="green"
            />
            <StatCard
              icon={Clock}
              label="지각"
              value={lateCount}
              sub="오늘 기준"
              color="orange"
            />
            <StatCard
              icon={XCircle}
              label="결석"
              value={absentCount}
              sub="미등원 학생"
              color="red"
            />
          </div>

          {/* 강의실 출석 현황 */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <Users className="w-4 h-4 text-primary" />
              강의실 현황
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ROOMS.map(room => {
                const roomLogs = logs.filter(l => l.room_id === room.id);
                const inRoom = roomLogs.filter(l => l.checked_in_at && !l.checked_out_at);
                const exited = roomLogs.filter(l => l.checked_out_at);
                const cap = capacities[room.id];
                const pct = cap ? inRoom.length / cap : 0;
                const barColor = pct >= 0.9 ? 'bg-destructive' : pct >= 0.7 ? 'bg-warning' : 'bg-success';

                return (
                  <Card key={room.id} className="border">
                    <CardContent className="p-3 space-y-2">
                      {/* 헤더 */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold">{room.label}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">{room.teacher}T</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs font-mono',
                            pct >= 0.9 ? 'border-destructive/50 text-destructive' : 'border-border text-muted-foreground'
                          )}
                        >
                          {inRoom.length}{cap ? `/${cap}` : ''}명
                        </Badge>
                      </div>

                      {/* 용량 바 */}
                      {cap && (
                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                        </div>
                      )}

                      {/* 입실 중 */}
                      {inRoom.length > 0 ? (
                        <div className="space-y-1">
                          {inRoom.map(l => (
                            <div key={l.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <LogIn className="w-3 h-3 text-emerald-500 shrink-0" />
                                <span className="font-medium text-foreground">{l.student_name || '-'}</span>
                              </div>
                              <span className="text-muted-foreground font-mono tabular-nums">
                                {l.checked_in_at ? fmtTime(l.checked_in_at) : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-1">현재 입실 학생 없음</p>
                      )}

                      {/* 퇴실 학생 */}
                      {exited.length > 0 && (
                        <div className="border-t pt-2 space-y-1">
                          {exited.map(l => (
                            <div key={l.id} className="flex items-center justify-between text-xs opacity-50">
                              <div className="flex items-center gap-1.5">
                                <LogOut className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="line-through text-muted-foreground">{l.student_name || '-'}</span>
                              </div>
                              <span className="text-muted-foreground font-mono tabular-nums">
                                {l.checked_out_at ? fmtTime(l.checked_out_at) : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* 일정 + 코멘트/요청 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AcademyCalendar />
            <TeamNotesBoard />
          </div>
        </div>
      </PageTransition>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Swipeable Wrapper                                                   */
/* ------------------------------------------------------------------ */
const PANEL_LABELS = ['📊 원장 현황', '📋 수업 관리'];

class AttendanceErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('AttendanceCard crash:', err); }
  render() {
    if (this.state.hasError) return (
      <Card className="border-destructive/20">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">출결 데이터 로딩 오류</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => this.setState({ hasError: false })}>다시 시도</Button>
        </CardContent>
      </Card>
    );
    return this.props.children;
  }
}

function AttendanceCardSafe() {
  return (
    <AttendanceErrorBoundary>
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
    </AttendanceErrorBoundary>
  );
}

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
          <div className="flex-[0_0_100%] min-w-0 space-y-4">
            <Dashboard />
            <div className="p-2">
              <AttendanceCardSafe />
            </div>
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
