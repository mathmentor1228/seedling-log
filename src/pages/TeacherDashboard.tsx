import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import Dashboard from './Dashboard';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/ui/page-transition';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  useSensor, useSensors, PointerSensor, useDroppable, useDraggable,
  closestCenter,
} from '@dnd-kit/core';
import {
  LogOut, AlertTriangle, CalendarIcon, Clock, Loader2, GripVertical, Users,
  CheckCircle2, MapPin, FileText, Bell, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast as sonnerToast } from 'sonner';

/* ------------------------------------------------------------------ */
type StatusKey = '미등원' | '등원' | '입실' | '퇴실' | '결석지각';

interface StudentCard {
  id: string; name: string; status: StatusKey;
  school: string | null; grade: string | null;
  statusChangedAt?: string; parentPhone: string | null;
}

interface ScheduleSlot {
  id: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  classroomName: string | null;
  studentCount: number;
}

const STATUS_COLUMNS: { key: StatusKey; label: string; emoji: string; borderClass: string; dotClass: string; bgClass: string }[] = [
  { key: '미등원', label: '미등원', emoji: '⬜', borderClass: 'border-border', dotClass: 'bg-muted-foreground', bgClass: 'bg-muted/30' },
  { key: '등원', label: '등원', emoji: '🔵', borderClass: 'border-primary/30', dotClass: 'bg-primary', bgClass: 'bg-primary/5' },
  { key: '입실', label: '입실', emoji: '✅', borderClass: 'border-success/30', dotClass: 'bg-success', bgClass: 'bg-success/5' },
  { key: '퇴실', label: '퇴실', emoji: '🏠', borderClass: 'border-muted-foreground/30', dotClass: 'bg-muted-foreground', bgClass: 'bg-muted/20' },
  { key: '결석지각', label: '결석·지각', emoji: '🚨', borderClass: 'border-destructive/30', dotClass: 'bg-destructive', bgClass: 'bg-destructive/5' },
];

const ABSENCE_REASONS = ['질병/몸살', '개인사정', '가족행사', '학교시험', '무단', '직접입력'];

