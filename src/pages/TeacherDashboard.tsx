import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  useSensor, useSensors, PointerSensor, useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import {
  LogOut, AlertTriangle, CalendarIcon, Clock, Loader2, GripVertical,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type StatusKey = '미등원' | '등원' | '입실' | '퇴실' | '결석지각';

interface StudentCard {
  id: string;
  name: string;
  status: StatusKey;
  school: string | null;
  grade: string | null;
  statusChangedAt?: string; // ISO timestamp of last status change
  parentPhone: string | null;
}

const STATUS_COLUMNS: { key: StatusKey; label: string; color: string; dotColor: string }[] = [
  { key: '미등원', label: '미등원', color: 'border-gray-700 bg-gray-900/50', dotColor: 'bg-gray-500' },
  { key: '등원', label: '등원', color: 'border-blue-800 bg-blue-950/30', dotColor: 'bg-blue-400' },
  { key: '입실', label: '입실', color: 'border-emerald-800 bg-emerald-950/30', dotColor: 'bg-emerald-400' },
  { key: '퇴실', label: '퇴실', color: 'border-violet-800 bg-violet-950/30', dotColor: 'bg-violet-400' },
  { key: '결석지각', label: '결석·지각', color: 'border-red-800 bg-red-950/30', dotColor: 'bg-red-400' },
];

const ABSENCE_REASONS = [
  '질병/몸살', '개인사정', '가족행사', '학교시험', '무단', '직접입력',
];

/* ------------------------------------------------------------------ */
/*  Draggable Student Card                                             */
/* ------------------------------------------------------------------ */
function DraggableStudentCard({ student, onAbsenceClick, blink }: {
  student: StudentCard;
  onAbsenceClick: (s: StudentCard) => void;
  blink: 'orange' | 'red' | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: student.id,
    data: { student },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const blinkClass = blink === 'orange'
    ? 'ring-2 ring-amber-400 animate-pulse'
    : blink === 'red'
      ? 'ring-2 ring-red-500 animate-pulse'
      : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2.5 rounded-lg bg-white/[0.06] border border-white/10 cursor-grab active:cursor-grabbing
        hover:bg-white/[0.1] transition-colors group ${blinkClass}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-gray-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{student.name}</p>
          <p className="text-[10px] text-gray-500">
            {student.school || ''} {student.grade || ''}
          </p>
        </div>
        {(student.status === '결석지각') && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
            onClick={(e) => { e.stopPropagation(); onAbsenceClick(student); }}
          >
            처리
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Droppable Column                                                   */
/* ------------------------------------------------------------------ */
function StatusColumn({ col, students, onAbsenceClick, blinkMap }: {
  col: typeof STATUS_COLUMNS[0];
  students: StudentCard[];
  onAbsenceClick: (s: StudentCard) => void;
  blinkMap: Map<string, 'orange' | 'red'>;
}) {
  return (
    <div className={`rounded-xl border ${col.color} p-3 min-h-[200px] flex flex-col`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
        <h3 className="text-xs font-semibold text-gray-300">{col.label}</h3>
        <Badge variant="outline" className="ml-auto text-[10px] border-white/10 text-gray-500">
          {students.length}
        </Badge>
      </div>
      <div className="flex-1 space-y-2">
        {students.map(s => (
          <DraggableStudentCard
            key={s.id}
            student={s}
            onAbsenceClick={onAbsenceClick}
            blink={blinkMap.get(s.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Alert Banner                                                       */
/* ------------------------------------------------------------------ */
function AlertBanner({ orangeAlerts, redAlerts }: { orangeAlerts: string[]; redAlerts: string[] }) {
  if (orangeAlerts.length === 0 && redAlerts.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {orangeAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">등원 지연:</span> {orangeAlerts.join(', ')} — 수업 시작 후 5분 이상 등원 상태
          </p>
        </div>
      )}
      {redAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">
            <span className="font-semibold">퇴실 지연:</span> {redAlerts.join(', ')} — 수업 종료 후에도 입실 상태
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  3-Step Absence Modal                                               */
/* ------------------------------------------------------------------ */
function AbsenceModal({ student, open, onClose, teacherId }: {
  student: StudentCard | null;
  open: boolean;
  onClose: () => void;
  teacherId: string;
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

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setReason('질병/몸살');
      setCustomReason('');
      setDeferMakeup(false);
      setMakeupDate(undefined);
      setMakeupTime('16:00');
      setSubmitting(false);
    }
  }, [open]);

  // Build journal text when moving to step 2
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

      // 1. Create attendance log
      await supabase.from('attendance_logs').insert({
        student_id: student.id,
        student_name: student.name,
        date: today,
        recorded_by: teacherId,
      });

      // 2. Create lesson record (journal) entry
      await supabase.from('lesson_records').insert({
        student_id: student.id,
        teacher_id: teacherId,
        lesson_date: today,
        lesson_range: journalText,
        homework_status: 'none',
        submitted: true,
        submitted_at: new Date().toISOString(),
        attendance_status: ['결석'],
        notes: `결석 사유: ${effectiveReason}`,
        lesson_types: ['결석처리'],
        subject: '수학' as any, // default subject
      });

      // 3. Parent notification
      if (student.parentPhone) {
        const makeupInfo = deferMakeup
          ? '보강 일정은 추후 안내드리겠습니다.'
          : makeupDate
            ? `보강 일정: ${format(makeupDate, 'yyyy-MM-dd')} ${makeupTime}`
            : '보강 일정은 추후 안내드리겠습니다.';

        await supabase.from('parent_notifications').insert({
          parent_phone: student.parentPhone,
          student_id: student.id,
          message: `[SeedlingLog] ${student.name} 학생이 ${effectiveReason}(으)로 금일 결석하였습니다. ${makeupInfo}`,
          type: 'absence',
        });
      }

      toast({
        title: '✅ 모든 처리 완료!',
        description: '학부모 알림 발송됨',
      });
      onClose();
    } catch (err) {
      toast({ title: '오류', description: '처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="bg-[#12121a] border-white/10 text-gray-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {step === 1 && `결석 처리 — ${student.name}`}
            {step === 2 && '수업일지 연동'}
            {step === 3 && '보강 일정'}
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex gap-1 pt-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-white/10'}`} />
            ))}
          </div>
        </DialogHeader>

        {/* STEP 1: Reason */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-gray-400">결석 사유를 선택해주세요</p>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {ABSENCE_REASONS.map(r => (
                <div key={r} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <RadioGroupItem value={r} id={r} className="border-gray-600 text-blue-400" />
                  <Label htmlFor={r} className="text-xs text-gray-300 cursor-pointer">{r}</Label>
                </div>
              ))}
            </RadioGroup>
            {reason === '직접입력' && (
              <Input
                placeholder="사유를 직접 입력해주세요"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                className="bg-white/5 border-white/10 text-white text-xs"
              />
            )}
            <DialogFooter>
              <Button
                onClick={() => setStep(2)}
                disabled={reason === '직접입력' && !customReason.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="sm"
              >
                다음
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 2: Journal link */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span>✅</span> 출결: 결석 체크 완료
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span>✅</span> 사유: {effectiveReason} 기록 완료
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-400">수업일지 내용 (수정 가능)</Label>
              <Textarea
                value={journalText}
                onChange={e => setJournalText(e.target.value)}
                rows={3}
                className="bg-white/5 border-white/10 text-white text-xs resize-none"
              />
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-gray-400">이전</Button>
              <Button onClick={() => setStep(3)} className="flex-1 bg-blue-600 hover:bg-blue-700" size="sm">
                다음
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 3: Makeup schedule */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            {!deferMakeup ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">보강 날짜</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left bg-white/5 border-white/10 text-white text-xs",
                          !makeupDate && "text-gray-500"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {makeupDate ? format(makeupDate, 'yyyy-MM-dd') : '날짜 선택'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-[#1a1a2e] border-white/10" align="start">
                      <Calendar
                        mode="single"
                        selected={makeupDate}
                        onSelect={setMakeupDate}
                        className={cn("p-3 pointer-events-auto text-white")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">보강 시간</Label>
                  <Input
                    type="time"
                    value={makeupTime}
                    onChange={e => setMakeupTime(e.target.value)}
                    className="bg-white/5 border-white/10 text-white text-xs"
                  />
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs text-gray-400">📌 보강 일정은 추후 안내 예정으로 처리됩니다</p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-white/10 text-gray-300 hover:bg-white/5"
              onClick={() => setDeferMakeup(!deferMakeup)}
            >
              {deferMakeup ? '📅 보강 일정 직접 입력' : '📌 추후 안내예정으로 처리'}
            </Button>

            <DialogFooter className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="text-gray-400">이전</Button>
              <Button
                onClick={handleComplete}
                disabled={submitting || (!deferMakeup && !makeupDate)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                size="sm"
              >
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
/*  Live Clock                                                         */
/* ------------------------------------------------------------------ */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <p className="text-xs text-gray-400">
        {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
      <p className="text-sm font-mono font-bold text-white tabular-nums">
        {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Teacher Dashboard Content                                          */
/* ------------------------------------------------------------------ */
function TeacherContent() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const teacherId = user?.id ?? '';
  const teacherName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '선생님';

  const [students, setStudents] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [absenceTarget, setAbsenceTarget] = useState<StudentCard | null>(null);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /* ---------- fetch students ---------- */
  const fetchStudents = useCallback(async () => {
    // Get teacher's students through class_students → classes
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacherId);

    if (!classes || classes.length === 0) {
      setStudents([]);
      setLoading(false);
      return;
    }

    const classIds = classes.map(c => c.id);
    const { data: cs } = await supabase
      .from('class_students')
      .select('student_id')
      .in('class_id', classIds);

    const studentIds = [...new Set(cs?.map(r => r.student_id) ?? [])];
    if (studentIds.length === 0) {
      setStudents([]);
      setLoading(false);
      return;
    }

    const { data: studentData } = await supabase
      .from('students')
      .select('id, name, status, school, grade, parent_phone')
      .in('id', studentIds)
      .neq('enrollment_status', '퇴원');

    // Also fetch today's attendance logs for these students
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('student_id, checked_in_at, checked_out_at')
      .in('student_id', studentIds)
      .eq('date', today);

    const logMap = new Map<string, { checked_in_at: string | null; checked_out_at: string | null }>();
    (logs ?? []).forEach(l => {
      if (l.student_id) logMap.set(l.student_id, l);
    });

    const mapped: StudentCard[] = (studentData ?? []).map(s => {
      const log = logMap.get(s.id);
      let status: StatusKey = '미등원';
      let statusChangedAt: string | undefined;

      // Derive status from logs & students.status
      if (s.status === '결석' || s.status === '지각' || s.status === '결석지각') {
        status = '결석지각';
      } else if (log?.checked_out_at) {
        status = '퇴실';
        statusChangedAt = log.checked_out_at;
      } else if (log?.checked_in_at) {
        status = '입실';
        statusChangedAt = log.checked_in_at;
      } else if (s.status === '등원') {
        status = '등원';
      }

      return {
        id: s.id,
        name: s.name,
        status,
        school: s.school,
        grade: s.grade,
        statusChangedAt,
        parentPhone: s.parent_phone,
      };
    });

    setStudents(mapped);
    setLoading(false);
  }, [teacherId, today]);

  useEffect(() => { if (teacherId) fetchStudents(); }, [teacherId, fetchStudents]);

  /* ---------- real-time ---------- */
  useEffect(() => {
    if (!teacherId) return;
    const ch = supabase
      .channel('teacher-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => fetchStudents())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => fetchStudents())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teacherId, fetchStudents]);

  /* ---------- blink alerts ---------- */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const blinkMap = useMemo(() => {
    const m = new Map<string, 'orange' | 'red'>();
    students.forEach(s => {
      if (s.status === '등원' && s.statusChangedAt) {
        const diff = (now - new Date(s.statusChangedAt).getTime()) / 60000;
        if (diff >= 5) m.set(s.id, 'orange');
      }
      if (s.status === '입실' && s.statusChangedAt) {
        // If checked in more than 120 min ago (proxy for after class end)
        const diff = (now - new Date(s.statusChangedAt).getTime()) / 60000;
        if (diff >= 120) m.set(s.id, 'red');
      }
    });
    return m;
  }, [students, now]);

  const orangeAlerts = students.filter(s => blinkMap.get(s.id) === 'orange').map(s => s.name);
  const redAlerts = students.filter(s => blinkMap.get(s.id) === 'red').map(s => s.name);

  /* ---------- group by status ---------- */
  const grouped = useMemo(() => {
    const m: Record<StatusKey, StudentCard[]> = {
      '미등원': [], '등원': [], '입실': [], '퇴실': [], '결석지각': [],
    };
    students.forEach(s => m[s.status].push(s));
    return m;
  }, [students]);

  /* ---------- DnD handlers ---------- */
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const studentId = active.id as string;
    const overElement = over.id as string;

    // Determine target column
    let targetStatus: StatusKey | null = null;
    STATUS_COLUMNS.forEach(col => {
      if (overElement === col.key) targetStatus = col.key;
    });

    // If dropped over another student, find their column
    if (!targetStatus) {
      const overStudent = students.find(s => s.id === overElement);
      if (overStudent) targetStatus = overStudent.status;
    }

    if (!targetStatus) return;

    const student = students.find(s => s.id === studentId);
    if (!student || student.status === targetStatus) return;

    // Optimistic update
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status: targetStatus! } : s));

    // Map status to DB value
    const dbStatus = targetStatus === '결석지각' ? '결석' : targetStatus;
    await supabase.from('students').update({ status: dbStatus } as any).eq('id', studentId);

    // Create/update attendance log
    const nowIso = new Date().toISOString();
    if (targetStatus === '입실') {
      // Check if log exists
      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('date', today)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from('attendance_logs').update({ checked_in_at: nowIso }).eq('id', existing[0].id);
      } else {
        await supabase.from('attendance_logs').insert({
          student_id: studentId,
          student_name: student.name,
          date: today,
          checked_in_at: nowIso,
          recorded_by: teacherId,
        });
      }
    } else if (targetStatus === '퇴실') {
      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('date', today)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from('attendance_logs').update({ checked_out_at: nowIso }).eq('id', existing[0].id);
      } else {
        await supabase.from('attendance_logs').insert({
          student_id: studentId,
          student_name: student.name,
          date: today,
          checked_in_at: nowIso,
          checked_out_at: nowIso,
          recorded_by: teacherId,
        });
      }
    } else if (targetStatus === '결석지각') {
      // Open the absence modal
      setAbsenceTarget(student);
    }

    toast({ title: `${student.name}`, description: `상태: ${targetStatus}` });
  };

  const activeStudent = students.find(s => s.id === activeId);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0F' }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-100" style={{ background: '#0A0A0F' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0A0A0F]/80 backdrop-blur-xl px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white">선생님 대시보드</h1>
            <p className="text-[10px] text-gray-500">{teacherName} · SeedlingLog</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-white/10" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-1.5" />
            로그아웃
          </Button>
        </div>
      </header>

      <main className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        {/* Alert Banner */}
        <AlertBanner orangeAlerts={orangeAlerts} redAlerts={redAlerts} />

        {/* Summary */}
        <div className="grid grid-cols-5 gap-3">
          {STATUS_COLUMNS.map(col => (
            <Card key={col.key} className={`${col.color} border`}>
              <CardContent className="p-3 text-center">
                <div className={`w-3 h-3 rounded-full ${col.dotColor} mx-auto mb-1`} />
                <p className="text-lg font-bold text-white">{grouped[col.key].length}</p>
                <p className="text-[10px] text-gray-400">{col.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* DnD Board */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STATUS_COLUMNS.map(col => (
              <div key={col.key} id={col.key} data-droppable="true">
                <StatusColumn
                  col={col}
                  students={grouped[col.key]}
                  onAbsenceClick={s => setAbsenceTarget(s)}
                  blinkMap={blinkMap}
                />
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeStudent && (
              <div className="p-2.5 rounded-lg bg-blue-900/80 border border-blue-500/50 shadow-xl max-w-[200px]">
                <p className="text-xs font-semibold text-white">{activeStudent.name}</p>
                <p className="text-[10px] text-gray-400">{activeStudent.school}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Absence Modal */}
      <AbsenceModal
        student={absenceTarget}
        open={!!absenceTarget}
        onClose={() => setAbsenceTarget(null)}
        teacherId={teacherId}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page wrapper                                                       */
/* ------------------------------------------------------------------ */
export default function TeacherDashboard() {
  return (
    <ProtectedRoute allowedRoles={['teacher']} noLayout>
      <TeacherContent />
    </ProtectedRoute>
  );
}
