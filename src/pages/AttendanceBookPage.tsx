// ATTENDANCE-BOOK-PAGE-V1
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  CalendarIcon, ChevronLeft, ChevronRight, ClipboardList, Filter, Search, X,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SlotRow {
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  teacherId: string | null;
  teacherName: string;
  students: { id: string; name: string; status: string | null }[];
}

const STATUS_TONE: Record<string, string> = {
  '정상등원': 'text-emerald-600',
  '지각': 'text-amber-600',
  '조퇴': 'text-amber-600',
  '인정결석': 'text-muted-foreground',
  '무단결석': 'text-destructive',
  '보충불가': 'text-destructive',
  'legacy_absent': 'text-destructive',
};

// ATTENDANCE-NORMALIZE-V1: 레거시 값('출석'/'결석'/'미등원')은 조회 시 정규화해 판정한다.
const getPrimaryStatus = (attendanceStatus: string[] | null | undefined) =>
  getPrimaryAttendanceStatus(attendanceStatus);


const inferTimeFromClassName = (className: string) => {
  const match = className.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return { startTime: '', endTime: '' };

  let hour = Number(match[1]);
  const minute = match[2] || '00';
  if (hour > 0 && hour < 8) hour += 12;
  const startTime = `${String(hour).padStart(2, '0')}:${minute}`;
  const endTime = `${String((hour + 1) % 24).padStart(2, '0')}:${minute}`;
  return { startTime, endTime };
};

function StatPill({ label, value, tone, dot }: { label: string; value: number; tone?: string; dot?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border">
      {dot && <span className={cn('w-2 h-2 rounded-full', dot)} />}
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-bold tabular-nums', tone)}>{value}</span>
    </div>
  );
}

