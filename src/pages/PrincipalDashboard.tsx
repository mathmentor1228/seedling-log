import { useState, useEffect, useCallback, useMemo, lazy, Suspense, Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getAttendanceLabel, getPrimaryAttendanceStatus, isAbsent, isLate, isPresent } from '@/lib/attendance';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle, Clock, XCircle, ChevronRight, LogIn, LogOut, Users, ClipboardList, CalendarDays, MessageSquare, Sunrise, Plus,
} from 'lucide-react';
import { BatchSupplementaryModal } from '@/components/BatchSupplementaryModal';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PrincipalActionCenter } from '@/components/principal/PrincipalActionCenter';
import { WeeklyCommentBoard } from '@/components/admin/WeeklyCommentBoard';
import { ConsultFollowUpsCard } from '@/components/consult/ConsultFollowUpsCard';
import { PageTransition } from '@/components/ui/page-transition';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import { cn } from '@/lib/utils';
import { HelpTip } from '@/components/ui/help-tip';

// PRINCIPAL-HOME-V2 (2026-10-09): 스와이프 패널을 없애고 한 페이지로. 위에서 아래로
//   오늘 한 줄 요약 → 지금 처리할 것 → 상담 후속 → 오늘 수업(시간순) → 주간 코멘트 현황 → 일정·메모(접힘)
// 옛 2번째 패널(수업 기록·마감·출석 체크)은 /teacher 로 버튼 연결.
const TeamNotesBoard = lazy(() =>
  import('@/components/TeamNotesBoard').then((m) => ({ default: m.TeamNotesBoard }))
);
const AcademyCalendar = lazy(() =>
  import('@/components/AcademyCalendar').then((m) => ({ default: m.AcademyCalendar }))
);
const TeacherAttendanceView = lazy(() =>
  import('@/components/TeacherAttendanceView').then((m) => ({ default: m.TeacherAttendanceView }))
);

/* 출석 체크 (반별 등원/지각/결석) — 옛 2번째 패널에서 가져옴. 원장이 매일 쓰는 기능이라 대시보드에 둔다. */
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
function AttendanceCheckCard({ open, onToggle }: { open: boolean; onToggle: (o: boolean) => void }) {
  return (
    <details className="rounded-xl border border-primary/20 bg-card" open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="text-base font-bold cursor-pointer list-none flex items-center gap-1.5 p-3">
        <ChevronRight className={cn('w-4 h-4 transition-transform', open && 'rotate-90')} />
        <CheckCircle className="w-4 h-4 text-primary" /> 출석 체크
        <span className="ml-2 text-[11px] font-normal text-muted-foreground">반을 고르고 등원 · 지각 · 결석을 누릅니다</span>
      </summary>
      {open && (
        <div className="px-3 pb-3">
          <AttendanceErrorBoundary>
            <Suspense fallback={<DashboardSkeleton variant="list" count={3} />}>
              <TeacherAttendanceView />
            </Suspense>
          </AttendanceErrorBoundary>
        </div>
      )}
    </details>
  );
}

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
/*  Today strip — 한 줄 요약                                            */
/* ------------------------------------------------------------------ */
function nowHHMM(): string {
  const k = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}
function slotState(s: ClassroomSlot, now: string): 'active' | 'upcoming' | 'past' {
  if (s.startTime && s.endTime && now >= s.startTime && now < s.endTime) return 'active';
  if (s.endTime && now >= s.endTime) return 'past';
  return 'upcoming';
}

