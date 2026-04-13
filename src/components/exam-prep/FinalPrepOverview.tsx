import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Lock, RefreshCw, AlertTriangle, School, User, Users, CalendarClock } from 'lucide-react';
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

type SortMode = 'teacher' | 'student' | 'school';

interface FinalPrepEntry {
  courseId: string; courseTitle: string; subject: string;
  teacherId: string; teacherName: string; schoolName: string;
  session: Session; enrollment: Enrollment | undefined;
  studentId: string; studentName: string; studentSchool: string;
  slotStart: string; slotEnd: string;
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

export function FinalPrepOverview({
  courses, studentMap, teacherMap,
}: {
  courses: CourseView[];
  studentMap: Record<string, Student>;
  teacherMap: Record<string, string>;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('teacher');

  // Extract all "직전특강" sessions with student assignments
  const finalPrepEntries = useMemo(() => {
    const entries: FinalPrepEntry[] = [];
    for (const course of courses) {
      const finalSessions = course.sessions.filter(s => s.session_label === '직전특강');
      if (finalSessions.length === 0) continue;

      for (const sess of finalSessions) {
        // Gather all students from time_slots
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
          // If no slots, use enrollment list
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
            slotStart: slotStart?.slice(0, 5) || '',
            slotEnd: slotEnd?.slice(0, 5) || '',
          });
        }
      }
    }
    return entries;
  }, [courses, studentMap, teacherMap]);

  // Group by sort mode
  const grouped = useMemo(() => {
    const map: Record<string, FinalPrepEntry[]> = {};
    for (const e of finalPrepEntries) {
      let key: string;
      if (sortMode === 'teacher') key = e.teacherName;
      else if (sortMode === 'student') key = e.studentName;
      else key = e.studentSchool;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    // Sort groups alphabetically, sort entries within by date then time
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    for (const [, entries] of sorted) {
      entries.sort((a, b) => {
        const dc = a.session.schedule_date.localeCompare(b.session.schedule_date);
        if (dc !== 0) return dc;
        return a.slotStart.localeCompare(b.slotStart);
      });
    }
    return sorted;
  }, [finalPrepEntries, sortMode]);

  if (finalPrepEntries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          등록된 직전특강 일정이 없습니다
        </CardContent>
      </Card>
    );
  }

  const sortIcon = sortMode === 'teacher' ? <User className="w-3.5 h-3.5" /> : sortMode === 'student' ? <Users className="w-3.5 h-3.5" /> : <School className="w-3.5 h-3.5" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-destructive" />
          직전특강 모아보기
          <Badge variant="outline" className="text-[10px]">{finalPrepEntries.length}건</Badge>
        </h3>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <div className="flex items-center gap-1.5">
              {sortIcon}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
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
              <span className="text-sm font-bold">{groupName}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{entries.length}건</Badge>
            </div>
            <div className="divide-y">
              {entries.map((entry, idx) => {
                const status = entry.enrollment?.status || 'pending';
                const statusInfo = STATUS_MAP[status];
                return (
                  <div key={`${entry.courseId}-${entry.studentId}-${idx}`} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    {/* Date */}
                    <div className="min-w-[80px] shrink-0">
                      <span className="text-xs font-medium">{fmtDate(entry.session.schedule_date)}</span>
                    </div>
                    {/* Time */}
                    <div className="min-w-[90px] shrink-0">
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.slotStart}-{entry.slotEnd}
                      </span>
                    </div>
                    {/* Subject */}
                    <Badge variant="outline" className="text-[10px] shrink-0">{entry.subject}</Badge>
                    {/* Context info based on sort */}
                    {sortMode !== 'teacher' && (
                      <span className="text-xs text-muted-foreground shrink-0">{entry.teacherName}</span>
                    )}
                    {sortMode !== 'student' && (
                      <span className="text-xs font-medium">{entry.studentName}</span>
                    )}
                    {sortMode !== 'school' && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{entry.studentSchool}</span>
                    )}
                    {/* Status */}
                    <div className="ml-auto shrink-0">
                      <Badge
                        variant={statusInfo?.variant || 'outline'}
                        className={cn('text-[10px] gap-0.5',
                          status === 'needs_reconfirm' && 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300'
                        )}>
                        {status === 'confirmed' && <Lock className="w-2.5 h-2.5" />}
                        {status === 'needs_reconfirm' && <RefreshCw className="w-2.5 h-2.5" />}
                        {statusInfo?.label || status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
