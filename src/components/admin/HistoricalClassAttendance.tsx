// HISTORICAL-CLASS-ATTENDANCE-V1
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon, Users, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getPrimaryAttendanceStatus, isAbsent, isLate, isPresent } from '@/lib/attendance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SlotRow {
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  students: { id: string; name: string; status: string | null }[];
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  '정상등원': { label: '등원', tone: 'text-emerald-600' },
  '지각': { label: '지각', tone: 'text-amber-600' },
  '인정결석': { label: '인정결석', tone: 'text-muted-foreground' },
  '무단결석': { label: '무단결석', tone: 'text-destructive' },
  '결석': { label: '결석', tone: 'text-destructive' },
  '미등원': { label: '미등원', tone: 'text-muted-foreground' },
};

export default function HistoricalClassAttendance() {
  const [date, setDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<SlotRow[]>([]);

  const dateStr = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);
  const dow = date.getDay();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: schedules } = await supabase
          .from('class_schedules')
          .select('id, start_time, end_time, class_id, teacher_id, classes(name, subject)')
          .eq('day_of_week', dow)
          .eq('is_active', true)
          .order('start_time');

        if (!schedules || schedules.length === 0) {
          if (!cancelled) setSlots([]);
          return;
        }

        const classIds = schedules.map((s: any) => s.class_id).filter(Boolean);
        const teacherIds = [...new Set(schedules.map((s: any) => s.teacher_id).filter(Boolean))] as string[];

        const [{ data: profiles }, { data: classStudents }, { data: lessonRecords }] = await Promise.all([
          teacherIds.length > 0
            ? supabase.from('profiles').select('id, full_name').in('id', teacherIds)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from('class_students').select('class_id, student_id, students(name)').in('class_id', classIds),
          supabase
            .from('lesson_records')
            .select('student_id, class_id, attendance_status, teacher_id, teacher_display_name')
            .in('class_id', classIds)
            .eq('lesson_date', dateStr),
        ]);

        const teacherMap: Record<string, string> = {};
        (profiles || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });

        const statusMap = new Map<string, string>();
        (lessonRecords || []).forEach((r: any) => {
          const arr: string[] = r.attendance_status || [];
          const status = getPrimaryAttendanceStatus(arr);
          if (status) statusMap.set(`${r.student_id}:${r.class_id}`, status);
        });

        const studentsByClass = new Map<string, { id: string; name: string }[]>();
        (classStudents || []).forEach((cs: any) => {
          if (!studentsByClass.has(cs.class_id)) studentsByClass.set(cs.class_id, []);
          studentsByClass.get(cs.class_id)!.push({ id: cs.student_id, name: cs.students?.name || '-' });
        });

        const result: SlotRow[] = (schedules as any[]).map((s) => ({
          scheduleId: s.id,
          classId: s.class_id,
          className: s.classes?.name || '-',
          subject: s.classes?.subject || '-',
          startTime: s.start_time?.slice(0, 5) || '',
          endTime: s.end_time?.slice(0, 5) || '',
          teacherName: teacherMap[s.teacher_id] || '미배정',
          students: (studentsByClass.get(s.class_id) || []).map((st) => ({
            id: st.id,
            name: st.name,
            status: statusMap.get(`${st.id}:${s.class_id}`) || null,
          })),
        }));

        if (!cancelled) setSlots(result);
      } catch (err) {
        console.error('[HistoricalClassAttendance] error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dateStr, dow]);

  const totals = useMemo(() => {
    let total = 0, present = 0, late = 0, absent = 0;
    slots.forEach((s) => {
      s.students.forEach((st) => {
        total++;
        if (isLate(st.status)) { present++; late++; }
        else if (isPresent(st.status)) present++;
        else if (isAbsent(st.status)) absent++;
      });
    });
    return { total, present, late, absent };
  }, [slots]);

  const shiftDay = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            수업시간 기록 (출석부)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            과거 일자를 선택하면 해당일에 어떤 수업이 어떤 시간대에 누구의 담당으로 진행되었는지, 학생별 출결까지 확인할 수 있습니다
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDay(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 gap-2 font-normal">
                <CalendarIcon className="w-3.5 h-3.5" />
                {format(date, 'yyyy년 M월 d일 (eee)', { locale: ko })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDay(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48" />
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">해당일에 등록된 수업이 없습니다</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <Stat label="등록 자리" value={`${totals.total}`} />
              <Stat label="출석" value={`${totals.present}`} tone="text-emerald-600" />
              <Stat label="지각" value={`${totals.late}`} tone="text-amber-600" />
              <Stat label="결석/미등원" value={`${totals.absent}`} tone="text-destructive" />
            </div>

            <div className="space-y-2">
              {slots.map((s) => {
                const present = s.students.filter((st) => isPresent(st.status)).length;
                return (
                  <div key={s.scheduleId} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                            {s.startTime}~{s.endTime}
                          </span>
                          <span className="text-sm font-semibold truncate">{s.className}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{s.subject}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {s.teacherName} 선생님
                        </p>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground shrink-0 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {present}/{s.students.length}명
                      </span>
                    </div>

                    {s.students.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                        {s.students.map((st) => {
                          const late = isLate(st.status);
                          const present = isPresent(st.status) && !late;
                          const absentFlag = isAbsent(st.status);
                          const info = st.status
                            ? { label: getAttendanceLabel(st.status) || st.status }
                            : null;
                          return (
                            <span
                              key={st.id}
                              title={info?.label || '기록 없음'}
                              className={cn(
                                'text-[11px] font-medium',
                                present && 'text-emerald-600',
                                late && 'text-amber-600',
                                absentFlag && 'text-destructive line-through',
                                !st.status && 'text-muted-foreground',
                              )}
                            >
                              {st.name}
                              {late && <span className="text-[9px] ml-0.5">(지각)</span>}
                              {absentFlag && <span className="text-[9px] ml-0.5">({info?.label || '결'})</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-bold', tone)}>{value}</div>
    </div>
  );
}