/* ------------------------------------------------------------------ */
function DraggableStudentCard({ student, onAbsenceClick, blink, onQuickAction, actionLoading, currentSlot }: {
  student: StudentCard; onAbsenceClick: (s: StudentCard) => void; blink: 'orange' | 'red' | null;
  onQuickAction: (studentId: string, action: StatusKey) => void; actionLoading: Set<string>;
  currentSlot: ScheduleSlot | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: student.id, data: { student },
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    transition: isDragging ? 'none' : 'all 0.2s ease',
  };
  const blinkClass = blink === 'orange'
    ? 'ring-2 ring-warning animate-pulse'
    : blink === 'red'
      ? 'ring-2 ring-destructive animate-urgent-pulse'
      : '';

  const isLoading = actionLoading.has(student.id);

  // Calculate late status
  const isLate = useMemo(() => {
    if (!currentSlot || !student.statusChangedAt || student.status !== '입실') return false;
    const entryTime = student.statusChangedAt.slice(11, 16);
    return entryTime > currentSlot.startTime;
  }, [currentSlot, student.statusChangedAt, student.status]);

  const timeDisplay = student.statusChangedAt && (student.status === '입실' || student.status === '등원' || student.status === '퇴실')
    ? new Date(student.statusChangedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  const statusLabel = student.status === '입실' ? '입실' : student.status === '퇴실' ? '퇴실' : student.status === '등원' ? '등원' : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-2.5 rounded-xl bg-card border border-border',
        'hover:border-primary/40 hover:shadow-md transition-all duration-200 group',
        blinkClass, isLoading && 'opacity-60 pointer-events-none'
      )}
    >
      <div className="flex items-center gap-2">
        <div className="cursor-grab active:cursor-grabbing shrink-0" {...attributes} {...listeners}>
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary/60 transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-foreground truncate">{student.name}</p>
            {timeDisplay && (
              <span className={cn(
                "text-[9px] tabular-nums px-1.5 py-0.5 rounded-full font-medium",
                isLate ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
              )}>
                {statusLabel} {timeDisplay}{isLate && ' 지각'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{student.school || ''} {student.grade || ''}</p>
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
        {student.status === '미등원' && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onQuickAction(student.id, '입실'); }}
              className="text-[9px] px-2 py-1 rounded-md bg-success/10 text-success border border-success/30 hover:bg-success/20 font-medium transition-colors">
              ⏰입실
            </button>
            <button onClick={(e) => { e.stopPropagation(); onQuickAction(student.id, '등원'); }}
              className="text-[9px] px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 font-medium transition-colors">
              ✅출석
            </button>
            <button onClick={(e) => { e.stopPropagation(); onAbsenceClick(student); }}
              className="text-[9px] px-2 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 font-medium transition-colors">
              ❌결석
            </button>
          </>
        )}
        {student.status === '등원' && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onQuickAction(student.id, '입실'); }}
              className="text-[9px] px-2 py-1 rounded-md bg-success/10 text-success border border-success/30 hover:bg-success/20 font-medium transition-colors">
              ⏰입실
            </button>
            <button onClick={(e) => { e.stopPropagation(); onAbsenceClick(student); }}
              className="text-[9px] px-2 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 font-medium transition-colors">
              ❌결석
            </button>
          </>
        )}
        {student.status === '입실' && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onQuickAction(student.id, '퇴실'); }}
              className="text-[9px] px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border hover:bg-muted/80 font-medium transition-colors">
              🏠퇴실
            </button>
            <button onClick={(e) => { e.stopPropagation(); onQuickAction(student.id, '결석지각'); }}
              className="text-[9px] px-2 py-1 rounded-md bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 font-medium transition-colors">
              🚨무단외출
            </button>
          </>
        )}
        {student.status === '퇴실' && (
          <button onClick={(e) => { e.stopPropagation(); onQuickAction(student.id, '입실'); }}
            className="text-[9px] px-2 py-1 rounded-md bg-success/10 text-success border border-success/30 hover:bg-success/20 font-medium transition-colors">
            ⏰재입실
          </button>
        )}
        {student.status === '결석지각' && (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onAbsenceClick(student); }}>
            처리
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function StatusColumn({ col, students, onAbsenceClick, blinkMap, onQuickAction, actionLoading, currentSlot }: {
  col: typeof STATUS_COLUMNS[0]; students: StudentCard[];
  onAbsenceClick: (s: StudentCard) => void; blinkMap: Map<string, 'orange' | 'red'>;
  onQuickAction: (studentId: string, action: StatusKey) => void; actionLoading: Set<string>;
  currentSlot: ScheduleSlot | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-2xl border-2 p-3 min-h-[220px] flex flex-col transition-all duration-300',
        col.borderClass, col.bgClass,
        isOver && 'ring-2 ring-primary/50 bg-primary/10 scale-[1.01] shadow-lg'
      )}
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
        <span className="text-sm">{col.emoji}</span>
        <h3 className="text-xs font-bold text-foreground">{col.label}</h3>
        <Badge variant="secondary" className="ml-auto text-[10px] font-bold px-2 py-0.5">{students.length}명</Badge>
      </div>
      <div className="flex-1 space-y-1.5">
        {students.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-8 opacity-50">학생 없음</p>
        )}
        {students.map(s => (
          <DraggableStudentCard key={s.id} student={s} onAbsenceClick={onAbsenceClick} blink={blinkMap.get(s.id) ?? null}
            onQuickAction={onQuickAction} actionLoading={actionLoading} currentSlot={currentSlot} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function AlertBanner({ orangeAlerts, redAlerts }: { orangeAlerts: string[]; redAlerts: string[] }) {
  if (orangeAlerts.length === 0 && redAlerts.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {orangeAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning/10 border border-warning/30 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-xs text-warning">
            <span className="font-semibold">등원 지연:</span> {orangeAlerts.join(', ')} — 수업 시작 후 5분 이상 등원 상태
          </p>
        </div>
      )}
      {redAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/30 animate-urgent-pulse">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">
            <span className="font-semibold">퇴실 지연:</span> {redAlerts.join(', ')} — 수업 종료 후에도 입실 상태
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function AbsenceModal({ student, open, onClose, teacherId }: {
  student: StudentCard | null; open: boolean; onClose: () => void; teacherId: string;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('질병/몸살');
  const [customReason, setCustomReason] = useState('');
  const [journalText, setJournalText] = useState('');
  const [makeupDate, setMakeupDate] = useState<Date | undefined>();
  const [makeupTime, setMakeupTime] = useState('16:00');
  const [deferMakeup, setDeferMakeup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setStep(1); setReason('질병/몸살'); setCustomReason(''); setDeferMakeup(false); setMakeupDate(undefined); setMakeupTime('16:00'); setSubmitting(false); }
  }, [open]);

  useEffect(() => {
    if (step === 2 && student) {
      const r = reason === '직접입력' ? customReason : reason;
      setJournalText(`${student.name} 학생 ${r}(으)로 인한 결석. 보강 예정.`);
    }
  }, [step, student, reason, customReason]);

  const effectiveReason = reason === '직접입력' ? customReason : reason;

  const handleComplete = async () => {
    if (!student) return;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('attendance_logs').insert({ student_id: student.id, student_name: student.name, date: today, recorded_by: teacherId });
      await supabase.from('lesson_records').insert({
        student_id: student.id, teacher_id: teacherId, lesson_date: today, lesson_range: journalText,
        homework_status: 'none', submitted: true, submitted_at: new Date().toISOString(),
        attendance_status: ['결석'], notes: `결석 사유: ${effectiveReason}`, lesson_types: ['결석처리'], subject: '수학' as any,
      });
      if (student.parentPhone) {
        const makeupInfo = deferMakeup ? '보강 일정은 추후 안내드리겠습니다.' : makeupDate ? `보강 일정: ${format(makeupDate, 'yyyy-MM-dd')} ${makeupTime}` : '보강 일정은 추후 안내드리겠습니다.';
        await supabase.from('parent_notifications').insert({
          parent_phone: student.parentPhone, student_id: student.id,
          message: `[THE Mentor] ${student.name} 학생이 ${effectiveReason}(으)로 금일 결석하였습니다. ${makeupInfo}`, type: 'absence',
        });
      }
      toast({ title: '✅ 모든 처리 완료!', description: '학부모 알림 발송됨' });
      onClose();
    } catch { toast({ title: '오류', description: '처리 중 오류가 발생했습니다.', variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && `결석 처리 — ${student.name}`}
            {step === 2 && '수업일지 연동'}
            {step === 3 && '보강 일정'}
          </DialogTitle>
          <div className="flex gap-1 pt-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">결석 사유를 선택해주세요</p>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {ABSENCE_REASONS.map(r => (
                <div key={r} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors">
                  <RadioGroupItem value={r} id={r} />
                  <Label htmlFor={r} className="text-xs cursor-pointer">{r}</Label>
                </div>
              ))}
            </RadioGroup>
            {reason === '직접입력' && (
              <Input placeholder="사유를 직접 입력해주세요" value={customReason} onChange={e => setCustomReason(e.target.value)} className="text-xs" />
            )}
            <DialogFooter>
              <Button onClick={() => setStep(2)} disabled={reason === '직접입력' && !customReason.trim()} className="w-full" size="sm">다음</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-success"><span>✅</span> 출결: 결석 체크 완료</div>
              <div className="flex items-center gap-2 text-xs text-success"><span>✅</span> 사유: {effectiveReason} 기록 완료</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">수업일지 내용 (수정 가능)</Label>
              <Textarea value={journalText} onChange={e => setJournalText(e.target.value)} rows={3} className="text-xs resize-none" />
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>이전</Button>
              <Button onClick={() => setStep(3)} className="flex-1" size="sm">다음</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            {!deferMakeup ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">보강 날짜</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left text-xs", !makeupDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {makeupDate ? format(makeupDate, 'yyyy-MM-dd') : '날짜 선택'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={makeupDate} onSelect={setMakeupDate} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">보강 시간</Label>
                  <Input type="time" value={makeupTime} onChange={e => setMakeupTime(e.target.value)} className="text-xs" />
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs text-muted-foreground">📌 보강 일정은 추후 안내 예정으로 처리됩니다</p>
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setDeferMakeup(!deferMakeup)}>
              {deferMakeup ? '📅 보강 일정 직접 입력' : '📌 추후 안내예정으로 처리'}
            </Button>
            <DialogFooter className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>이전</Button>
              <Button onClick={handleComplete} disabled={submitting || (!deferMakeup && !makeupDate)} className="flex-1 bg-success hover:bg-success/90 text-success-foreground" size="sm">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                완료 및 일지 제출
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="text-right hidden sm:block">
      <p className="text-xs text-muted-foreground">{now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
      <p className="text-sm font-mono font-bold text-foreground tabular-nums">{now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TIME SLOT NAVIGATION */
function TimeSlotNav({ slots, activeSlot, onSelect }: {
  slots: ScheduleSlot[]; activeSlot: string | null; onSelect: (id: string) => void;
}) {
  const [nowStr, setNowStr] = useState('');
  useEffect(() => {
    const update = () => {
      const n = new Date();
      setNowStr(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, []);

  const isCurrent = (start: string, end: string) => nowStr >= start && nowStr <= end;

  if (slots.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {slots.map(slot => {
        const current = isCurrent(slot.startTime, slot.endTime);
        const active = activeSlot === slot.id;
        return (
          <button
            key={slot.id}
            onClick={() => onSelect(slot.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 border shrink-0',
              active
                ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]'
                : current
                  ? 'bg-primary/15 text-primary border-primary/30 shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/30 hover:bg-primary/5'
            )}
          >
            {current && <Sparkles className="w-3 h-3" />}
            <span>{slot.startTime}~{slot.endTime}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CURRENT CLASS HEADER */
function CurrentClassHeader({ slot, attendedCount, totalCount }: {
  slot: ScheduleSlot | null; attendedCount: number; totalCount: number;
}) {
  if (!slot) return null;
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">현재 수업:</span>
          <span className="text-sm text-foreground">{slot.startTime}~{slot.endTime}</span>
          <Badge variant="secondary" className="text-[10px]">{slot.subject}</Badge>
          <span className="text-xs text-muted-foreground">{slot.className}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {slot.classroomName && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {slot.classroomName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {attendedCount}/{totalCount}명 출석
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function TeacherAttendanceView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const teacherId = user?.id ?? '';

  const [students, setStudents] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [absenceTarget, setAbsenceTarget] = useState<StudentCard | null>(null);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Fetch schedule slots for this teacher today
  const fetchSchedule = useCallback(async () => {
    const dow = new Date().getDay(); // 0=Sun
    const { data: schedules } = await supabase
      .from('class_schedules')
      .select('id, start_time, end_time, class_id, classroom_id, classes(name, subject), classrooms(name)')
      .eq('teacher_id', teacherId)
      .eq('day_of_week', dow)
      .eq('is_active', true)
      .order('start_time');

    if (schedules && schedules.length > 0) {
      const slots: ScheduleSlot[] = schedules.map((s: any) => ({
        id: s.id,
        className: s.classes?.name || '',
        subject: s.classes?.subject || '',
        startTime: s.start_time?.slice(0, 5) || '',
        endTime: s.end_time?.slice(0, 5) || '',
        classroomName: s.classrooms?.name || null,
        studentCount: 0,
      }));
      setScheduleSlots(slots);

      // Auto-select current slot
      const nowH = new Date().getHours();
      const nowM = new Date().getMinutes();
      const nowStr = `${String(nowH).padStart(2, '0')}:${String(nowM).padStart(2, '0')}`;
      const currentSlot = slots.find(sl => nowStr >= sl.startTime && nowStr <= sl.endTime);
      setActiveSlot(currentSlot?.id || slots[0]?.id || null);
    }
  }, [teacherId]);

  const fetchStudents = useCallback(async () => {
    const { data: classes } = await supabase.from('classes').select('id').eq('teacher_id', teacherId);
    if (!classes || classes.length === 0) { setStudents([]); setLoading(false); return; }

    const classIds = classes.map(c => c.id);
    const { data: cs } = await supabase.from('class_students').select('student_id').in('class_id', classIds);
    const studentIds = [...new Set(cs?.map(r => r.student_id) ?? [])];
    if (studentIds.length === 0) { setStudents([]); setLoading(false); return; }

    const [studentRes, logRes] = await Promise.all([
      supabase.from('students').select('id, name, status, school, grade, parent_phone').in('id', studentIds).neq('enrollment_status', '퇴원'),
      supabase.from('attendance_logs').select('student_id, checked_in_at, checked_out_at').in('student_id', studentIds).eq('date', today),
    ]);

    const logMap = new Map<string, { checked_in_at: string | null; checked_out_at: string | null }>();
    (logRes.data ?? []).forEach(l => { if (l.student_id) logMap.set(l.student_id, l); });

    const mapped: StudentCard[] = (studentRes.data ?? []).map(s => {
      const log = logMap.get(s.id);
      let status: StatusKey = '미등원';
      let statusChangedAt: string | undefined;
      if (s.status === '결석' || s.status === '지각' || s.status === '결석지각') { status = '결석지각'; }
      else if (log?.checked_out_at) { status = '퇴실'; statusChangedAt = log.checked_out_at; }
      else if (log?.checked_in_at) { status = '입실'; statusChangedAt = log.checked_in_at; }
      else if (s.status === '등원') { status = '등원'; }
      return { id: s.id, name: s.name, status, school: s.school, grade: s.grade, statusChangedAt, parentPhone: s.parent_phone };
    });
    setStudents(mapped);
    setLoading(false);
  }, [teacherId, today]);

  useEffect(() => { if (teacherId) { fetchStudents(); fetchSchedule(); } }, [teacherId, fetchStudents, fetchSchedule]);

  useEffect(() => {
    if (!teacherId) return;
    const ch = supabase.channel('teacher-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchStudents())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => fetchStudents())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teacherId, fetchStudents]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t); }, []);

  const blinkMap = useMemo(() => {
    const m = new Map<string, 'orange' | 'red'>();
    students.forEach(s => {
      if (s.status === '등원' && s.statusChangedAt && (now - new Date(s.statusChangedAt).getTime()) / 60000 >= 5) m.set(s.id, 'orange');
      if (s.status === '입실' && s.statusChangedAt && (now - new Date(s.statusChangedAt).getTime()) / 60000 >= 120) m.set(s.id, 'red');
    });
    return m;
  }, [students, now]);

  const orangeAlerts = students.filter(s => blinkMap.get(s.id) === 'orange').map(s => s.name);
  const redAlerts = students.filter(s => blinkMap.get(s.id) === 'red').map(s => s.name);

  const grouped = useMemo(() => {
    const m: Record<StatusKey, StudentCard[]> = { '미등원': [], '등원': [], '입실': [], '퇴실': [], '결석지각': [] };
    students.forEach(s => m[s.status].push(s));
    return m;
  }, [students]);

  const currentSlot = useMemo(() => scheduleSlots.find(s => s.id === activeSlot) || null, [scheduleSlots, activeSlot]);
  const attendedCount = grouped['입실'].length + grouped['퇴실'].length;

  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const studentId = active.id as string;
    const overElement = over.id as string;
    let targetStatus: StatusKey | null = null;
    STATUS_COLUMNS.forEach(col => { if (overElement === col.key) targetStatus = col.key; });
    if (!targetStatus) { const overStudent = students.find(s => s.id === overElement); if (overStudent) targetStatus = overStudent.status; }
    if (!targetStatus) return;
    const student = students.find(s => s.id === studentId);
    if (!student || student.status === targetStatus) return;

    // Optimistic update
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status: targetStatus! } : s));
    const dbStatus = targetStatus === '결석지각' ? '결석' : targetStatus;
    await supabase.from('students').update({ status: dbStatus } as any).eq('id', studentId);

    const nowIso = new Date().toISOString();
    if (targetStatus === '입실' || targetStatus === '퇴실') {
      const { data: existing } = await supabase.from('attendance_logs').select('id').eq('student_id', studentId).eq('date', today).limit(1);
      if (targetStatus === '입실') {
        if (existing?.length) await supabase.from('attendance_logs').update({ checked_in_at: nowIso }).eq('id', existing[0].id);
        else await supabase.from('attendance_logs').insert({ student_id: studentId, student_name: student.name, date: today, checked_in_at: nowIso, recorded_by: teacherId });
      } else {
        if (existing?.length) await supabase.from('attendance_logs').update({ checked_out_at: nowIso }).eq('id', existing[0].id);
        else await supabase.from('attendance_logs').insert({ student_id: studentId, student_name: student.name, date: today, checked_in_at: nowIso, checked_out_at: nowIso, recorded_by: teacherId });
      }
    } else if (targetStatus === '결석지각') { setAbsenceTarget(student); }

    sonnerToast.success(`${student.name} → ${targetStatus}`, { duration: 2000 });
  };

  const handleQuickAction = useCallback(async (studentId: string, action: StatusKey) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    if (action === '결석지각') { setAbsenceTarget(student); return; }

    setActionLoading(prev => new Set(prev).add(studentId));
    const nowIso = new Date().toISOString();

    // Optimistic update
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status: action, statusChangedAt: nowIso } : s));
    const dbStatus = (action as string) === '결석지각' ? '결석' : action;
    await supabase.from('students').update({ status: dbStatus } as any).eq('id', studentId);

    if (action === '입실' || action === '퇴실') {
      const { data: existing } = await supabase.from('attendance_logs').select('id').eq('student_id', studentId).eq('date', today).limit(1);
      if (action === '입실') {
        if (existing?.length) await supabase.from('attendance_logs').update({ checked_in_at: nowIso }).eq('id', existing[0].id);
        else await supabase.from('attendance_logs').insert({ student_id: studentId, student_name: student.name, date: today, checked_in_at: nowIso, recorded_by: teacherId });
      } else {
        if (existing?.length) await supabase.from('attendance_logs').update({ checked_out_at: nowIso }).eq('id', existing[0].id);
        else await supabase.from('attendance_logs').insert({ student_id: studentId, student_name: student.name, date: today, checked_in_at: nowIso, checked_out_at: nowIso, recorded_by: teacherId });
      }
    }

    setActionLoading(prev => { const s = new Set(prev); s.delete(studentId); return s; });
    sonnerToast.success(`${student.name} → ${action}`, { duration: 2000 });
  }, [students, today, teacherId]);

  const handleMarkAllPresent = async () => {
    const pendingStudents = students.filter(s => s.status === '미등원' || s.status === '등원');
    if (pendingStudents.length === 0) { toast({ title: '전원 출석 상태입니다', description: '미등원/등원 학생이 없습니다.' }); return; }
    setMarkingAll(true);
    const nowIso = new Date().toISOString();

    // Optimistic
    setStudents(prev => prev.map(s =>
      (s.status === '미등원' || s.status === '등원') ? { ...s, status: '입실' as StatusKey, statusChangedAt: nowIso } : s
    ));

    for (const s of pendingStudents) {
      await supabase.from('students').update({ status: '입실' } as any).eq('id', s.id);
      const { data: existing } = await supabase.from('attendance_logs').select('id').eq('student_id', s.id).eq('date', today).limit(1);
      if (existing?.length) await supabase.from('attendance_logs').update({ checked_in_at: nowIso }).eq('id', existing[0].id);
      else await supabase.from('attendance_logs').insert({ student_id: s.id, student_name: s.name, date: today, checked_in_at: nowIso, recorded_by: teacherId });
    }
    setMarkingAll(false);
    sonnerToast.success(`${pendingStudents.length}명 전체 출석 처리 완료`);
  };

  const activeStudent = students.find(s => s.id === activeId);
  if (loading) {
    return (
      <div className="dark min-h-screen bg-background p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        <DashboardSkeleton variant="stats" />
        <DashboardSkeleton variant="list" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current class header */}
      <CurrentClassHeader slot={currentSlot} attendedCount={attendedCount} totalCount={students.length} />

      {/* Time slot navigation */}
      {scheduleSlots.length > 0 && (
        <TimeSlotNav slots={scheduleSlots} activeSlot={activeSlot} onSelect={setActiveSlot} />
      )}

      <AlertBanner orangeAlerts={orangeAlerts} redAlerts={redAlerts} />

      {/* Summary counters */}
      <div className="grid grid-cols-5 gap-2 md:gap-3">
        {STATUS_COLUMNS.map(col => (
          <Card key={col.key} className={cn('border-2 transition-all duration-200 hover:shadow-md', col.borderClass)}>
            <CardContent className="p-3 text-center">
              <span className="text-lg">{col.emoji}</span>
              <p className="text-xl font-extrabold text-foreground mt-1">{grouped[col.key].length}</p>
              <p className="text-[10px] text-muted-foreground font-medium">{col.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-success/30 text-success hover:bg-success/10 hover:border-success/50 transition-all"
          onClick={handleMarkAllPresent}
          disabled={markingAll}
        >
          {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          전체 출석 처리
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all"
          onClick={() => navigate('/lessons')}
        >
          <FileText className="w-3.5 h-3.5" />
          출결 보고서 생성
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-warning/30 text-warning hover:bg-warning/10 hover:border-warning/50 transition-all"
          onClick={() => sonnerToast.info('학부모 알림 발송 기능은 출결 보고서에서 이용해주세요')}
        >
          <Bell className="w-3.5 h-3.5" />
          학부모 알림 발송
        </Button>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title="배정된 학생이 없습니다" description="수업에 학생이 배정되면 여기에 출결 보드가 표시됩니다" />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
            {STATUS_COLUMNS.map(col => (
              <StatusColumn key={col.key} col={col} students={grouped[col.key]} onAbsenceClick={s => setAbsenceTarget(s)} blinkMap={blinkMap}
                onQuickAction={handleQuickAction} actionLoading={actionLoading} currentSlot={currentSlot} />
            ))}
          </div>
          <DragOverlay>
            {activeStudent && (
              <div className="p-3 rounded-xl bg-primary/20 border-2 border-primary/50 shadow-2xl max-w-[200px] backdrop-blur-sm">
                <p className="text-xs font-bold text-foreground">{activeStudent.name}</p>
                <p className="text-[10px] text-muted-foreground">{activeStudent.school} {activeStudent.grade}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <AbsenceModal student={absenceTarget} open={!!absenceTarget} onClose={() => setAbsenceTarget(null)} teacherId={teacherId} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side-by-Side Teacher Layout                                         */
/* ------------------------------------------------------------------ */
const TEACHER_TABS = ['📊 수업 관리', '📋 출결 현황'] as const;

function TeacherSideBySide() {
  const [mobileTab, setMobileTab] = useState<number>(0);
  const [attendanceOpen, setAttendanceOpen] = useState(true);

  return (
    <div className="space-y-3">
      {/* Mobile tab bar - only visible on small screens */}
      <div className="flex lg:hidden justify-center gap-2">
        {TEACHER_TABS.map((label, i) => (
          <button
            key={i}
            onClick={() => setMobileTab(i)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
              mobileTab === i
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Desktop: side-by-side | Mobile: tab-switched */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* LEFT: 수업 관리 (Dashboard) - 60% on desktop */}
        <div className={cn(
          "lg:w-[60%] min-w-0",
          mobileTab !== 0 && "hidden lg:block"
        )}>
          <Dashboard />
        </div>

        {/* RIGHT: 출결 현황 (Attendance) - 40% on desktop */}
        <div className={cn(
          "lg:w-[40%] min-w-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto",
          mobileTab !== 1 && "hidden lg:block"
        )}>
          <Card className="border-primary/20">
            <button
              onClick={() => setAttendanceOpen(prev => !prev)}
              className="w-full flex items-center justify-between p-4 text-left lg:cursor-default"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <h2 className="text-sm font-bold text-foreground">출결 현황</h2>
              </div>
              <LiveClock />
            </button>
            <CardContent className="pt-0 px-3 pb-4">
              <TeacherAttendanceView />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function TeacherDashboard() {
  return (
    <ProtectedRoute allowedRoles={['teacher']}>
      <TeacherSideBySide />
    </ProtectedRoute>
  );
}