function Chip({ icon: Icon, label, value, tone = 'neutral', onClick, title }: {
  icon: React.ElementType; label: string; value: string; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue';
  onClick?: () => void; title?: string;
}) {
  const t = {
    neutral: 'bg-muted/50 text-foreground border-border',
    green: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
    red: 'bg-red-500/10 text-red-800 border-red-500/30',
    blue: 'bg-primary/10 text-primary border-primary/30',
  }[tone];
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${t} ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`;
  const body = (<><Icon className="w-3.5 h-3.5 shrink-0" /><span className="text-muted-foreground">{label}</span><span className="font-bold tabular-nums">{value}</span></>);
  return onClick ? <button type="button" className={cls} onClick={onClick} title={title}>{body}</button> : <span className={cls} title={title}>{body}</span>;
}

function TodayStrip({ slots, logs, onOpen }: {
  slots: ClassroomSlot[]; logs: AttendanceLog[]; onOpen: (k: 'rate' | 'late' | 'absent') => void;
}) {
  const [now, setNow] = useState(nowHHMM());
  useEffect(() => { const t = setInterval(() => setNow(nowHHMM()), 30000); return () => clearInterval(t); }, []);
  const real = slots.filter(s => s.students.length > 0);
  const planned = new Set(real.flatMap(s => s.students.map(st => st.id))).size;
  const first = real.map(s => s.startTime).filter(Boolean).sort()[0] || '';
  const last = real.map(s => s.endTime).filter(Boolean).sort().pop() || '';
  const active = real.filter(s => slotState(s, now) === 'active');
  const next = real.filter(s => slotState(s, now) === 'upcoming').sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const checkedIn = logs.filter(l => l.checked_in_at).length;
  const late = logs.filter(l => l.checked_in_at && new Date(l.checked_in_at).getMinutes() > 10).length;
  const noCheckIn = logs.filter(l => !l.checked_in_at).length;
  const beforeFirst = !!first && now < first;
  const afterLast = !!last && now >= last;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip icon={CalendarDays} label="오늘 수업" value={`${real.length}개 · ${planned}명`} />
      {real.length === 0 ? (
        <Chip icon={Sunrise} label="" value="오늘 예정 수업 없음" />
      ) : beforeFirst ? (
        <Chip icon={Sunrise} label="첫 수업" value={first} tone="blue" title="아직 수업 전이라 입실·지각은 집계하지 않습니다" />
      ) : afterLast ? (
        <Chip icon={CheckCircle} label="오늘 수업" value="종료" />
      ) : (
        <>
          <Chip icon={Users} label="진행 중" value={`${active.length}개`} tone={active.length ? 'green' : 'neutral'} />
          {next && <Chip icon={Clock} label="다음" value={`${next.startTime} ${next.className}`} />}
        </>
      )}
      {!beforeFirst && real.length > 0 && (
        <>
          <Chip icon={LogIn} label="입실" value={`${checkedIn}/${planned || logs.length}`} tone="green" onClick={() => onOpen('rate')} title="출입 태그 기준" />
          <Chip icon={Clock} label="지각" value={`${late}`} tone={late ? 'amber' : 'neutral'} onClick={() => onOpen('late')} />
          <Chip icon={XCircle} label="미입실" value={`${noCheckIn}`} tone={noCheckIn ? 'red' : 'neutral'} onClick={() => onOpen('absent')} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Today classes — 시간순 목록                                          */
/* ------------------------------------------------------------------ */
function SlotRow({ slot, state, isNext, defaultOpen }: { slot: ClassroomSlot; state: 'active' | 'upcoming' | 'past'; isNext: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const present = slot.students.filter(s => isPresent(s.status)).length;
  const absent = slot.students.filter(s => isAbsent(s.status)).length;
  const late = slot.students.filter(s => isLate(s.status)).length;
  const total = slot.students.length;
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2',
      state === 'active' && 'border-emerald-400 bg-emerald-500/5 border-l-4',
      isNext && 'border-primary/50 border-l-4',
      state === 'past' && 'opacity-60',
    )}>
      <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(v => !v)}>
        <span className="w-[88px] shrink-0 text-xs tabular-nums text-muted-foreground">{slot.startTime}~{slot.endTime}</span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium truncate">{slot.className}</span>
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{slot.subject}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">{slot.teacherName}</span>
          {state === 'active' && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">진행 중</span>}
          {isNext && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">다음</span>}
        </span>
        <span className="shrink-0 text-xs tabular-nums">
          {state === 'upcoming'
            ? <span className="text-muted-foreground">{total}명</span>
            : <span className={cn(present === total ? 'text-emerald-700' : absent ? 'text-red-700' : 'text-foreground')}>
                출석 {present}/{total}{late ? ` · 지각 ${late}` : ''}{absent ? ` · 결석 ${absent}` : ''}
              </span>}
        </span>
        <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1.5 pl-[100px] flex flex-wrap gap-x-3 gap-y-1">
          {slot.students.map(s => {
            const info = s.status ? { label: getAttendanceLabel(s.status) || s.status, color: STATUS_COLOR[s.status] || 'text-muted-foreground' } : null;
            return (
              <span key={s.id} className={cn('text-xs', info ? info.color : 'text-foreground')} title={info?.label || (state === 'upcoming' ? '수업 전' : '출결 미기록')}>
                {s.name}{info && state !== 'upcoming' ? <span className="ml-0.5 text-[10px] opacity-80">·{info.label}</span> : null}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TodayClasses({ slots }: { slots: ClassroomSlot[] }) {
  const [now, setNow] = useState(nowHHMM());
  useEffect(() => { const t = setInterval(() => setNow(nowHHMM()), 30000); return () => clearInterval(t); }, []);
  const real = slots.filter(s => s.students.length > 0).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const empty = slots.filter(s => s.students.length === 0);
  const active = real.filter(s => slotState(s, now) === 'active');
  const upcoming = real.filter(s => slotState(s, now) === 'upcoming');
  const past = real.filter(s => slotState(s, now) === 'past');
  const nextId = upcoming[0]?.scheduleId;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary" /> 오늘 수업
            {empty.length > 0 && (
              <HelpTip label="숨긴 반">
                배정 학생이 없는 반 {empty.length}개는 숨겼습니다 ({empty.map(s => `${s.startTime} ${s.className}`).slice(0, 4).join(', ')}{empty.length > 4 ? ' …' : ''}). 시간표에서 정리하면 사라집니다.
              </HelpTip>
            )}
          </h2>
          <span className="text-[11px] text-muted-foreground">진행 {active.length} · 예정 {upcoming.length} · 종료 {past.length}</span>
        </div>
        {real.length === 0 && <p className="text-xs text-muted-foreground py-1">오늘 예정된 수업이 없습니다.</p>}
        {active.map(s => <SlotRow key={s.scheduleId} slot={s} state="active" isNext={false} defaultOpen />)}
        {upcoming.slice(0, 3).map(s => <SlotRow key={s.scheduleId} slot={s} state="upcoming" isNext={s.scheduleId === nextId} defaultOpen={false} />)}
        {upcoming.length > 3 && (
          <details className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <summary className="text-xs cursor-pointer list-none flex items-center gap-1.5 text-muted-foreground">
              <ChevronRight className="w-3 h-3" /> 이후 수업 {upcoming.length - 3}개 더 보기
            </summary>
            <div className="mt-2 space-y-1.5">{upcoming.slice(3).map(s => <SlotRow key={s.scheduleId} slot={s} state="upcoming" isNext={false} defaultOpen={false} />)}</div>
          </details>
        )}
        {past.length > 0 && (
          <details className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <summary className="text-xs cursor-pointer list-none flex items-center gap-1.5 text-muted-foreground">
              <ChevronRight className="w-3 h-3" /> 끝난 수업 {past.length}개
            </summary>
            <div className="mt-2 space-y-1.5">{past.map(s => <SlotRow key={s.scheduleId} slot={s} state="past" isNext={false} defaultOpen={false} />)}</div>
          </details>
        )}
      </CardContent>
    </Card>
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
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [sideOpen, setSideOpen] = useState<boolean>(() => { try { return localStorage.getItem('principal.sideOpen') === '1'; } catch { return false; } });
  const [attOpen, setAttOpen] = useState<boolean>(() => { try { return localStorage.getItem('principal.attOpen') !== '0'; } catch { return true; } });
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
    <div className="space-y-4">
      {/* 헤더: 제목 · 시계 · 수업 관리로 가는 버튼 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold">원장 대시보드</h1>
          <p className="text-[11px] text-muted-foreground">위에서 아래로: 처리할 것 → 출석 체크 → 오늘 수업 → 주간 코멘트 → 일정·메모</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveClock />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate('/teacher')}>
            <ClipboardList className="w-4 h-4" /> 수업 기록·마감
          </Button>
        </div>
      </div>

      <PageTransition>
        <div className="space-y-4">
          {/* 오늘 한 줄 요약 — 수업 전에는 입실·지각을 보여주지 않는다 */}
          <TodayStrip slots={classroomSlots} logs={logs} onOpen={setDetailOpen} />

          {/* PRINCIPAL-ACTION-V1 — 행동이 필요한 항목만 */}
          <PrincipalActionCenter
            todayNoCheckInCount={absentCount}
            onOpenNoCheckIn={() => setDetailOpen('absent')}
          />

          {/* CONSULT-LOG-V1 — 상담 후속조치 (없으면 안 보임) */}
          <ConsultFollowUpsCard />

          {/* 출석 체크 — 반별 등원/지각/결석 (기본 펼침, 접힘 상태 기억) */}
          <AttendanceCheckCard open={attOpen} onToggle={(o) => { setAttOpen(o); try { localStorage.setItem('principal.attOpen', o ? '1' : '0'); } catch { /* ignore */ } }} />

          {/* 오늘 수업 — 시간순, 진행 중 강조, 끝난 수업·빈 반은 접힘 */}
          <TodayClasses slots={classroomSlots} />

          {/* WEEKLY-COMMENT-V2 — 전 강사 주간 코멘트 현황 (실시간) */}
          <WeeklyCommentBoard />

          {/* 일정·메모 — 기본 접힘, 열림 상태 기억 */}
          <details
            className="rounded-xl border bg-card p-3"
            open={sideOpen}
            onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setSideOpen(o); try { localStorage.setItem('principal.sideOpen', o ? '1' : '0'); } catch { /* ignore */ } }}
          >
            <summary className="text-base font-bold cursor-pointer list-none flex items-center gap-1.5">
              <ChevronRight className={cn('w-4 h-4 transition-transform', sideOpen && 'rotate-90')} />
              <CalendarDays className="w-4 h-4 text-primary" /> 원내 일정
              <span className="mx-1 text-muted-foreground">·</span>
              <MessageSquare className="w-4 h-4 text-primary" /> 코멘트/요청
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">일정 추가·메모는 여기서</span>
            </summary>
            {sideOpen && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                <Suspense fallback={<DashboardSkeleton variant="list" count={2} />}>
                  <AcademyCalendar />
                </Suspense>
                <Suspense fallback={<DashboardSkeleton variant="list" count={2} />}>
                  <TeamNotesBoard />
                </Suspense>
              </div>
            )}
          </details>

          <AttendanceDetailDialog
            kind={detailOpen}
            onClose={() => setDetailOpen(null)}
            logs={logs}
          />
        </div>
      </PageTransition>
    </div>
  );
}

export default function PrincipalDashboard() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PrincipalContent />
    </ProtectedRoute>
  );
}
