import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Lock, RefreshCw, School, User, Users, CalendarClock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Student {
  id: string; name: string; grade: string | null;
  school: string | null; school_level: string | null; grade_year: number | null;
}

interface SlotStudent { id: string; slot_id: string; student_id: string; }
interface TimeSlot { id: string; session_id: string; start_time: string; end_time: string; slot_order: number; students: SlotStudent[]; }
interface Session { id: string; course_id: string; session_number: number; session_label: string; schedule_date: string; start_time: string; end_time: string; time_slots: TimeSlot[]; }
interface Enrollment { id: string; course_id: string; student_id: string; status: string; confirmed_at: string | null; }
interface CourseView {
  id: string; subject: string; teacher_id: string; title: string | null;
  description: string | null; deadline_date: string; school_name: string | null;
  sessions: Session[]; enrollments: Enrollment[];
}

type SortMode = 'teacher' | 'student' | 'school' | 'date' | 'grade';

interface FinalPrepEntry {
  courseId: string; courseTitle: string; subject: string;
  teacherId: string; teacherName: string; schoolName: string;
  session: Session; enrollment: Enrollment | undefined;
  studentId: string; studentName: string; studentSchool: string;
  studentGradeYear: number | null; studentSchoolLevel: string | null;
  slotStart: string; slotEnd: string;
}

/** Group key for entries sharing same schedule slot */
function scheduleGroupKey(e: FinalPrepEntry) {
  return `${e.courseId}:${e.session.id}:${e.slotStart}-${e.slotEnd}`;
}

interface GroupedScheduleEntry {
  courseId: string; courseTitle: string; subject: string;
  teacherName: string; schoolName: string;
  session: Session;
  slotStart: string; slotEnd: string;
  students: { id: string; name: string; school: string; status: string; gradeYear: number | null; schoolLevel: string | null }[];
}

function fmtDate(dateStr: string) {
  try { return format(parseISO(dateStr), 'M/d (EEE)', { locale: ko }); }
  catch { return dateStr; }
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '미확인', variant: 'destructive' },
  confirmed: { label: '확인완료', variant: 'default' },
  auto_confirmed: { label: '시스템 확정', variant: 'secondary' },
  needs_reconfirm: { label: '재확인 필요', variant: 'outline' },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status];
  return (
    <Badge
      variant={info?.variant || 'outline'}
      className={cn('text-[10px] gap-0.5',
        status === 'needs_reconfirm' && 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300'
      )}>
      {status === 'confirmed' && <Lock className="w-2.5 h-2.5" />}
      {status === 'needs_reconfirm' && <RefreshCw className="w-2.5 h-2.5" />}
      {info?.label || status}
    </Badge>
  );
}

