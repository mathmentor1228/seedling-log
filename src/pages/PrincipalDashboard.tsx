import { useState, useEffect, useCallback, useMemo, Component, lazy, Suspense, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { getAttendanceLabel, getPrimaryAttendanceStatus, isAbsent, isLate, isPresent } from '@/lib/attendance';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle, Clock, XCircle, Loader2, ChevronLeft, ChevronRight, LogIn, LogOut, Users,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PrincipalActionCenter } from '@/components/principal/PrincipalActionCenter';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { PageTransition } from '@/components/ui/page-transition';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from '@/lib/utils';

const Dashboard = lazy(() => import('./Dashboard'));
const TeamNotesBoard = lazy(() =>
  import('@/components/TeamNotesBoard').then((m) => ({ default: m.TeamNotesBoard }))
);
const AcademyCalendar = lazy(() =>
  import('@/components/AcademyCalendar').then((m) => ({ default: m.AcademyCalendar }))
);
const TeacherAttendanceView = lazy(() =>
  import('@/components/TeacherAttendanceView').then((m) => ({ default: m.TeacherAttendanceView }))
);

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
function StatCard({ label, value, sub, color, icon: Icon, onClick }: {
  label: string; value: number; sub?: string; color: 'green' | 'orange' | 'red' | 'blue';
  icon: React.ElementType;
  onClick?: () => void;
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
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`bg-card border ${colorMap[color]} transition-all duration-300 hover:scale-[1.02] ${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40' : ''}`}
    >
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

// ATTENDANCE-NORMALIZE-V1: 표시 라벨은 공통 모듈, 색상만 로컬 유지
const STATUS_COLOR: Record<string, string> = {
  '정상등원': 'text-emerald-600',
  '지각':     'text-amber-600',
  '조퇴':     'text-amber-600',
  '인정결석': 'text-muted-foreground',
  '무단결석': 'text-destructive',
  '보충불가': 'text-destructive',
  'legacy_absent': 'text-destructive',
};

/* ------------------------------------------------------------------ */
/*  Classroom View                                                     */
/* ------------------------------------------------------------------ */
function SlotCard({ slot, state }: { slot: ClassroomSlot; state: 'active' | 'upcoming' | 'past' }) {
  const present = slot.students.filter(s => isPresent(s.status)).length;
  const total = slot.students.length;

  return (
    <Card className={cn(
      'border transition-all duration-200',
      state === 'active' && 'border-emerald-400 shadow-md ring-1 ring-emerald-300/50',
      state === 'upcoming' && 'border-border',
      state === 'past' && 'border-border/40 opacity-45',
    )}>
      <CardContent className="p-3 space-y-2">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {state === 'active' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white leading-tight">진행중</span>
              )}
              {state === 'past' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground leading-tight">종료</span>
              )}
              <span className={cn('text-xs font-semibold truncate', state === 'past' && 'text-muted-foreground')}>
                {slot.className}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">{slot.subject}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {slot.teacherName}T · {slot.startTime}~{slot.endTime}
            </p>
          </div>
          <span className={cn(
            'text-xs font-mono shrink-0',
            state === 'active' ? 'text-emerald-600 font-bold' : 'text-muted-foreground'
          )}>
            {present}/{total}명
          </span>
        </div>

        {/* 학생 목록 */}
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-1">배정된 학생 없음</p>
        ) : (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 max-h-28 overflow-y-auto">
            {slot.students.map(s => {
              const isLateStudent = isLate(s.status);
              const isPresentStudent = isPresent(s.status) && !isLateStudent;
              const isAbsentStudent = isAbsent(s.status);
              const info = s.status
                ? { label: getAttendanceLabel(s.status) || s.status, color: STATUS_COLOR[s.status] || 'text-muted-foreground' }
                : null;
              return (
                <span
                  key={s.id}
                  title={info?.label || '수업 전'}
                  className={cn(
                    'text-[11px] font-medium',
                    isPresentStudent && 'text-emerald-600',
                    isLateStudent && 'text-amber-600',
                    isAbsentStudent && 'text-muted-foreground line-through',
                    !s.status && state === 'active' && 'text-foreground',
                    !s.status && state !== 'active' && 'text-muted-foreground',
                  )}
                >
                  {s.name}
                  {isLate && <span className="text-[9px] ml-0.5">지각</span>}
                  {isAbsent && <span className="text-[9px] ml-0.5">결</span>}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClassroomView({ slots }: { slots: ClassroomSlot[] }) {
  const nowStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);

  const active   = slots.filter(s => nowStr >= s.startTime && nowStr <= s.endTime);
  const upcoming = slots.filter(s => nowStr < s.startTime);
  const past     = slots.filter(s => nowStr > s.endTime);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5">
        <Users className="w-4 h-4 text-primary" />
        오늘 강의실 현황
      </h2>

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">오늘 등록된 수업이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {/* 진행중 */}
          {active.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">⬤ 진행중</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {active.map(s => <SlotCard key={s.scheduleId} slot={s} state="active" />)}
              </div>
            </div>
          )}

          {/* 예정 */}
          {upcoming.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">예정</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {upcoming.map(s => <SlotCard key={s.scheduleId} slot={s} state="upcoming" />)}
              </div>
            </div>
          )}

          {/* 종료 */}
          {past.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide">종료</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {past.map(s => <SlotCard key={s.scheduleId} slot={s} state="past" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Attendance Detail Dialog (student list per stat card)              */
/* ------------------------------------------------------------------ */
function AttendanceDetailDialog({
  kind,
  onClose,
  logs,
}: {
  kind: null | 'rate' | 'late' | 'absent';
  onClose: () => void;
  logs: AttendanceLog[];
}) {
  const open = kind !== null;

  const { title, items } = useMemo(() => {
    if (!kind) return { title: '', items: [] as { name: string; sub?: string; tag?: string; tagColor?: string }[] };

    if (kind === 'rate') {
      const present = logs
        .filter(l => l.checked_in_at)
        .sort((a, b) => (a.checked_in_at || '').localeCompare(b.checked_in_at || ''));
      return {
        title: `오늘 출석한 학생 (${present.length}명)`,
        items: present.map(l => ({
          name: l.student_name || '-',
          sub: l.checked_in_at
            ? `입실 ${fmtTime(l.checked_in_at)}${l.checked_out_at ? ` · 퇴실 ${fmtTime(l.checked_out_at)}` : ''}`
            : '',
          tag: l.checked_out_at ? '퇴실' : '재원',
          tagColor: l.checked_out_at ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/15 text-emerald-600',
        })),
      };
    }

    if (kind === 'late') {
      const late = logs
        .filter(l => l.checked_in_at && new Date(l.checked_in_at).getMinutes() > 10)
        .sort((a, b) => (a.checked_in_at || '').localeCompare(b.checked_in_at || ''));
      return {
        title: `지각 학생 (${late.length}명)`,
        items: late.map(l => ({
          name: l.student_name || '-',
          sub: l.checked_in_at ? `입실 ${fmtTime(l.checked_in_at)}` : '',
          tag: '지각',
          tagColor: 'bg-amber-500/15 text-amber-600',
        })),
      };
    }

    // absent
    const absent = logs
      .filter(l => !l.checked_in_at)
      .sort((a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'ko'));
    return {
      title: `결석 학생 (${absent.length}명)`,
      items: absent.map(l => ({
        name: l.student_name || '-',
        sub: '미등원',
        tag: '결석',
        tagColor: 'bg-destructive/15 text-destructive',
      })),
    };
  }, [kind, logs]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">해당 학생이 없습니다.</p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-2">
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li
                  key={`${it.name}-${i}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{it.name}</p>
                    {it.sub && <p className="text-xs text-muted-foreground truncate">{it.sub}</p>}
                  </div>
                  {it.tag && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${it.tagColor}`}>
                      {it.tag}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Content                                             */
/* ------------------------------------------------------------------ */
function PrincipalContent() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [classroomSlots, setClassroomSlots] = useState<ClassroomSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState<null | 'rate' | 'late' | 'absent'>(null);

  // KST 기준 오늘 날짜 및 요일 (UTC+9)
  const today = useMemo(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
  }, []);
  const todayDow = useMemo(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.getUTCDay();
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      // 1+2 병렬: 출석 로그 + 오늘 수업 일정
      const [logsRes, schedRes] = await Promise.all([
        supabase.from('attendance_logs').select('*').eq('date', today),
        supabase
          .from('class_schedules')
          .select('id, start_time, end_time, class_id, teacher_id, classes(name, subject)')
          .eq('day_of_week', todayDow)
          .eq('is_active', true)
          .order('start_time'),
      ]);

      if (logsRes.data) setLogs(logsRes.data as AttendanceLog[]);
      const schedules = schedRes.data;
      if (schedRes.error) console.error('[PrincipalDash] schedules error:', schedRes.error);

      if (!schedules || schedules.length === 0) {
        setClassroomSlots([]);
        setLoading(false);
        return;
      }

      const classIds = schedules.map((s: any) => s.class_id).filter(Boolean);
      const teacherIds = [...new Set(schedules.map((s: any) => s.teacher_id).filter(Boolean))];

      // 2b+3+4 병렬: profiles, class_students, lesson_records
      const [profilesRes, classStudentsRes, lessonRecordsRes] = await Promise.all([
        teacherIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', teacherIds)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase
          .from('class_students')
          .select('class_id, student_id, students(name, enrollment_status)')
          .in('class_id', classIds)
          .in('students.enrollment_status', ['재학', '재등원']),
        supabase
          .from('lesson_records')
          .select('student_id, class_id, attendance_status')
          .in('class_id', classIds)
          .eq('lesson_date', today),
      ]);

      const teacherMap: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });

      const classStudents = classStudentsRes.data;
      const lessonRecords = lessonRecordsRes.data;

      // 출석 상태 맵
      const statusMap = new Map<string, string>();
      (lessonRecords || []).forEach((r: any) => {
        const status = getPrimaryAttendanceStatus(r.attendance_status);
        if (status) statusMap.set(`${r.student_id}:${r.class_id}`, status);
      });


      // 학생 맵 (class_id → students[]) — students가 null이면 퇴원/휴학으로 간주하여 제외
      const studentsByClass = new Map<string, { id: string; name: string }[]>();
      (classStudents || []).forEach((cs: any) => {
        if (!cs.students) return; // enrollment_status 필터로 누락된 학생
        if (!studentsByClass.has(cs.class_id)) studentsByClass.set(cs.class_id, []);
        studentsByClass.get(cs.class_id)!.push({ id: cs.student_id, name: cs.students?.name || '-' });
      });

      // 현재 KST 시각 (HH:MM) — 수업 시작 전에는 미리 저장된 출결(정상등원 등)을 표시하지 않음
      const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const nowHHMM = `${String(nowKst.getUTCHours()).padStart(2, '0')}:${String(nowKst.getUTCMinutes()).padStart(2, '0')}`;

      const slots: ClassroomSlot[] = schedules.map((s: any) => {
        const startHHMM = s.start_time?.slice(0, 5) || '';
        const classStarted = startHHMM && nowHHMM >= startHHMM;
        const students = (studentsByClass.get(s.class_id) || []).map(st => ({
          id: st.id,
          name: st.name,
          // 수업 시작 전이면 lesson_records에 임시 저장된 출결 상태를 무시 (수업 후 실제 체킹 반영)
          status: classStarted ? (statusMap.get(`${st.id}:${s.class_id}`) || null) : null,
        }));
        return {
          scheduleId: s.id,
          classId: s.class_id,
          className: s.classes?.name || '-',
          subject: s.classes?.subject || '-',
          startTime: startHHMM,
          endTime: s.end_time?.slice(0, 5) || '',
          teacherName: teacherMap[s.teacher_id] || '-',
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, () => { fetchAll().catch(() => {}); })
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
          {/* PRINCIPAL-ACTION-V1 — 행동이 필요한 항목만 최상단 */}
          <PrincipalActionCenter
            todayNoCheckInCount={absentCount}
            onOpenNoCheckIn={() => setDetailOpen('absent')}
          />

          {/* 오늘 출입 태그 요약 (문제 없음 항목은 여기서 요약만) */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={CheckCircle}
              label="오늘 입실률"
              value={attendanceRate}
              sub={`${checkedIn.length + checkedOut.length}/${totalStudents}명 · 출입 태그 기준`}
              color="green"
              onClick={() => setDetailOpen('rate')}
            />
            <StatCard
              icon={Clock}
              label="지각"
              value={lateCount}
              sub="오늘 · 출입 태그 기준"
              color="orange"
              onClick={() => setDetailOpen('late')}
            />
          </div>


          <AttendanceDetailDialog
            kind={detailOpen}
            onClose={() => setDetailOpen(null)}
            logs={logs}
          />

          {/* 강의실 수업 현황 */}
          <ClassroomView slots={classroomSlots} />

          {/* 일정 + 코멘트/요청 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Suspense fallback={<DashboardSkeleton variant="list" count={2} />}>
              <AcademyCalendar />
            </Suspense>
            <Suspense fallback={<DashboardSkeleton variant="list" count={2} />}>
              <TeamNotesBoard />
            </Suspense>
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
          <Suspense fallback={<DashboardSkeleton variant="list" count={3} />}>
            <TeacherAttendanceView />
          </Suspense>
        </CardContent>
      </Card>
    </AttendanceErrorBoundary>
  );
}

function SwipeablePrincipal() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, skipSnaps: false });
  const [activeIndex, setActiveIndex] = useState(0);
  const [secondPanelMounted, setSecondPanelMounted] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const idx = emblaApi.selectedScrollSnap();
    setActiveIndex(idx);
    if (idx === 1) setSecondPanelMounted(true);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, onSelect]);

  const scrollTo = (idx: number) => {
    if (idx === 1) setSecondPanelMounted(true);
    emblaApi?.scrollTo(idx);
  };

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
            {secondPanelMounted ? (
              <Suspense fallback={<DashboardSkeleton variant="stats" />}>
                <Dashboard hideAdminTools />
                <div className="p-2">
                  <AttendanceCardSafe />
                </div>
              </Suspense>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                스와이프하여 수업 관리 패널 열기
              </div>
            )}
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
