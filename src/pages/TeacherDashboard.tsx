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
} from 'lucide-react';

/* ------------------------------------------------------------------ */
type StatusKey = '미등원' | '등원' | '입실' | '퇴실' | '결석지각';

interface StudentCard {
  id: string; name: string; status: StatusKey;
  school: string | null; grade: string | null;
  statusChangedAt?: string; parentPhone: string | null;
}

const STATUS_COLUMNS: { key: StatusKey; label: string; borderClass: string; dotClass: string }[] = [
  { key: '미등원', label: '미등원', borderClass: 'border-border', dotClass: 'bg-muted-foreground' },
  { key: '등원', label: '등원', borderClass: 'border-primary/30', dotClass: 'bg-primary' },
  { key: '입실', label: '입실', borderClass: 'border-success/30', dotClass: 'bg-success' },
  { key: '퇴실', label: '퇴실', borderClass: 'border-muted-foreground/30', dotClass: 'bg-muted-foreground' },
  { key: '결석지각', label: '결석·지각', borderClass: 'border-destructive/30', dotClass: 'bg-destructive' },
];

const ABSENCE_REASONS = ['질병/몸살', '개인사정', '가족행사', '학교시험', '무단', '직접입력'];

/* ------------------------------------------------------------------ */
function DraggableStudentCard({ student, onAbsenceClick, blink }: {
  student: StudentCard; onAbsenceClick: (s: StudentCard) => void; blink: 'orange' | 'red' | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: student.id, data: { student },
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
  };
  const blinkClass = blink === 'orange'
    ? 'ring-2 ring-warning animate-pulse'
    : blink === 'red'
      ? 'ring-2 ring-destructive animate-urgent-pulse'
      : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2.5 rounded-lg bg-card border border-border cursor-grab active:cursor-grabbing
        hover:border-primary/30 transition-all duration-200 group ${blinkClass}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{student.name}</p>
          <p className="text-2xs text-muted-foreground">{student.school || ''} {student.grade || ''}</p>
        </div>
        {student.status === '결석지각' && (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-2xs text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onAbsenceClick(student); }}>
            처리
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function StatusColumn({ col, students, onAbsenceClick, blinkMap }: {
  col: typeof STATUS_COLUMNS[0]; students: StudentCard[];
  onAbsenceClick: (s: StudentCard) => void; blinkMap: Map<string, 'orange' | 'red'>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border ${col.borderClass} bg-card/50 p-3 min-h-[200px] flex flex-col status-transition
        ${isOver ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${col.dotClass}`} />
        <h3 className="text-xs font-semibold text-foreground">{col.label}</h3>
        <Badge variant="outline" className="ml-auto text-2xs">{students.length}</Badge>
      </div>
      <div className="flex-1 space-y-2">
        {students.length === 0 && (
          <p className="text-2xs text-muted-foreground text-center py-6">학생 없음</p>
        )}
        {students.map(s => (
          <DraggableStudentCard key={s.id} student={s} onAbsenceClick={onAbsenceClick} blink={blinkMap.get(s.id) ?? null} />
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
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-xs text-warning">
            <span className="font-semibold">등원 지연:</span> {orangeAlerts.join(', ')} — 수업 시작 후 5분 이상 등원 상태
          </p>
        </div>
      )}
      {redAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 animate-urgent-pulse">
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
          message: `[SeedlingLog] ${student.name} 학생이 ${effectiveReason}(으)로 금일 결석하였습니다. ${makeupInfo}`, type: 'absence',
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

  useEffect(() => { if (teacherId) fetchStudents(); }, [teacherId, fetchStudents]);

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
    toast({ title: `${student.name}`, description: `상태: ${targetStatus}` });
  };

  const activeStudent = students.find(s => s.id === activeId);
  const handleLogout = async () => { await signOut(); navigate('/login'); };

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        <DashboardSkeleton variant="stats" />
        <DashboardSkeleton variant="list" count={6} />
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-glow-primary">
            <span className="text-primary-foreground font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="text-base font-bold">선생님 대시보드</h1>
            <p className="text-2xs text-muted-foreground">{teacherName} · SeedlingLog</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-1.5" /><span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>
      </header>

      <PageTransition>
        <main className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
          <AlertBanner orangeAlerts={orangeAlerts} redAlerts={redAlerts} />

          {/* Summary counters */}
          <div className="grid grid-cols-5 gap-2 md:gap-3 animate-stagger">
            {STATUS_COLUMNS.map(col => (
              <Card key={col.key} className={`border ${col.borderClass}`}>
                <CardContent className="p-3 text-center">
                  <div className={`w-3 h-3 rounded-full ${col.dotClass} mx-auto mb-1`} />
                  <p className="text-lg font-bold animate-count-up">{grouped[col.key].length}</p>
                  <p className="text-2xs text-muted-foreground">{col.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {students.length === 0 ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="배정된 학생이 없습니다" description="수업에 학생이 배정되면 여기에 출결 보드가 표시됩니다" />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                {STATUS_COLUMNS.map(col => (
                  <StatusColumn key={col.key} col={col} students={grouped[col.key]} onAbsenceClick={s => setAbsenceTarget(s)} blinkMap={blinkMap} />
                ))}
              </div>
              <DragOverlay>
                {activeStudent && (
                  <div className="p-2.5 rounded-lg bg-primary/20 border border-primary/50 shadow-xl max-w-[200px]">
                    <p className="text-xs font-semibold text-foreground">{activeStudent.name}</p>
                    <p className="text-2xs text-muted-foreground">{activeStudent.school}</p>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </main>
      </PageTransition>

      <AbsenceModal student={absenceTarget} open={!!absenceTarget} onClose={() => setAbsenceTarget(null)} teacherId={teacherId} />
    </div>
  );
}

export default function TeacherDashboard() {
  return (
    <ProtectedRoute allowedRoles={['teacher']} noLayout>
      <TeacherContent />
    </ProtectedRoute>
  );
}
