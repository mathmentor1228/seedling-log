import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Schedule } from './types';

interface ArchiveSummary {
  grade_year: number | null;
  subject: string | null;
  course_name: string | null;
  exam_type: string | null;
  exam_scope: string | null;
  exam_date_start: string | null;
  exam_date_end: string | null;
}

interface Props {
  schedules: Schedule[];
  archives?: ArchiveSummary[];
}

/** Group exam schedules into a date×grade timetable grid */
export function ExamTimetableGrid({ schedules, archives = [] }: Props) {
  // Only show exam-type schedules that have dates and subjects
  const examItems = schedules.filter(
    s => s.schedule_type === 'exam' && s.start_date && s.subject
  );

  if (examItems.length === 0) return null;

  // Group by date
  const dateMap = new Map<string, Schedule[]>();
  examItems.forEach(s => {
    const date = s.start_date!;
    if (!dateMap.has(date)) dateMap.set(date, []);
    dateMap.get(date)!.push(s);
  });

  const sortedDates = Array.from(dateMap.keys()).sort();

  // Collect all grades present
  const gradeSet = new Set<number>();
  examItems.forEach(s => {
    if (s.grade) gradeSet.add(s.grade);
  });
  const grades = Array.from(gradeSet).sort((a, b) => a - b);

  // If no grades, show a simple date→subjects view
  const hasGrades = grades.length > 0;

  // For each date, group by time slot (교시) if possible, otherwise by order
  function getSubjectsForDateAndGrade(date: string, grade: number): Schedule[] {
    return (dateMap.get(date) || []).filter(s => s.grade === grade);
  }

  function getSubjectsForDate(date: string): Schedule[] {
    return dateMap.get(date) || [];
  }

  function normalizeSubjectBase(value: string | null | undefined) {
    const subject = (value || '').trim();
    if (/^공통수학|^수학|^대수|^미적분|^확률|^기하/i.test(subject)) return '수학';
    if (/^공통영어|^영어/i.test(subject)) return '영어';
    if (/^공통국어|^국어|^문학|^독서|^화법/i.test(subject)) return '국어';
    if (/^통합과학|^과학|^물리|^화학|^생명|^지구/i.test(subject)) return '과학';
    if (/^통합사회|^사회|^한국지리|^세계지리|^경제/i.test(subject)) return '사회';
    if (/^한국사/i.test(subject)) return '한국사';
    return subject;
  }

  function normalizeCourseKey(value: string | null | undefined) {
    return (value || '')
      .replace(/\s+/g, '')
      .replace(/Ⅰ/g, '1')
      .replace(/Ⅱ/g, '2')
      .replace(/Ⅲ/g, '3')
      .replace(/Ⅳ/g, '4')
      .toLowerCase();
  }

  function normalizeExamType(value: string | null | undefined) {
    const text = value || '';
    if (/1차지필|중간/i.test(text)) return '중간고사';
    if (/2차지필|기말/i.test(text)) return '기말고사';
    return null;
  }

  function isMatchingExamWindow(schedule: Schedule, archive: ArchiveSummary) {
    if (!schedule.start_date || !archive.exam_date_start) return true;

    const scheduleEnd = schedule.end_date || schedule.start_date;
    const archiveEnd = archive.exam_date_end || archive.exam_date_start;

    return schedule.start_date === archive.exam_date_start || scheduleEnd === archiveEnd;
  }

  function getResolvedScope(schedule: Schedule) {
    const baseSubject = normalizeSubjectBase(schedule.subject);
    const courseKey = normalizeCourseKey(schedule.subject);
    const examType = normalizeExamType(schedule.title);

    const candidates = archives.filter((archive) => {
      if (schedule.grade && archive.grade_year && archive.grade_year !== schedule.grade) return false;
      if (normalizeSubjectBase(archive.subject) !== baseSubject) return false;
      if (examType && archive.exam_type && archive.exam_type !== examType) return false;
      return isMatchingExamWindow(schedule, archive);
    });

    const matchedArchive =
      candidates.find((archive) => normalizeCourseKey(archive.course_name) === courseKey) ||
      candidates.find((archive) => normalizeCourseKey(archive.subject) === courseKey) ||
      candidates.find((archive) => Boolean(archive.exam_scope));

    return [schedule.description, matchedArchive?.exam_scope]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.length - a.length)[0] || null;
  }

  const DAY_COLORS: Record<string, string> = {
    '월': 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    '화': 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
    '수': 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    '목': 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
    '금': 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800',
    '토': 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800',
    '일': 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  };

  // Subject color palette for visual distinction
  const SUBJECT_COLORS = [
    'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
    'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300',
    'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  ];

  const subjectColorMap = new Map<string, string>();
  let colorIdx = 0;
  examItems.forEach(s => {
    if (s.subject && !subjectColorMap.has(s.subject)) {
      subjectColorMap.set(s.subject, SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length]);
      colorIdx++;
    }
  });

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-1.5">
        📋 시험 시간표
      </h3>

      {hasGrades ? (
        /* Grid with grade columns */
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-3 py-2 border-b-2 border-border text-xs text-muted-foreground font-semibold w-[110px]">
                  날짜
                </th>
                <th className="text-center px-2 py-2 border-b-2 border-border text-xs text-muted-foreground font-semibold w-[64px]">
                  교시
                </th>
                {grades.map(g => (
                  <th key={g} className="text-center px-3 py-2 border-b-2 border-border text-xs font-semibold">
                    {g}학년
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDates.map(date => {
                const d = parseISO(date);
                const dayName = format(d, 'E', { locale: ko });
                const dayColor = DAY_COLORS[dayName] || '';

                // How many "rows" (교시) for this date?
                const maxSubjects = Math.max(
                  ...grades.map(g => getSubjectsForDateAndGrade(date, g).length),
                  1
                );

                return Array.from({ length: maxSubjects }, (_, rowIdx) => (
                  <tr
                    key={`${date}-${rowIdx}`}
                    className={cn(
                      "border-b border-border/50",
                      dayColor,
                      rowIdx === maxSubjects - 1 && "border-b-2 border-b-border"
                    )}
                  >
                    {rowIdx === 0 && (
                      <td
                        rowSpan={maxSubjects}
                        className="px-3 py-2 font-medium align-top border-r-2 border-border/60"
                      >
                        <div className="text-xs font-bold">
                          {format(d, 'M/d')}
                          <span className="ml-1 text-[11px]">({dayName})</span>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-center align-middle border-r border-border/40 bg-background/40">
                      <span className="inline-flex items-center justify-center min-w-[36px] h-6 rounded-md bg-primary/10 text-primary text-[11px] font-bold tabular-nums">
                        {rowIdx + 1}교시
                      </span>
                    </td>
                    {grades.map(g => {
                      const subjects = getSubjectsForDateAndGrade(date, g);
                      const subj = subjects[rowIdx];
                      const scopeText = subj ? getResolvedScope(subj) : null;
                      return (
                        <td key={g} className="px-2 py-1.5 text-center align-top border-r border-border/20 last:border-r-0">
                          {subj ? (
                            <div className="space-y-1 text-left">
                              <span className={cn(
                                "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
                                subjectColorMap.get(subj.subject!) || 'bg-muted text-muted-foreground'
                              )}>
                                {subj.subject}
                              </span>
                              {scopeText && (
                                <div className="text-[10px] leading-4 text-muted-foreground whitespace-pre-wrap break-words" title={scopeText}>
                                  {scopeText}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Simple date → subjects list when no grade info */
        <div className="space-y-2">
          {sortedDates.map(date => {
            const d = parseISO(date);
            const dayName = format(d, 'E', { locale: ko });
            const dayColor = DAY_COLORS[dayName] || '';
            const subjects = getSubjectsForDate(date);

            return (
              <div key={date} className={cn("flex items-start gap-3 rounded-lg px-3 py-2 border", dayColor)}>
                <div className="w-[80px] shrink-0">
                  <div className="text-xs font-bold">
                    {format(d, 'M/d')}
                    <span className="ml-1">({dayName})</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s, i) => (
                    <Badge
                      key={i}
                      className={cn(
                        "text-xs border-0",
                        subjectColorMap.get(s.subject!) || 'bg-muted text-muted-foreground'
                      )}
                    >
                      {s.subject}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
