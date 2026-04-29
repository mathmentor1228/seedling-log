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
/*  Types for classroom view                                           */
/* ------------------------------------------------------------------ */
interface ClassroomSlot {
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  students: { id: string; name: string; status: string | null }[];
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  '정상등원': { label: '등원', color: 'text-emerald-600' },
  '지각':     { label: '지각', color: 'text-amber-600' },
  '인정결석': { label: '인정결석', color: 'text-muted-foreground' },
  '무단결석': { label: '무단결석', color: 'text-destructive' },
  '결석':     { label: '결석', color: 'text-destructive' },
  '미등원':   { label: '미등원', color: 'text-muted-foreground' },
};

/* ------------------------------------------------------------------ */
/*  Main Dashboard Content                                             */
/* ------------------------------------------------------------------ */
function PrincipalContent() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [classroomSlots, setClassroomSlots] = useState<ClassroomSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayDow = useMemo(() => new Date().getDay(), []);

  const fetchAll = useCallback(async () => {
    try {
      // 1. 오늘 출석 로그 (stat용)
      const logsRes = await supabase.from('attendance_logs').select('*').eq('date', today);
      if (logsRes.data) setLogs(logsRes.data as AttendanceLog[]);

      // 2. 오늘 수업 일정 (전체 선생님)
      const { data: schedules } = await supabase
        .from('class_schedules')
        .select('id, start_time, end_time, class_id, teacher_id, classes(name, subject), profiles:teacher_id(full_name)')
        .eq('day_of_week', todayDow)
        .eq('is_active', true)
        .order('start_time');

      if (!schedules || schedules.length === 0) {
        setClassroomSlots([]);
        setLoading(false);
        return;
      }

      const classIds = schedules.map((s: any) => s.class_id).filter(Boolean);

      // 3. 각 수업의 학생 목록
      const { data: classStudents } = await supabase
        .from('class_students')
        .select('class_id, student_id, students(name)')
        .in('class_id', classIds);

      // 4. 오늘 lesson_records (출석 상태)
      const { data: lessonRecords } = await supabase
        .from('lesson_records')
        .select('student_id, class_id, attendance_status')
        .in('class_id', classIds)
        .eq('lesson_date', today);

      // 출석 상태 맵 (student_id:class_id → status)
      const statusMap = new Map<string, string>();
      (lessonRecords || []).forEach((r: any) => {
        const arr: string[] = r.attendance_status || [];
        const status = arr.find(s => s !== '정상등원') || arr[0] || null;
        if (status) statusMap.set(`${r.student_id}:${r.class_id}`, status);
      });

      // 학생 맵 (class_id → students[])
      const studentsByClass = new Map<string, { id: string; name: string }[]>();
      (classStudents || []).forEach((cs: any) => {
        if (!studentsByClass.has(cs.class_id)) studentsByClass.set(cs.class_id, []);
        studentsByClass.get(cs.class_id)!.push({ id: cs.student_id, name: cs.students?.name || '-' });
      });

      const slots: ClassroomSlot[] = schedules.map((s: any) => {
        const students = (studentsByClass.get(s.class_id) || []).map(st => ({
          id: st.id,
          name: st.name,
          status: statusMap.get(`${st.id}:${s.class_id}`) || null,
        }));
        return {
          scheduleId: s.id,
          classId: s.class_id,
          className: s.classes?.name || '-',
          subject: s.classes?.subject || '-',
          startTime: s.start_time?.slice(0, 5) || '',
          endTime: s.end_time?.slice(0, 5) || '',
          teacherName: s.profiles?.full_name || '-',
          students,
        };
      });

      setClassroomSlots(slots);
    } catch (err) {
      console.error('PrincipalContent fetchAll error:', err);
    }
    setLoading(false);
  }, [today, todayDow]);

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

          {/* 강의실 수업 현황 */}
          {classroomSlots.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                오늘 강의실 현황
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {classroomSlots.map(slot => {
                  const present = slot.students.filter(s => s.status === '정상등원' || s.status === '지각');
                  const absent = slot.students.filter(s => s.status === '인정결석' || s.status === '무단결석' || s.status === '결석');
                  const pending = slot.students.filter(s => !s.status || s.status === '미등원');
                  const now = new Date().toTimeString().slice(0, 5);
                  const isNow = now >= slot.startTime && now <= slot.endTime;
                  const isPast = now > slot.endTime;

                  return (
                    <Card key={slot.scheduleId} className={cn('border transition-all', isNow && 'border-primary/40 bg-primary/[0.02]')}>
                      <CardContent className="p-3 space-y-2">
                        {/* 헤더 */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isNow && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">진행중</span>}
                              {isPast && <span className="text-[10px] text-muted-foreground">종료</span>}
                              <span className="text-xs font-semibold truncate">{slot.className}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{slot.subject}</Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{slot.teacherName}T · {slot.startTime}~{slot.endTime}</p>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground shrink-0">
                            {present.length}/{slot.students.length}명
                          </span>
                        </div>

                        {/* 학생 목록 */}
                        {slot.students.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-1">배정된 학생 없음</p>
                        ) : (
                          <div className="space-y-0.5 max-h-36 overflow-y-auto">
                            {slot.students.map(s => {
                              const info = s.status ? (STATUS_LABEL[s.status] || { label: s.status, color: 'text-muted-foreground' }) : null;
                              return (
                                <div key={s.id} className="flex items-center justify-between text-xs">
                                  <span className={cn(
                                    'font-medium',
                                    s.status === '정상등원' ? 'text-emerald-600' :
                                    s.status === '지각' ? 'text-amber-600' :
                                    (s.status === '인정결석' || s.status === '무단결석' || s.status === '결석') ? 'text-muted-foreground line-through' :
                                    'text-foreground'
                                  )}>
                                    {s.name}
                                  </span>
                                  <span className={cn('text-[10px]', info?.color || 'text-muted-foreground')}>
                                    {info ? info.label : '수업 전'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

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