export function FinalPrepOverview({
  courses, studentMap, teacherMap,
}: {
  courses: CourseView[];
  studentMap: Record<string, Student>;
  teacherMap: Record<string, string>;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('teacher');
  const [gradeFilter, setGradeFilter] = useState<string>('all'); // 'all' | grade label like '고1','중3'

  const finalPrepEntries = useMemo(() => {
    const entries: FinalPrepEntry[] = [];
    for (const course of courses) {
      const finalSessions = course.sessions.filter(s => s.session_label === '직전특강');
      if (finalSessions.length === 0) continue;

      for (const sess of finalSessions) {
        const studentIds = new Set<string>();
        const studentSlots: Record<string, { start: string; end: string }[]> = {};

        if (sess.time_slots.length > 0) {
          for (const slot of sess.time_slots) {
            for (const ss of slot.students) {
              studentIds.add(ss.student_id);
              if (!studentSlots[ss.student_id]) studentSlots[ss.student_id] = [];
              studentSlots[ss.student_id].push({ start: slot.start_time, end: slot.end_time });
            }
          }
        } else {
          for (const enr of course.enrollments) {
            studentIds.add(enr.student_id);
            studentSlots[enr.student_id] = [{ start: sess.start_time, end: sess.end_time }];
          }
        }

        for (const sid of studentIds) {
          const st = studentMap[sid];
          const enr = course.enrollments.find(e => e.student_id === sid);
          const slots = studentSlots[sid] || [];
          const slotStart = slots.length > 0 ? slots[0].start : sess.start_time;
          const slotEnd = slots.length > 0 ? slots[slots.length - 1].end : sess.end_time;

          entries.push({
            courseId: course.id,
            courseTitle: course.title || `${course.subject} 특강`,
            subject: course.subject,
            teacherId: course.teacher_id,
            teacherName: teacherMap[course.teacher_id] || '—',
            schoolName: course.school_name || '미지정',
            session: sess,
            enrollment: enr,
            studentId: sid,
            studentName: st?.name || '—',
            studentSchool: st?.school || '미지정',
            studentGradeYear: st?.grade_year ?? null,
            studentSchoolLevel: st?.school_level ?? null,
            slotStart: slotStart?.slice(0, 5) || '',
            slotEnd: slotEnd?.slice(0, 5) || '',
          });
        }
      }
    }
    return entries;
  }, [courses, studentMap, teacherMap]);

  // Merge entries sharing the same schedule into grouped entries
  const groupedScheduleEntries = useMemo(() => {
    const map = new Map<string, GroupedScheduleEntry>();
    for (const e of finalPrepEntries) {
      const key = scheduleGroupKey(e);
      if (!map.has(key)) {
        map.set(key, {
          courseId: e.courseId, courseTitle: e.courseTitle, subject: e.subject,
          teacherName: e.teacherName, schoolName: e.schoolName,
          session: e.session, slotStart: e.slotStart, slotEnd: e.slotEnd,
          students: [],
        });
      }
      map.get(key)!.students.push({
        id: e.studentId, name: e.studentName, school: e.studentSchool,
        status: e.enrollment?.status || 'pending',
        gradeYear: e.studentGradeYear, schoolLevel: e.studentSchoolLevel,
      });
    }
    return Array.from(map.values());
  }, [finalPrepEntries]);

  // Group by sort mode
  const grouped = useMemo(() => {
    const map: Record<string, GroupedScheduleEntry[]> = {};
    for (const e of groupedScheduleEntries) {
      let key: string;
      if (sortMode === 'date') key = e.session.schedule_date;
      else if (sortMode === 'teacher') key = e.teacherName;
      else if (sortMode === 'school') key = e.schoolName;
      else {
        // student mode: explode back per student
        for (const st of e.students) {
          const k = st.name;
          if (!map[k]) map[k] = [];
          map[k].push({ ...e, students: [st] });
        }
        continue;
      }
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }

    const sorted = Object.entries(map).sort(([a], [b]) => {
      if (sortMode === 'date') return a.localeCompare(b);
      return a.localeCompare(b);
    });
    for (const [, entries] of sorted) {
      entries.sort((a, b) => {
        const dc = a.session.schedule_date.localeCompare(b.session.schedule_date);
        if (dc !== 0) return dc;
        return a.slotStart.localeCompare(b.slotStart);
      });
    }
    return sorted;
  }, [groupedScheduleEntries, sortMode]);

  if (finalPrepEntries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          등록된 직전특강 일정이 없습니다
        </CardContent>
      </Card>
    );
  }

  const SORT_ICONS: Record<SortMode, React.ReactNode> = {
    teacher: <User className="w-3.5 h-3.5" />,
    student: <Users className="w-3.5 h-3.5" />,
    school: <School className="w-3.5 h-3.5" />,
    date: <Calendar className="w-3.5 h-3.5" />,
  };
  const sortIcon = SORT_ICONS[sortMode];

  const formatGroupLabel = (key: string) => {
    if (sortMode === 'date') return fmtDate(key);
    return key;
  };

  const totalStudentCount = finalPrepEntries.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-destructive" />
          직전특강 모아보기
          <Badge variant="outline" className="text-[10px]">{totalStudentCount}건</Badge>
        </h3>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <div className="flex items-center gap-1.5">
              {sortIcon}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">일자별</SelectItem>
            <SelectItem value="teacher">선생님별</SelectItem>
            <SelectItem value="student">학생별</SelectItem>
            <SelectItem value="school">학교별</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {grouped.map(([groupName, entries]) => (
          <Card key={groupName} className="overflow-hidden">
            <div className="bg-muted/50 px-4 py-2.5 border-b flex items-center gap-2">
              {sortIcon}
              <span className="text-sm font-bold">{formatGroupLabel(groupName)}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {entries.reduce((sum, e) => sum + e.students.length, 0)}명
              </Badge>
            </div>
            <div className="divide-y">
              {entries.map((entry, idx) => (
                <div key={`${entry.courseId}-${entry.session.id}-${idx}`} className="px-4 py-2.5 space-y-1.5">
                  {/* Schedule info row */}
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    {sortMode !== 'date' && (
                      <span className="text-xs font-medium min-w-[80px] shrink-0">
                        {fmtDate(entry.session.schedule_date)}
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {entry.slotStart}-{entry.slotEnd}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{entry.subject}</Badge>
                    {sortMode !== 'teacher' && (
                      <span className="text-xs text-muted-foreground shrink-0">{entry.teacherName}</span>
                    )}
                    {sortMode !== 'school' && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{entry.schoolName}</span>
                    )}
                  </div>
                  {/* Students row */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    {entry.students.map((st) => (
                      <div key={st.id} className="flex items-center gap-1">
                        <span className="text-xs font-medium">{st.name}</span>
                        <StatusBadge status={st.status} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