function AttendanceBookContent() {
  const [date, setDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<SlotRow[]>([]);

  // Filters
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all | absent | late | present | empty
  const [studentQuery, setStudentQuery] = useState<string>('');

  const dateStr = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);
  const dow = date.getDay();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: schedules }, { data: lessonRecords }] = await Promise.all([
          supabase
            .from('class_schedules')
            .select('id, start_time, end_time, class_id, teacher_id, classes(name, subject)')
            .eq('day_of_week', dow)
            .eq('is_active', true)
            .order('start_time'),
          supabase
            .from('lesson_records')
            .select('id, student_id, class_id, subject, attendance_status, teacher_id, teacher_display_name, students(name), classes(name, subject)')
            .eq('lesson_date', dateStr),
        ]);

        const scheduleRows = (schedules || []) as any[];
        const recordRows = (lessonRecords || []) as any[];
        const scheduledClassIds = scheduleRows.map((s) => s.class_id).filter(Boolean);
        const teacherIds = [...new Set([
          ...scheduleRows.map((s) => s.teacher_id).filter(Boolean),
          ...recordRows.map((r) => r.teacher_id).filter(Boolean),
        ])] as string[];

        const [{ data: profiles }, { data: classStudents }] = await Promise.all([
          teacherIds.length > 0
            ? supabase.from('profiles').select('id, full_name').in('id', teacherIds)
            : Promise.resolve({ data: [] as any[] }),
          scheduledClassIds.length > 0
            ? supabase.from('class_students').select('class_id, student_id, students(name)').in('class_id', scheduledClassIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const teacherMap: Record<string, string> = {};
        (profiles || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });

        const statusMap = new Map<string, string>();
        const recordedStudentsByClass = new Map<string, { id: string; name: string; status: string | null }[]>();
        recordRows.forEach((r: any) => {
          const status = getPrimaryStatus(r.attendance_status);
          if (status) statusMap.set(`${r.student_id}:${r.class_id}`, status);
          if (r.class_id) {
            if (!recordedStudentsByClass.has(r.class_id)) recordedStudentsByClass.set(r.class_id, []);
            recordedStudentsByClass.get(r.class_id)!.push({
              id: r.student_id,
              name: r.students?.name || '-',
              status,
            });
          }
        });

        const studentsByClass = new Map<string, { id: string; name: string }[]>();
        (classStudents || []).forEach((cs: any) => {
          if (!studentsByClass.has(cs.class_id)) studentsByClass.set(cs.class_id, []);
          studentsByClass.get(cs.class_id)!.push({ id: cs.student_id, name: cs.students?.name || '-' });
        });

        const result: SlotRow[] = scheduleRows.map((s) => {
          const roster = studentsByClass.get(s.class_id) || [];
          const recorded = recordedStudentsByClass.get(s.class_id) || [];
          const seen = new Set<string>();
          const students: SlotRow['students'] = [...roster, ...recorded]
            .filter((st) => {
              if (seen.has(st.id)) return false;
              seen.add(st.id);
              return true;
            })
            .map((st) => {
              const existingStatus = (st as { status?: string | null }).status || null;
              return {
                id: st.id,
                name: st.name,
                status: statusMap.get(`${st.id}:${s.class_id}`) || existingStatus,
              };
            });

          return {
            scheduleId: s.id,
            classId: s.class_id,
            className: s.classes?.name || '-',
            subject: s.classes?.subject || '-',
            startTime: s.start_time?.slice(0, 5) || '',
            endTime: s.end_time?.slice(0, 5) || '',
            teacherId: s.teacher_id,
            teacherName: teacherMap[s.teacher_id] || '미배정',
            students,
          };
        });

        const scheduledClassIdSet = new Set(scheduledClassIds);
        const historicalClassIds = [...new Set(recordRows.map((r) => r.class_id).filter(Boolean))]
          .filter((classId) => !scheduledClassIdSet.has(classId));

        historicalClassIds.forEach((classId) => {
          const records = recordRows.filter((r) => r.class_id === classId);
          const first = records[0];
          const className = first?.classes?.name || '-';
          const { startTime, endTime } = inferTimeFromClassName(className);
          const teacherId = first?.teacher_id || null;
          result.push({
            scheduleId: `record-${dateStr}-${classId}`,
            classId,
            className,
            subject: first?.classes?.subject || first?.subject || '-',
            startTime,
            endTime,
            teacherId,
            teacherName: (teacherId && teacherMap[teacherId]) || first?.teacher_display_name || '미배정',
            students: records.map((r) => ({
              id: r.student_id,
              name: r.students?.name || '-',
              status: getPrimaryStatus(r.attendance_status),
            })),
          });
        });

        result.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
          || a.className.localeCompare(b.className, 'ko'));

        if (!cancelled) setSlots(result);
      } catch (err) {
        console.error('[AttendanceBook] error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dateStr, dow]);

  // Derived filter options
  const teacherOptions = useMemo(() => {
    const m = new Map<string, string>();
    slots.forEach((s) => { if (s.teacherId) m.set(s.teacherId, s.teacherName); });
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [slots]);

  const subjectOptions = useMemo(
    () => Array.from(new Set(slots.map((s) => s.subject))).filter(Boolean).sort(),
    [slots],
  );

  const classOptions = useMemo(
    () => Array.from(new Map(slots.map((s) => [s.classId, s.className])), ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [slots],
  );

  const filteredSlots = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return slots
      .filter((s) => teacherFilter === 'all' || s.teacherId === teacherFilter)
      .filter((s) => subjectFilter === 'all' || s.subject === subjectFilter)
      .filter((s) => classFilter === 'all' || s.classId === classFilter)
      .map((s) => {
        let students = s.students;
        if (statusFilter !== 'all') {
          students = students.filter((st) => {
            const isAbsent = !!st.status && (st.status.includes('결석') || st.status === '미등원');
            if (statusFilter === 'absent') return isAbsent;
            if (statusFilter === 'late') return st.status === '지각';
            if (statusFilter === 'present') return st.status === '정상등원';
            if (statusFilter === 'empty') return !st.status;
            return true;
          });
        }
        if (q) students = students.filter((st) => st.name.toLowerCase().includes(q));
        return { ...s, students };
      })
      .filter((s) => {
        if (statusFilter === 'all' && !q) return true;
        return s.students.length > 0;
      });
  }, [slots, teacherFilter, subjectFilter, classFilter, statusFilter, studentQuery]);

  const totals = useMemo(() => {
    let total = 0, present = 0, late = 0, absent = 0, empty = 0;
    filteredSlots.forEach((s) => {
      s.students.forEach((st) => {
        total++;
        if (st.status === '정상등원') present++;
        else if (st.status === '지각') { present++; late++; }
        else if (st.status && (st.status.includes('결석') || st.status === '미등원')) absent++;
        else empty++;
      });
    });
    return { total, present, late, absent, empty };
  }, [filteredSlots]);

  const shiftDay = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d);
  };

  const resetFilters = () => {
    setTeacherFilter('all'); setSubjectFilter('all'); setClassFilter('all');
    setStatusFilter('all'); setStudentQuery('');
  };

  const hasActiveFilters = teacherFilter !== 'all' || subjectFilter !== 'all'
    || classFilter !== 'all' || statusFilter !== 'all' || studentQuery.trim() !== '';

  return (
    <div className="space-y-3 animate-fade-in pb-8">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/85 backdrop-blur-md border-b">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-base font-semibold whitespace-nowrap">출석부</h1>
            <div className="hidden md:flex items-center gap-1 ml-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftDay(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-7 px-2 gap-1.5 font-normal text-xs">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {format(date, 'M월 d일 (eee)', { locale: ko })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftDay(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDate(new Date())}>오늘</Button>
            </div>
          </div>

          {/* Stat strip — always visible */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatPill label="전체" value={totals.total} />
            <StatPill label="출석" value={totals.present} tone="text-emerald-600" dot="bg-emerald-500" />
            <StatPill label="지각" value={totals.late} tone="text-amber-600" dot="bg-amber-500" />
            <StatPill label="결석" value={totals.absent} tone="text-destructive" dot="bg-destructive" />
            <StatPill label="미기록" value={totals.empty} tone="text-muted-foreground" dot="bg-muted-foreground/50" />
          </div>
        </div>

        {/* Mobile date row */}
        <div className="flex md:hidden items-center gap-1 mt-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftDay(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 px-2 gap-1.5 font-normal text-xs flex-1">
                <CalendarIcon className="w-3.5 h-3.5" />
                {format(date, 'yyyy년 M월 d일 (eee)', { locale: ko })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftDay(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Quick search + collapsible filters */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="학생 이름 검색"
              className="h-8 pl-8 pr-7 rounded-md border border-input bg-background text-xs w-full focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {studentQuery && (
              <button onClick={() => setStudentQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status quick chips */}
          <div className="hidden sm:flex items-center gap-1">
            {[
              { v: 'all', label: '전체' },
              { v: 'absent', label: '결석' },
              { v: 'late', label: '지각' },
              { v: 'empty', label: '미기록' },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setStatusFilter(opt.v)}
                className={cn(
                  'h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors',
                  statusFilter === opt.v
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Collapsible className="ml-auto">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5" />
                필터
                {hasActiveFilters && <Badge variant="secondary" className="h-4 px-1 text-[9px]">ON</Badge>}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 absolute right-2 z-30 bg-popover border rounded-md shadow-lg p-3 w-[min(90vw,420px)]">
              <div className="grid grid-cols-2 gap-2">
                <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선생님" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 선생님</SelectItem>
                    {teacherOptions.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="과목" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 과목</SelectItem>
                    {subjectOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="반" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 반</SelectItem>
                    {classOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="출결" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 출결</SelectItem>
                    <SelectItem value="present">정상등원</SelectItem>
                    <SelectItem value="late">지각</SelectItem>
                    <SelectItem value="absent">결석/미등원</SelectItem>
                    <SelectItem value="empty">기록 없음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-full mt-2 text-xs" onClick={resetFilters}>필터 초기화</Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <Skeleton className="h-64" />
      ) : filteredSlots.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">조건에 해당하는 수업이 없습니다</CardContent></Card>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filteredSlots.map((s) => {
            const present = s.students.filter((st) => st.status === '정상등원' || st.status === '지각').length;
            const absent = s.students.filter((st) => st.status && (st.status.includes('결석') || st.status === '미등원')).length;
            const empty = s.students.filter((st) => !st.status).length;
            const total = s.students.length;
            const pct = total > 0 ? Math.round((present / total) * 100) : 0;
            const hasIssue = absent > 0 || empty > 0;

            return (
              <div
                key={s.scheduleId}
                className={cn(
                  'border rounded-lg p-3 bg-card hover:shadow-sm transition-all',
                  hasIssue && 'border-l-4 border-l-amber-500/60',
                  absent > 0 && 'border-l-destructive/70',
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold tabular-nums">
                        {s.startTime || '—'}
                      </span>
                      <span className="text-sm font-semibold truncate">{s.className}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{s.subject}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.teacherName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">
                      <span className="text-emerald-600">{present}</span>
                      <span className="text-muted-foreground/50">/{total}</span>
                    </div>
                    <div className="text-[9px] text-muted-foreground">{pct}%</div>
                  </div>
                </div>

                {/* Progress bar */}
                {total > 0 && (
                  <div className="flex h-1 rounded-full overflow-hidden bg-muted mb-2">
                    <div className="bg-emerald-500" style={{ width: `${(present / total) * 100}%` }} />
                    <div className="bg-destructive" style={{ width: `${(absent / total) * 100}%` }} />
                    <div className="bg-muted-foreground/30" style={{ width: `${(empty / total) * 100}%` }} />
                  </div>
                )}

                {/* Students grid */}
                {s.students.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {s.students.map((st) => {
                      const isPresent = st.status === '정상등원';
                      const isLate = st.status === '지각';
                      const isAbsent = st.status && (st.status.includes('결석') || st.status === '미등원');
                      const info = st.status ? STATUS_LABEL[st.status] : null;
                      return (
                        <span
                          key={st.id}
                          title={info?.label || '기록 없음'}
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border',
                            isPresent && 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
                            isLate && 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
                            isAbsent && 'bg-destructive/15 text-destructive border-destructive/40',
                            !st.status && 'bg-muted text-muted-foreground border-transparent',
                          )}
                        >
                          <span className={cn(
                            'w-1.5 h-1.5 rounded-full shrink-0',
                            isPresent && 'bg-emerald-500',
                            isLate && 'bg-amber-500',
                            isAbsent && 'bg-destructive',
                            !st.status && 'bg-muted-foreground/40',
                          )} />
                          {st.name}
                          {isLate && <span className="text-[9px] opacity-70">지</span>}
                          {isAbsent && <span className="text-[9px] opacity-70">{info?.label?.[0] || '결'}</span>}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">조건에 맞는 학생 없음</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AttendanceBookPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AttendanceBookContent />
    </ProtectedRoute>
  );
}
