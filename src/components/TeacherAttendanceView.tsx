import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Clock, Users, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';

/* ------------------------------------------------------------------ */
type AttendanceStatus = '미등원' | '등원' | '지각' | '결석';

const ATTENDANCE_OPTIONS: { key: AttendanceStatus; label: string; activeClass: string; hoverClass: string }[] = [
  { key: '미등원', label: '미등원', activeClass: 'bg-muted text-muted-foreground border-border', hoverClass: 'hover:bg-muted/60' },
  { key: '등원', label: '등원', activeClass: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40', hoverClass: 'hover:bg-emerald-500/10' },
  { key: '지각', label: '지각', activeClass: 'bg-amber-500/15 text-amber-700 border-amber-500/40', hoverClass: 'hover:bg-amber-500/10' },
  { key: '결석', label: '결석', activeClass: 'bg-red-500/15 text-red-700 border-red-500/40', hoverClass: 'hover:bg-red-500/10' },
];

interface StudentAttendance {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  status: AttendanceStatus;
  checkedInAt?: string | null;
}

interface ScheduleSlot {
  id: string;
  classId: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  classroomName: string | null;
}

/* ------------------------------------------------------------------ */
function StudentRow({ student, onStatusChange, isLoading }: {
  student: StudentAttendance;
  onStatusChange: (studentId: string, status: AttendanceStatus) => void;
  isLoading: boolean;
}) {
  const timeLabel = student.checkedInAt
    ? new Date(student.checkedInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  return (
    <div className={cn(
      "flex items-center gap-3 py-2.5 px-3 rounded-xl border transition-all duration-200",
      student.status === '결석' && "bg-red-500/5 border-red-500/20",
      student.status === '지각' && "bg-amber-500/5 border-amber-500/20",
      student.status === '등원' && "bg-emerald-500/5 border-emerald-500/20",
      student.status === '미등원' && "bg-card border-border",
      isLoading && "opacity-50 pointer-events-none"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground truncate">{student.name}</span>
          {timeLabel && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums",
              student.status === '지각' ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"
            )}>
              {timeLabel}
            </span>
          )}
        </div>
        {(student.school || student.grade) && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{student.school || ''} {student.grade || ''}</p>
        )}
      </div>

      <div className="flex gap-1 shrink-0">
        {ATTENDANCE_OPTIONS.map(opt => {
          const isActive = student.status === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onStatusChange(student.id, opt.key)}
              className={cn(
                "text-[11px] px-2.5 py-1.5 rounded-lg font-semibold border transition-all duration-150",
                isActive
                  ? opt.activeClass
                  : "bg-transparent text-muted-foreground/60 border-transparent " + opt.hoverClass
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function TeacherAttendanceView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const teacherId = user?.id ?? '';

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [studentMap, setStudentMap] = useState<Record<string, StudentAttendance[]>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchSchedule = useCallback(async () => {
    try {
      const dow = new Date().getDay();
      const { data: schedules } = await supabase
        .from('class_schedules')
        .select('id, start_time, end_time, class_id, classroom_id, classes(name, subject), classrooms(name)')
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dow)
        .eq('is_active', true)
        .order('start_time');

      if (!schedules || schedules.length === 0) { setSlots([]); setLoading(false); return; }

      const parsed: ScheduleSlot[] = schedules.map((s: any) => ({
        id: s.id,
        classId: s.class_id,
        className: s.classes?.name || '',
        subject: s.classes?.subject || '',
        startTime: s.start_time?.slice(0, 5) || '',
        endTime: s.end_time?.slice(0, 5) || '',
        classroomName: s.classrooms?.name || null,
      }));
      setSlots(parsed);

      const n = new Date();
      const nowStr = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
      const current = parsed.find(sl => nowStr >= sl.startTime && nowStr <= sl.endTime);
      setActiveSlotId(current?.id || parsed[0]?.id || null);
    } catch (err) {
      console.error('fetchSchedule error:', err);
      setLoading(false);
    }
  }, [teacherId]);

  const fetchStudents = useCallback(async () => {
    try {
      if (slots.length === 0) return;

      const classIds = [...new Set(slots.map(s => s.classId))];
      const { data: cs } = await supabase.from('class_students').select('student_id, class_id').in('class_id', classIds);
      if (!cs || cs.length === 0) { setStudentMap({}); setLoading(false); return; }

      const allStudentIds = [...new Set(cs.map(r => r.student_id))];
      const [studentRes, logRes] = await Promise.all([
        supabase.from('students').select('id, name, status, school, grade').in('id', allStudentIds).neq('enrollment_status', '퇴원'),
        supabase.from('attendance_logs').select('student_id, checked_in_at, checked_out_at').in('student_id', allStudentIds).eq('date', today),
      ]);

      const logMap = new Map<string, { checked_in_at: string | null; checked_out_at: string | null }>();
      (logRes.data ?? []).forEach(l => { if (l.student_id) logMap.set(l.student_id, l); });

      const studentData = new Map<string, StudentAttendance>();
      (studentRes.data ?? []).forEach(s => {
        const log = logMap.get(s.id);
        let status: AttendanceStatus = '미등원';
        if (s.status === '결석') status = '결석';
        else if (s.status === '지각') status = '지각';
        else if (log?.checked_in_at) status = '등원';
        else if (s.status === '등원') status = '등원';
        studentData.set(s.id, { id: s.id, name: s.name, school: s.school, grade: s.grade, status, checkedInAt: log?.checked_in_at });
      });

      const map: Record<string, StudentAttendance[]> = {};
      slots.forEach(slot => {
        const classStudentIds = cs.filter(c => c.class_id === slot.classId).map(c => c.student_id);
        map[slot.id] = classStudentIds
          .map(sid => studentData.get(sid))
          .filter((s): s is StudentAttendance => !!s)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      });
      setStudentMap(map);
      setLoading(false);
    } catch (err) {
      console.error('fetchStudents error:', err);
      setLoading(false);
    }
  }, [slots, today]);

  useEffect(() => { if (teacherId) fetchSchedule(); }, [teacherId, fetchSchedule]);
  useEffect(() => { if (slots.length > 0) fetchStudents(); }, [slots, fetchStudents]);

  useEffect(() => {
    if (!teacherId) return;
    const ch = supabase.channel('teacher-att-shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => { fetchStudents().catch(() => {}); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => { fetchStudents().catch(() => {}); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teacherId, fetchStudents]);

  const activeSlot = useMemo(() => slots.find(s => s.id === activeSlotId) || null, [slots, activeSlotId]);
  const activeStudents = activeSlotId ? (studentMap[activeSlotId] || []) : [];

  const statusCounts = useMemo(() => {
    const c = { '미등원': 0, '등원': 0, '지각': 0, '결석': 0 };
    activeStudents.forEach(s => c[s.status]++);
    return c;
  }, [activeStudents]);

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

  const handleStatusChange = useCallback(async (studentId: string, newStatus: AttendanceStatus) => {
    try {
      const student = activeStudents.find(s => s.id === studentId);
      if (!student || student.status === newStatus) return;

      setActionLoading(prev => new Set(prev).add(studentId));
      const nowIso = new Date().toISOString();

      setStudentMap(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(slotId => {
          updated[slotId] = updated[slotId].map(s =>
            s.id === studentId ? { ...s, status: newStatus, checkedInAt: newStatus === '등원' ? nowIso : s.checkedInAt } : s
          );
        });
        return updated;
      });

      const dbStatus = newStatus === '미등원' ? '미등원' : newStatus;
      await supabase.from('students').update({ status: dbStatus } as any).eq('id', studentId);

      if (newStatus === '등원') {
        const { data: existing } = await supabase.from('attendance_logs').select('id').eq('student_id', studentId).eq('date', today).limit(1);
        if (existing?.length) {
          await supabase.from('attendance_logs').update({ checked_in_at: nowIso }).eq('id', existing[0].id);
        } else {
          await supabase.from('attendance_logs').insert({ student_id: studentId, student_name: student.name, date: today, checked_in_at: nowIso, recorded_by: teacherId });
        }
      }

      setActionLoading(prev => { const s = new Set(prev); s.delete(studentId); return s; });
      sonnerToast.success(`${student.name} → ${newStatus}`, { duration: 1500 });
    } catch (err) {
      console.error('handleStatusChange error:', err);
      setActionLoading(prev => { const s = new Set(prev); s.delete(studentId); return s; });
      sonnerToast.error('출결 처리 중 오류가 발생했습니다');
    }
  }, [activeStudents, today, teacherId]);

  const handleMarkAllPresent = async () => {
    const pending = activeStudents.filter(s => s.status === '미등원');
    if (pending.length === 0) { toast({ title: '전원 등원 상태입니다' }); return; }
    setMarkingAll(true);
    for (const s of pending) {
      await handleStatusChange(s.id, '등원');
    }
    setMarkingAll(false);
    sonnerToast.success(`${pending.length}명 전체 등원 처리 완료`);
  };

  if (loading) return <DashboardSkeleton variant="list" count={4} />;

  if (slots.length === 0) {
    return <EmptyState icon={<Users className="w-5 h-5" />} title="오늘 수업이 없습니다" description="배정된 수업이 있으면 출결 관리가 표시됩니다" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {slots.map(slot => {
          const isCurrent = nowStr >= slot.startTime && nowStr <= slot.endTime;
          const isActive = activeSlotId === slot.id;
          const students = studentMap[slot.id] || [];
          const presentCount = students.filter(s => s.status === '등원').length;
          return (
            <button
              key={slot.id}
              onClick={() => setActiveSlotId(slot.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 border shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : isCurrent
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30"
              )}
            >
              {isCurrent && <Sparkles className="w-3 h-3" />}
              <span>{slot.startTime}</span>
              <span className="text-[10px] opacity-80">{slot.subject}</span>
              <Badge variant="secondary" className={cn("text-[9px] px-1 py-0 h-4", isActive && "bg-primary-foreground/20 text-primary-foreground")}>
                {presentCount}/{students.length}
              </Badge>
            </button>
          );
        })}
      </div>

      {activeSlot && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold">{activeSlot.className}</span>
            <Badge variant="outline" className="text-[10px]">{activeSlot.subject}</Badge>
            <span className="text-xs text-muted-foreground">{activeSlot.startTime}~{activeSlot.endTime}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-[11px] h-7 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
            onClick={handleMarkAllPresent}
            disabled={markingAll}
          >
            {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            전체 등원
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        {ATTENDANCE_OPTIONS.map(opt => (
          <div key={opt.key} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border", opt.activeClass)}>
            <span>{opt.label}</span>
            <span>{statusCounts[opt.key]}명</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {activeStudents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">이 수업에 배정된 학생이 없습니다</p>
        ) : (
          activeStudents.map(student => (
            <StudentRow
              key={student.id}
              student={student}
              onStatusChange={handleStatusChange}
              isLoading={actionLoading.has(student.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
