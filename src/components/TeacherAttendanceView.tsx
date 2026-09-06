import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { isAbsent, isLate, isPresent } from '@/lib/attendance';
import { safeUpsertLessonRecord } from '@/lib/lessonRecordUpsert';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn, getTodayKST } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Clock, Users, Sparkles, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
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
  /** 상태 판정 원천: 'lesson' = 수업일지 수업출결(교사 판단), 'log' = 출입 태그 입실 로그 */
  statusSource?: 'lesson' | 'log' | 'none';
  checkedInAt?: string | null;
  isEarly?: boolean;
}

interface ScheduleSlot {
  id: string;
  classId: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  classroomName: string | null;
  isExamPrep?: boolean;
  examPrepStudentIds?: string[];
  isSupplementary?: boolean;
  supplementaryStudentIds?: string[];
  /** SIGNUP-ATT-V1: 선착순 수강신청 확정 수업 */
  isSignup?: boolean;
  signupStudentIds?: string[];
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{student.name}</span>
          {timeLabel && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums",
              student.status === '지각' ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"
            )}>
              {timeLabel}
            </span>
          )}
          {student.statusSource === 'lesson' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground" title="수업일지에 교사가 기록한 출결">
              수업출결
            </span>
          )}
          {student.statusSource === 'log' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground" title="출입 태그 입실 로그 기준">
              입실 상태
            </span>
          )}
          {student.isEarly && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-700 dark:text-blue-300">
              조기등원
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
  const studentFetchSequence = useRef(0);

  const [absenceDialog, setAbsenceDialog] = useState<{
    open: boolean;
    studentId: string;
    studentName: string;
    reason: string;
    isExcused: boolean;
    hasSupplementary: boolean;
    supplementaryDate: string;
    supplementaryTime: string;
    submitting: boolean;
  }>({
    open: false, studentId: '', studentName: '', reason: '',
    isExcused: false, hasSupplementary: false,
    supplementaryDate: '', supplementaryTime: '미정', submitting: false,
  });

  const today = useMemo(() => getTodayKST(), []);

  const fetchSchedule = useCallback(async () => {
    try {
      const dow = new Date().getDay();
      const [schedRes, sessRes, suppRes, signupRes] = await Promise.all([
        supabase
          .from('class_schedules')
          .select('id, start_time, end_time, class_id, classroom_id, classes(name, subject), classrooms(name)')
          .eq('teacher_id', teacherId)
          .eq('day_of_week', dow)
          .eq('is_active', true)
          .order('start_time'),
        // EXAM-PREP-ATT-V2: 내신특강 = exam_prep_sessions → exam_prep_courses → exam_prep_enrollments
        supabase
          .from('exam_prep_sessions')
          .select('id, course_id, schedule_date, start_time, end_time')
          .eq('schedule_date', today),
        // 오늘 잡힌 보충수업 (lesson_types 에 '보충수업' 포함 — class_id 유무 무관)
        supabase
          .from('lesson_records')
          .select('id, student_id, subject, notes, lesson_types, class_id')
          .eq('teacher_id', teacherId)
          .eq('lesson_date', today)
          .contains('lesson_types', ['보충수업']),
        // SIGNUP-ATT-V1: 오늘 확정된 선착순 수강신청 수업
        supabase
          .from('lesson_records')
          .select('id, student_id, subject, notes, lesson_types, class_id')
          .eq('teacher_id', teacherId)
          .eq('lesson_date', today)
          .contains('lesson_types', ['선착순수강신청']),
      ]);

      const schedules = schedRes.data || [];
      const sessions = sessRes.data || [];
      const suppLessons = suppRes.data || [];
      const signupLessons = signupRes.data || [];


      const parsed: ScheduleSlot[] = schedules.map((s: any) => ({
        id: s.id,
        classId: s.class_id,
        className: s.classes?.name || '',
        subject: s.classes?.subject || '',
        startTime: s.start_time?.slice(0, 5) || '',
        endTime: s.end_time?.slice(0, 5) || '',
        classroomName: s.classrooms?.name || null,
      }));

      // Build exam prep slots: filter sessions by courses owned by this teacher, then attach enrolled students
      let examSlots: ScheduleSlot[] = [];
      if (sessions.length > 0) {
        const courseIds = [...new Set(sessions.map((s: any) => s.course_id))];
        const { data: courses } = await supabase
          .from('exam_prep_courses')
          .select('id, teacher_id, subject, title')
          .in('id', courseIds)
          .eq('teacher_id', teacherId)
          .is('deleted_at', null);
        const myCourseIds = (courses || []).map((c: any) => c.id);
        const courseMap = new Map((courses || []).map((c: any) => [c.id, c]));
        if (myCourseIds.length > 0) {
          const { data: enrollments } = await supabase
            .from('exam_prep_enrollments')
            .select('course_id, student_id')
            .in('course_id', myCourseIds)
            .neq('status', 'cancelled');
          const enrollMap = new Map<string, string[]>();
          (enrollments || []).forEach((e: any) => {
            const arr = enrollMap.get(e.course_id) || [];
            if (!arr.includes(e.student_id)) arr.push(e.student_id);
            enrollMap.set(e.course_id, arr);
          });
          examSlots = sessions
            .filter((s: any) => myCourseIds.includes(s.course_id))
            .map((s: any) => {
              const c: any = courseMap.get(s.course_id);
              return {
                id: `examprep-${s.id}`,
                classId: '',
                className: c?.title ? `시험특강·${c.title}` : '시험특강',
                subject: c?.subject || '',
                startTime: (s.start_time || '').slice(0, 5),
                endTime: (s.end_time || '').slice(0, 5),
                classroomName: null,
                isExamPrep: true,
                examPrepStudentIds: enrollMap.get(s.course_id) || [],
              } as ScheduleSlot;
            })
            .filter(s => (s.examPrepStudentIds || []).length > 0);
        }
      }

      // Group supplementary lessons by 시간 (parsed from notes "[보충 시간: HH:MM]") + subject
      const parseSuppTime = (notes: string | null): string => {
        if (!notes) return '미정';
        const m = notes.match(/보충\s*시간\s*[:：]\s*([0-9]{1,2}[:：][0-9]{2}|미정)/);
        return m ? m[1].replace('：', ':') : '미정';
      };
      const suppGroups = new Map<string, { time: string; subject: string; studentIds: string[] }>();
      suppLessons.forEach((s: any) => {
        if (!s.student_id) return;
        const time = parseSuppTime(s.notes);
        const subject = s.subject || '';
        const key = `${time}-${subject}`;
        if (!suppGroups.has(key)) suppGroups.set(key, { time, subject, studentIds: [] });
        suppGroups.get(key)!.studentIds.push(s.student_id);
      });
      const suppSlots: ScheduleSlot[] = Array.from(suppGroups.entries()).map(([k, g]) => ({
        id: `supp-${k}`,
        classId: '',
        className: '보충수업',
        subject: g.subject,
        startTime: g.time === '미정' ? '23:58' : g.time,
        endTime: g.time === '미정' ? '23:59' : g.time,
        classroomName: null,
        isSupplementary: true,
        supplementaryStudentIds: g.studentIds,
      }));

      // SIGNUP-ATT-V1: 확정된 선착순 수강신청 수업을 시간대별 슬롯으로 노출
      const parseSignupTime = (notes: string | null): string => {
        if (!notes) return '미정';
        const m = notes.match(/신청\s*시간\s*[:：]\s*([0-9]{1,2}[:：][0-9]{2})/);
        return m ? m[1].replace('：', ':') : '미정';
      };
      const signupGroups = new Map<string, { time: string; subject: string; studentIds: string[] }>();
      signupLessons.forEach((s: any) => {
        if (!s.student_id) return;
        const time = parseSignupTime(s.notes);
        const subject = s.subject || '';
        const key = `${time}-${subject}`;
        if (!signupGroups.has(key)) signupGroups.set(key, { time, subject, studentIds: [] });
        if (!signupGroups.get(key)!.studentIds.includes(s.student_id)) {
          signupGroups.get(key)!.studentIds.push(s.student_id);
        }
      });
      const signupSlots: ScheduleSlot[] = Array.from(signupGroups.entries()).map(([k, g]) => ({
        id: `signup-${k}`,
        classId: '',
        className: '선착순 수강신청',
        subject: g.subject,
        startTime: g.time === '미정' ? '23:56' : g.time,
        endTime: g.time === '미정' ? '23:57' : g.time,
        classroomName: null,
        isSignup: true,
        signupStudentIds: g.studentIds,
      }));

      const all = [...parsed, ...examSlots, ...suppSlots, ...signupSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (all.length === 0) { setSlots([]); setLoading(false); return; }
      setSlots(all);

      const n = new Date();
      const nowStr = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
      const current = all.find(sl => nowStr >= sl.startTime && nowStr <= sl.endTime);
      setActiveSlotId(current?.id || all[0]?.id || null);
    } catch (err) {
      console.error('fetchSchedule error:', err);
      setLoading(false);
    }
  }, [teacherId, today]);

  const fetchStudents = useCallback(async () => {
    const fetchSequence = ++studentFetchSequence.current;
    try {
      if (slots.length === 0) return;

      const classIds = [...new Set(slots.filter(s => !s.isExamPrep && !s.isSupplementary && !s.isSignup && s.classId).map(s => s.classId))];
      const examPrepIds = [...new Set(slots.filter(s => s.isExamPrep).flatMap(s => s.examPrepStudentIds || []))];
      const suppIds = [...new Set(slots.filter(s => s.isSupplementary).flatMap(s => s.supplementaryStudentIds || []))];
      const signupIds = [...new Set(slots.filter(s => s.isSignup).flatMap(s => s.signupStudentIds || []))];

      let cs: { student_id: string; class_id: string }[] = [];
      if (classIds.length > 0) {
        const { data } = await supabase.from('class_students').select('student_id, class_id').in('class_id', classIds);
        cs = data || [];
      }

      const allStudentIds = [...new Set([...cs.map(r => r.student_id), ...examPrepIds, ...suppIds, ...signupIds])];
      if (allStudentIds.length === 0) { setStudentMap({}); setLoading(false); return; }

      const lessonQuery = classIds.length > 0
        ? supabase.from('lesson_records').select('id, student_id, class_id, attendance_status').in('student_id', allStudentIds).in('class_id', classIds).eq('lesson_date', today)
        : Promise.resolve({ data: [] as any[] });

      // 보충수업 출결 (class_id = NULL, 학생별로 별도 record)
      const suppLessonQuery = suppIds.length > 0
        ? supabase.from('lesson_records')
            .select('id, student_id, attendance_status, lesson_types, class_id')
            .in('student_id', suppIds)
            .eq('lesson_date', today)
            .is('class_id', null)
            .contains('lesson_types', ['보충수업'])
        : Promise.resolve({ data: [] as any[] });

      // SIGNUP-ATT-V1: 선착순 수강신청 확정 수업 출결
      const signupLessonQuery = signupIds.length > 0
        ? supabase.from('lesson_records')
            .select('id, student_id, attendance_status, lesson_types, class_id')
            .in('student_id', signupIds)
            .eq('lesson_date', today)
            .contains('lesson_types', ['선착순수강신청'])
        : Promise.resolve({ data: [] as any[] });

      const [studentRes, logRes, lessonRes, suppLessonRes, signupLessonRes] = await Promise.all([
        supabase.from('students').select('id, name, status, school, grade').in('id', allStudentIds).neq('enrollment_status', '퇴원'),
        supabase.from('attendance_logs').select('student_id, checked_in_at, checked_out_at').in('student_id', allStudentIds).eq('date', today),
        lessonQuery,
        suppLessonQuery,
        signupLessonQuery,
      ]);

      const logMap = new Map<string, { checked_in_at: string | null; checked_out_at: string | null }>();
      (logRes.data ?? []).forEach(l => {
        if (!l.student_id) return;
        const prev = logMap.get(l.student_id);
        const prevTime = prev?.checked_in_at ? new Date(prev.checked_in_at).getTime() : -1;
        const nextTime = l.checked_in_at ? new Date(l.checked_in_at).getTime() : -1;
        if (!prev || nextTime >= prevTime) {
          logMap.set(l.student_id, l);
        }
      });

      const lessonMap = new Map<string, { attendance_status: string[] | null }>();
      ((lessonRes as any).data ?? []).forEach((record: any) => {
        lessonMap.set(`${record.student_id}:${record.class_id}`, {
          attendance_status: record.attendance_status ?? null,
        });
      });

      const suppLessonMap = new Map<string, { attendance_status: string[] | null }>();
      ((suppLessonRes as any).data ?? []).forEach((record: any) => {
        if (!record.student_id) return;
        suppLessonMap.set(record.student_id, { attendance_status: record.attendance_status ?? null });
      });

      const signupLessonMap = new Map<string, { attendance_status: string[] | null }>();
      ((signupLessonRes as any).data ?? []).forEach((record: any) => {
        if (!record.student_id) return;
        signupLessonMap.set(record.student_id, { attendance_status: record.attendance_status ?? null });
      });

      const studentData = new Map<string, { id: string; name: string; school: string | null; grade: string | null; baseStatus: string | null }>();
      (studentRes.data ?? []).forEach(s => {
        studentData.set(s.id, { id: s.id, name: s.name, school: s.school, grade: s.grade, baseStatus: (s as any).status ?? null });
      });

      const map: Record<string, StudentAttendance[]> = {};
      slots.forEach(slot => {
        const slotStudentIds = slot.isExamPrep
          ? (slot.examPrepStudentIds || [])
          : slot.isSupplementary
            ? (slot.supplementaryStudentIds || [])
            : slot.isSignup
              ? (slot.signupStudentIds || [])
              : cs.filter(c => c.class_id === slot.classId).map(c => c.student_id);
        map[slot.id] = slotStudentIds
          .map(sid => {
            const student = studentData.get(sid);
            if (!student) return null;

            const log = logMap.get(sid);
            const lesson = slot.isExamPrep
              ? null
              : slot.isSupplementary
                ? (suppLessonMap.get(sid) || null)
                : slot.isSignup
                  ? (signupLessonMap.get(sid) || null)
                  : lessonMap.get(`${sid}:${slot.classId}`);
            const attendance = lesson?.attendance_status ?? [];
            const isEarly = attendance.includes('조기등원');

            // ATTENDANCE-NORMALIZE-V1: 레거시 값('출석'/'결석'/'미등원')은 조회 시 정규화해 판정
            let status: AttendanceStatus = '미등원';
            let statusSource: 'lesson' | 'log' | 'none' = 'none';
            if (isAbsent(attendance) || isLate(attendance) || isPresent(attendance) || isEarly) statusSource = 'lesson';
            else if (log?.checked_in_at) statusSource = 'log';
            if (isAbsent(attendance)) status = '결석';
            else if (isLate(attendance)) status = '지각';
            else if (isPresent(attendance) || isEarly) status = '등원';
            else if (log?.checked_in_at) status = '등원';
            else if (student.baseStatus === '결석') status = '결석';
            else if (student.baseStatus === '지각') status = '지각';
            else if (student.baseStatus === '등원') status = '등원';

            return {
              id: student.id,
              name: student.name,
              school: student.school,
              grade: student.grade,
              status,
              statusSource,
              checkedInAt: log?.checked_in_at ?? null,
              isEarly,
            } as StudentAttendance;
          })
          .filter((s): s is StudentAttendance => s !== null)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      });

      // ATT-DEDUP-V1: 같은 시간대(시작시간)에 학생이 두 개 이상의 슬롯에 중복 노출되지 않도록 제거.
      // 인원이 많은(정규) 슬롯을 우선 유지하고, 이후 슬롯에서는 해당 학생을 제외한다.
      const slotsByTime = new Map<string, string[]>();
      slots.forEach(slot => {
        const arr = slotsByTime.get(slot.startTime) || [];
        arr.push(slot.id);
        slotsByTime.set(slot.startTime, arr);
      });
      slotsByTime.forEach(slotIds => {
        if (slotIds.length < 2) return;
        const ordered = [...slotIds].sort((a, b) => (map[b]?.length || 0) - (map[a]?.length || 0));
        const seen = new Set<string>();
        ordered.forEach(sid => {
          map[sid] = (map[sid] || []).filter(st => {
            if (seen.has(st.id)) return false;
            seen.add(st.id);
            return true;
          });
        });
      });
      // 슬롯 내부 중복도 제거
      Object.keys(map).forEach(sid => {
        const seen = new Set<string>();
        map[sid] = map[sid].filter(st => (seen.has(st.id) ? false : (seen.add(st.id), true)));
      });

      // Realtime emits several overlapping fetches during bulk attendance.
      // Discard stale responses so an older partial snapshot cannot win.
      if (fetchSequence === studentFetchSequence.current) {
        setStudentMap(map);
        setLoading(false);
      }
    } catch (err) {
      console.error('fetchStudents error:', err);
      if (fetchSequence === studentFetchSequence.current) setLoading(false);
    }
  }, [slots, today]);

  useEffect(() => { if (teacherId) fetchSchedule(); }, [teacherId, fetchSchedule]);
  useEffect(() => { if (slots.length > 0) fetchStudents(); }, [slots, fetchStudents]);

  useEffect(() => {
    if (!teacherId) return;
    const ch = supabase.channel('teacher-att-shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => { fetchStudents().catch(() => {}); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => { fetchSchedule().catch(() => {}); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_records' }, () => { fetchSchedule().catch(() => {}); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_prep_sessions' }, () => { fetchSchedule().catch(() => {}); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_prep_enrollments' }, () => { fetchSchedule().catch(() => {}); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teacherId, fetchStudents, fetchSchedule]);

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

  const handleStatusChange = useCallback(async (studentId: string, newStatus: AttendanceStatus, opts?: { skipEarlyCheck?: boolean }) => {
    try {
      if (!activeSlot) return;
      const student = activeStudents.find(s => s.id === studentId);
      if (!student || student.status === newStatus) return;

      const nowIso = new Date().toISOString();
      const previousCheckedInAt = student.checkedInAt ?? null;
      let lessonAttendanceStatus: string[] = ['정상등원'];
      let lessonRangeText = '';
      let supplementaryDate: string | null = null;
      let supplementaryTime = '미정';
      let earlyArrival = false;

      if (newStatus === '결석') {
        setAbsenceDialog(d => ({
          ...d, open: true, studentId, studentName: student.name,
          reason: '', isExcused: false, hasSupplementary: false,
          supplementaryDate: today, supplementaryTime: '미정',
        }));
        setActionLoading(prev => { const s = new Set(prev); s.delete(studentId); return s; });
        return;
      } else if (newStatus === '지각') {
        lessonAttendanceStatus = ['지각'];
      } else if (newStatus === '미등원') {
        // ATTENDANCE-NORMALIZE-V1: '미등원'은 표준값이 아니다 → 미기록(빈 배열)으로 되돌린다
        lessonAttendanceStatus = [];
      } else if (newStatus === '등원') {
        // EARLY-ARRIVAL-GUARD-V1: block 임의 등원처리 well before class
        const [sh, sm] = activeSlot.startTime.split(':').map(Number);
        if (!isNaN(sh)) {
          const slotStart = new Date();
          slotStart.setHours(sh, sm || 0, 0, 0);
          const minutesUntil = (slotStart.getTime() - Date.now()) / 60000;
          if (minutesUntil > 30) {
            if (!opts?.skipEarlyCheck) {
              const ok = window.confirm(
                `아직 수업시간이 아닙니다.\n수업 시작: ${activeSlot.startTime} (약 ${Math.round(minutesUntil)}분 남음)\n\n그래도 등원처리 하시겠습니까?\n→ 조기등원으로 기록됩니다.`
              );
              if (!ok) return;
            }
            earlyArrival = true;
            lessonAttendanceStatus = ['조기등원'];
          }
        }
      }

      setActionLoading(prev => new Set(prev).add(studentId));

      setStudentMap(prev => {
        const updated = { ...prev };
        updated[activeSlot.id] = (updated[activeSlot.id] || []).map(s =>
          s.id === studentId
            ? {
                ...s,
                status: newStatus,
                checkedInAt: newStatus === '등원' || newStatus === '지각' ? nowIso : null,
                isEarly: earlyArrival,
              }
            : s
        );
        return updated;
      });

      // Save the physical check-in first. A submitted journal may be protected
      // from edits, but that must never roll the attendance button back.
      if (newStatus === '등원' || newStatus === '지각') {
        const { data: existing, error: existingLogError } = await supabase.from('attendance_logs').select('id').eq('student_id', studentId).eq('date', today).limit(1);
        if (existingLogError) throw existingLogError;
        if (existing?.length) {
          const { error: updateLogError } = await supabase.from('attendance_logs').update({ checked_in_at: nowIso, checked_out_at: null }).eq('id', existing[0].id);
          if (updateLogError) throw updateLogError;
        } else {
          const { error: insertLogError } = await supabase.from('attendance_logs').insert({ student_id: studentId, student_name: student.name, date: today, checked_in_at: nowIso, recorded_by: teacherId });
          if (insertLogError) throw insertLogError;
        }
      } else {
        const { error: clearLogsError } = await supabase.from('attendance_logs').update({ checked_in_at: null, checked_out_at: null }).eq('student_id', studentId).eq('date', today);
        if (clearLogsError) throw clearLogsError;
      }

      // SIGNUP-ATT-V1: 선착순 수강신청 슬롯은 class_id 없이 학생별 일지에 출결을 기록
      if (activeSlot.isSignup) {
        const { data: signupLesson } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', studentId)
          .eq('lesson_date', today)
          .contains('lesson_types', ['선착순수강신청'])
          .limit(1);
        if (signupLesson?.length) {
          const { error: signupUpdateError } = await supabase
            .from('lesson_records')
            .update({ attendance_status: lessonAttendanceStatus })
            .eq('id', signupLesson[0].id);
          if (signupUpdateError) console.warn('Signup journal sync skipped:', signupUpdateError);
        }
      }

      // Skip lesson_records writes for exam-prep slots (no class_id)
      if (!activeSlot.isExamPrep && !activeSlot.isSignup && activeSlot.classId) {
        const { data: existingLesson, error: existingLessonError } = await supabase
          .from('lesson_records')
          .select('id, lesson_range')
          .eq('student_id', studentId)
          .eq('class_id', activeSlot.classId)
          .eq('lesson_date', today)
          .eq('subject', activeSlot.subject as any)
          .maybeSingle();
        if (existingLessonError) console.warn('Attendance journal lookup skipped:', existingLessonError);

        const mergedLessonRange = lessonRangeText
          ? existingLesson?.lesson_range?.includes(lessonRangeText)
            ? existingLesson.lesson_range
            : [existingLesson?.lesson_range?.trim(), lessonRangeText].filter(Boolean).join('\n')
          : existingLesson?.lesson_range ?? '';

        const lessonPayload: Record<string, any> = {
          attendance_status: lessonAttendanceStatus,
          lesson_range: mergedLessonRange,
          submitted: false,
        };

        if (existingLesson) {
          const { error: updateLessonError } = await supabase.from('lesson_records').update(lessonPayload).eq('id', existingLesson.id);
          if (updateLessonError) console.warn('Attendance journal sync skipped:', updateLessonError);
        } else {
          const { error: insertLessonError } = await safeUpsertLessonRecord({
            teacher_id: teacherId,
            student_id: studentId,
            class_id: activeSlot.classId,
            subject: activeSlot.subject as any,
            lesson_date: today,
            lesson_range: lessonRangeText,
            understanding_score: null,
            homework_status: 'none_assigned',
            learning_issues: [],
            attendance_status: lessonAttendanceStatus,
            submitted: false,
          });
          if (insertLessonError) console.warn('Attendance journal sync skipped:', insertLessonError);

        }
      }

      if (supplementaryDate) {
        const notesContent = `[보충 시간: ${supplementaryTime}]`;
        const { error: supplementaryInsertError } = await safeUpsertLessonRecord({
          teacher_id: teacherId,
          student_id: studentId,
          class_id: activeSlot.classId,
          subject: activeSlot.subject as any,
          lesson_date: supplementaryDate,
          lesson_range: '보충수업 예정',
          homework_status: 'none_assigned',
          lesson_types: ['보충수업'],
          attendance_status: ['정상등원'],
          notes: notesContent,
          submitted: false,
        });
        if (supplementaryInsertError) throw supplementaryInsertError;

      }

      sonnerToast.success(`${student.name} → ${newStatus}`, { duration: 1500 });
    } catch (err) {
      console.error('handleStatusChange error:', err);
      await fetchStudents();
      sonnerToast.error('출결 처리 중 오류가 발생했습니다');
    } finally {
      setActionLoading(prev => { const s = new Set(prev); s.delete(studentId); return s; });
    }
  }, [activeSlot, activeStudents, fetchStudents, teacherId, today]);

  const handleAbsenceConfirm = useCallback(async () => {
    const { studentId, reason, isExcused, hasSupplementary, supplementaryDate, supplementaryTime } = absenceDialog;
    if (!reason.trim() || !activeSlot) return;

    setAbsenceDialog(d => ({ ...d, submitting: true }));

    try {
      const student = activeStudents.find(s => s.id === studentId);
      if (!student) return;

      const nowIso = new Date().toISOString();
      const lessonAttendanceStatus = [isExcused ? '인정결석' : '무단결석'];
      const lessonRangeText = `결석 사유: ${reason.trim()}`;

      setStudentMap(prev => {
        const updated = { ...prev };
        updated[activeSlot.id] = (updated[activeSlot.id] || []).map(s =>
          s.id === studentId ? { ...s, status: '결석' as AttendanceStatus, checkedInAt: null } : s
        );
        return updated;
      });

      await supabase.from('attendance_logs').update({ checked_in_at: null, checked_out_at: null }).eq('student_id', studentId).eq('date', today);

      // SIGNUP-ATT-V1: 선착순 수강신청 슬롯은 class_id 없이 lesson_types로 찾는다
      const existingLessonQuery = activeSlot.isSignup
        ? supabase.from('lesson_records').select('id, lesson_range').eq('student_id', studentId).eq('lesson_date', today).contains('lesson_types', ['선착순수강신청']).limit(1).maybeSingle()
        : supabase.from('lesson_records').select('id, lesson_range').eq('student_id', studentId).eq('class_id', activeSlot.classId).eq('lesson_date', today).eq('subject', activeSlot.subject as any).maybeSingle();
      const { data: existingLesson } = await existingLessonQuery;

      const mergedRange = existingLesson?.lesson_range?.includes(lessonRangeText)
        ? existingLesson.lesson_range
        : [existingLesson?.lesson_range?.trim(), lessonRangeText].filter(Boolean).join('\n');

      const lessonPayload = { attendance_status: lessonAttendanceStatus, lesson_range: mergedRange, understanding_score: null, homework_status: 'none_assigned', submitted: true, submitted_at: nowIso };
      if (existingLesson) {
        await supabase.from('lesson_records').update(lessonPayload as any).eq('id', existingLesson.id);
      } else {
        await safeUpsertLessonRecord({
          teacher_id: teacherId, student_id: studentId, class_id: activeSlot.classId,
          subject: activeSlot.subject as any, lesson_date: today,
          lesson_range: lessonRangeText, understanding_score: null,
          homework_status: 'none_assigned', learning_issues: [],
          attendance_status: lessonAttendanceStatus, submitted: true, submitted_at: nowIso,
        });
      }

      if (hasSupplementary && supplementaryDate) {
        await safeUpsertLessonRecord({
          teacher_id: teacherId, student_id: studentId, class_id: activeSlot.classId,
          subject: activeSlot.subject as any, lesson_date: supplementaryDate,
          lesson_range: '보충수업 예정', homework_status: 'none_assigned',
          lesson_types: ['보충수업'], attendance_status: ['정상등원'],
          notes: `[보충 시간: ${supplementaryTime}]`, submitted: false,
        });
      }


      sonnerToast.success(`${student.name} → 결석 처리 완료`, { duration: 1500 });
      setAbsenceDialog(d => ({ ...d, open: false, submitting: false }));
    } catch (err) {
      console.error('handleAbsenceConfirm error:', err);
      await fetchStudents();
      sonnerToast.error('출결 처리 중 오류가 발생했습니다');
      setAbsenceDialog(d => ({ ...d, submitting: false }));
    }
  }, [absenceDialog, activeSlot, activeStudents, teacherId, today, fetchStudents]);

  const handleMarkAllPresent = async () => {
    const pending = activeStudents.filter(s => s.status === '미등원');
    if (pending.length === 0) { toast({ title: '전원 등원 상태입니다' }); return; }
    if (activeSlot) {
      const [sh, sm] = activeSlot.startTime.split(':').map(Number);
      if (!isNaN(sh)) {
        const slotStart = new Date();
        slotStart.setHours(sh, sm || 0, 0, 0);
        const minutesUntil = (slotStart.getTime() - Date.now()) / 60000;
        if (minutesUntil > 30) {
          const ok = window.confirm(
            `아직 수업시간이 아닙니다 (수업 ${activeSlot.startTime} 시작, 약 ${Math.round(minutesUntil)}분 남음).\n그래도 전원 등원처리 하시겠습니까?\n→ 조기등원으로 일괄 기록됩니다.`
          );
          if (!ok) return;
        }
      }
    }
    setMarkingAll(true);
    for (const s of pending) {
      await handleStatusChange(s.id, '등원', { skipEarlyCheck: true });
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

      {/* 결석 처리 Dialog */}
      <Dialog open={absenceDialog.open} onOpenChange={open => !absenceDialog.submitting && setAbsenceDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              결석 처리 — {absenceDialog.studentName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">결석 사유 *</Label>
              <Input
                placeholder="예: 병원, 가족행사, 개인사정..."
                value={absenceDialog.reason}
                onChange={e => setAbsenceDialog(d => ({ ...d, reason: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">인정결석</p>
                <p className="text-xs text-muted-foreground">끄면 무단결석으로 기록됩니다</p>
              </div>
              <Switch
                checked={absenceDialog.isExcused}
                onCheckedChange={v => setAbsenceDialog(d => ({ ...d, isExcused: v }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">보강 일정 있음</p>
                <p className="text-xs text-muted-foreground">날짜와 시간을 입력합니다</p>
              </div>
              <Switch
                checked={absenceDialog.hasSupplementary}
                onCheckedChange={v => setAbsenceDialog(d => ({ ...d, hasSupplementary: v }))}
              />
            </div>

            {absenceDialog.hasSupplementary && (
              <div className="grid grid-cols-2 gap-3 pl-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">보강 날짜</Label>
                  <Input
                    type="date"
                    value={absenceDialog.supplementaryDate}
                    onChange={e => setAbsenceDialog(d => ({ ...d, supplementaryDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">보강 시간</Label>
                  <Input
                    placeholder="예: 19:00"
                    value={absenceDialog.supplementaryTime}
                    onChange={e => setAbsenceDialog(d => ({ ...d, supplementaryTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setAbsenceDialog(d => ({ ...d, open: false }))} disabled={absenceDialog.submitting}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleAbsenceConfirm}
              disabled={!absenceDialog.reason.trim() || absenceDialog.submitting}
            >
              {absenceDialog.submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              결석 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
