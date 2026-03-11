import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BookOpen, Clock, ClipboardCheck, FileText, Zap, RefreshCw } from 'lucide-react';

interface HomeworkItem {
  id: string;
  content: string;
  subject: string;
  assigned_date: string;
  check_status: string;
}

interface UpcomingClass {
  class_name: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface VocabSchedule {
  id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  schedule_type: string;
  test_time?: string | null;
}

interface TestScheduleItem {
  id: string;
  test_date: string;
  test_time: string | null;
  subject: string;
  test_type: string;
  content: string | null;
}

interface SupplementaryLesson {
  id: string;
  lesson_date: string;
  subject: string;
  notes: string | null;
  lesson_range: string;
  submitted: boolean;
  teacher_name: string | null;
}

interface Props {
  homework: HomeworkItem[];
  classes: UpcomingClass[];
  vocabSchedules: VocabSchedule[];
  testSchedules?: TestScheduleItem[];
  supplementaryLessons?: SupplementaryLesson[];
}

const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '수학': { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  '영어': { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  '국어': { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  '과학': { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function getSubjectStyle(subject: string) {
  return SUBJECT_COLORS[subject] || { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border' };
}

export default function StudentWeeklyCalendar({ homework, classes, vocabSchedules, testSchedules = [], supplementaryLessons = [] }: Props) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Map homework by date
  const hwByDate = new Map<string, HomeworkItem[]>();
  homework.forEach(hw => {
    const key = hw.assigned_date;
    if (!hwByDate.has(key)) hwByDate.set(key, []);
    hwByDate.get(key)!.push(hw);
  });

  // Map classes by day_of_week
  const classesByDow = new Map<number, UpcomingClass[]>();
  classes.forEach(cls => {
    if (!classesByDow.has(cls.day_of_week)) classesByDow.set(cls.day_of_week, []);
    classesByDow.get(cls.day_of_week)!.push(cls);
  });

  // Map vocab by date
  const vocabByDate = new Map<string, VocabSchedule[]>();
  vocabSchedules.forEach(vs => {
    if (!vocabByDate.has(vs.test_date)) vocabByDate.set(vs.test_date, []);
    vocabByDate.get(vs.test_date)!.push(vs);
  });

  // Map test schedules by date
  const testByDate = new Map<string, TestScheduleItem[]>();
  testSchedules.forEach(ts => {
    if (!testByDate.has(ts.test_date)) testByDate.set(ts.test_date, []);
    testByDate.get(ts.test_date)!.push(ts);
  });

  // Map supplementary lessons by date
  const suppByDate = new Map<string, SupplementaryLesson[]>();
  supplementaryLessons.forEach(sl => {
    if (!suppByDate.has(sl.lesson_date)) suppByDate.set(sl.lesson_date, []);
    suppByDate.get(sl.lesson_date)!.push(sl);
  });

  // Collect today's tests for highlight section
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayTests = testByDate.get(todayStr) || [];
  const todayVocab = vocabByDate.get(todayStr) || [];
  const todaySupp = suppByDate.get(todayStr) || [];
  const hasTodayHighlight = todayTests.length > 0 || todayVocab.length > 0 || todaySupp.length > 0;

  return (
    <div className="space-y-4">
      {/* Today's test highlight */}
      {hasTodayHighlight && (
        <div className="rounded-xl bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/30 dark:to-amber-950/30 border border-rose-200/60 dark:border-rose-800/40 p-3.5 space-y-2">
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
            🔥 오늘의 시험 · 일정
          </p>
          {todayTests.map(ts => {
            const style = getSubjectStyle(ts.subject);
            const isGuerrilla = ts.test_type === 'guerrilla';
            return (
              <div key={ts.id} className={cn('rounded-lg p-2.5 border', style.bg, style.border)}>
                <div className="flex items-center gap-2">
                  {isGuerrilla ? <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> : <FileText className={cn('w-3.5 h-3.5 flex-shrink-0', style.text)} />}
                  <span className={cn('text-xs font-bold', style.text)}>{ts.subject}</span>
                  {ts.test_time && <span className="text-[10px] text-muted-foreground">{ts.test_time.slice(0, 5)}</span>}
                  {isGuerrilla && <span className="text-[9px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded-full font-semibold">게릴라</span>}
                </div>
                {ts.content && (
                  <p className={cn('text-[11px] mt-1 font-medium leading-snug', style.text, 'opacity-80')}>
                    📖 범위: {ts.content}
                  </p>
                )}
              </div>
            );
          })}
          {todayVocab.map(vs => (
            <div key={vs.id} className="rounded-lg p-2.5 border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2">
                {vs.schedule_type === 'guerrilla' ? <Zap className="w-3.5 h-3.5 text-amber-600" /> : <BookOpen className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />}
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">영어 단어시험</span>
                {vs.test_time && <span className="text-[10px] text-muted-foreground">{(vs.test_time as string).slice(0, 5)}</span>}
                {vs.schedule_type === 'retest' && <span className="text-[9px] bg-rose-200 dark:bg-rose-800 text-rose-700 dark:text-rose-200 px-1.5 py-0.5 rounded-full font-semibold">재시험</span>}
              </div>
              <p className="text-[11px] mt-1 font-medium text-amber-700 dark:text-amber-300 opacity-80">
                📖 {vs.book_name} · Day {vs.day_number}
              </p>
            </div>
          ))}
          {todaySupp.map(sl => {
            const style = getSubjectStyle(sl.subject);
            const timeMatch = sl.notes?.match(/\[보충 시간:\s*(\d{1,2}:\d{2})\]/);
            const timeLabel = timeMatch ? timeMatch[1] : '시간 미정';
            return (
              <div key={sl.id} className={cn('rounded-lg p-2.5 border', style.bg, style.border)}>
                <div className="flex items-center gap-2">
                  <RefreshCw className={cn('w-3.5 h-3.5 flex-shrink-0', style.text)} />
                  <span className={cn('text-xs font-bold', style.text)}>{sl.subject} 보충</span>
                  <span className="text-[10px] text-muted-foreground">{timeLabel}</span>
                </div>
                {sl.lesson_range && (
                  <p className={cn('text-[11px] mt-1 font-medium leading-snug', style.text, 'opacity-80')}>
                    📖 범위: {sl.lesson_range}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Day header row */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => {
          const dayIsToday = isToday(day);
          const isSun = day.getDay() === 0;
          const isSat = day.getDay() === 6;
          return (
            <div key={i} className="flex flex-col items-center">
              <span className={cn(
                'text-[10px] font-semibold',
                isSun ? 'text-rose-400' : isSat ? 'text-blue-400' : 'text-muted-foreground'
              )}>
                {DAY_LABELS[day.getDay()]}
              </span>
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-0.5 transition-all',
                  dayIsToday
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                    : 'text-foreground'
                )}
              >
                {format(day, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Events per day */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dow = day.getDay();
          const dayHw = hwByDate.get(dateKey) || [];
          const dayCls = classesByDow.get(dow) || [];
          const dayVocab = vocabByDate.get(dateKey) || [];
          const dayTests = testByDate.get(dateKey) || [];
          const daySupp = suppByDate.get(dateKey) || [];
          const hasEvents = dayHw.length > 0 || dayCls.length > 0 || dayVocab.length > 0 || dayTests.length > 0 || daySupp.length > 0;
          const dayIsToday = isToday(day);

          return (
            <div
              key={i}
              className={cn(
                'min-h-[80px] rounded-xl p-0.5 flex flex-col gap-[3px] transition-all',
                dayIsToday
                  ? 'bg-primary/8 border-2 border-primary/25 shadow-sm'
                  : 'bg-muted/20 border border-transparent'
              )}
            >
              {/* Classes - show subject + time */}
              {dayCls.map((cls, j) => {
                const style = getSubjectStyle(cls.subject);
                return (
                  <div
                    key={`c-${j}`}
                    className={cn('rounded-md px-1 py-[3px] text-[8px] leading-tight font-semibold truncate border', style.bg, style.text, style.border)}
                    title={`${cls.class_name} ${cls.start_time?.slice(0, 5)}`}
                  >
                    <Clock className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />
                    {cls.start_time?.slice(0, 5)} {cls.subject}
                  </div>
                );
              })}
              {/* Supplementary lessons */}
              {daySupp.map((sl, j) => {
                const style = getSubjectStyle(sl.subject);
                const timeMatch = sl.notes?.match(/\[보충 시간:\s*(\d{1,2}:\d{2})\]/);
                const timeLabel = timeMatch ? timeMatch[1] : '미정';
                return (
                  <div
                    key={`s-${j}`}
                    className={cn('rounded-md px-1 py-[3px] text-[8px] leading-tight font-semibold truncate border ring-1 ring-inset', style.bg, style.text, style.border, 'ring-rose-300/50 dark:ring-rose-700/50')}
                    title={`${sl.subject} 보충 ${timeLabel}`}
                  >
                    <RefreshCw className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />
                    {timeLabel} {sl.subject}보충
                  </div>
                );
              })}
              {/* Homework */}
              {dayHw.map((hw, j) => {
                const style = getSubjectStyle(hw.subject);
                const isDone = hw.check_status !== 'unchecked';
                return (
                  <div
                    key={`h-${j}`}
                    className={cn(
                      'rounded-md px-1 py-[3px] text-[8px] leading-tight truncate border',
                      isDone ? 'bg-muted/40 text-muted-foreground line-through border-transparent' : `${style.bg} ${style.text} font-semibold ${style.border}`
                    )}
                    title={hw.content}
                  >
                    <ClipboardCheck className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />
                    {hw.subject}
                  </div>
                );
              })}
              {/* Vocab tests - show type */}
              {dayVocab.map((vs, j) => {
                const isGuerrilla = vs.schedule_type === 'guerrilla';
                const isRetest = vs.schedule_type === 'retest';
                return (
                  <div
                    key={`v-${j}`}
                    className={cn(
                      'rounded-md px-1 py-[3px] text-[8px] leading-tight font-semibold truncate border',
                      isGuerrilla
                        ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                        : isRetest
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    )}
                    title={`${vs.book_name} Day ${vs.day_number}${isGuerrilla ? ' (게릴라)' : isRetest ? ' (재시험)' : ''}`}
                  >
                    {isGuerrilla ? '⚡' : isRetest ? <RefreshCw className="w-2.5 h-2.5 inline mr-0.5" /> : <BookOpen className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />}
                    {isRetest ? '영어재시' : `D${vs.day_number}`}
                  </div>
                );
              })}
              {/* Test schedules - show subject */}
              {dayTests.map((ts, j) => {
                const isGuerrilla = ts.test_type === 'guerrilla';
                const style = getSubjectStyle(ts.subject);
                return (
                  <div
                    key={`t-${j}`}
                    className={cn(
                      'rounded-md px-1 py-[3px] text-[8px] leading-tight font-semibold truncate border',
                      isGuerrilla
                        ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                        : `${style.bg} ${style.text} ${style.border}`
                    )}
                    title={`[${ts.subject}] ${ts.content || ''}${isGuerrilla ? ' (게릴라)' : ''}`}
                  >
                    {isGuerrilla ? <Zap className="w-2.5 h-2.5 inline mr-0.5" /> : <FileText className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />}
                    {ts.test_time ? `${ts.test_time.slice(0, 5)} ` : ''}{ts.subject}
                  </div>
                );
              })}
              {!hasEvents && <div className="flex-1" />}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-center pt-1 flex-wrap">
        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-muted/50">
          <Clock className="w-3 h-3" /> 수업
        </span>
        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-muted/50">
          <RefreshCw className="w-3 h-3" /> 보충
        </span>
        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-muted/50">
          <ClipboardCheck className="w-3 h-3" /> 숙제
        </span>
        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-muted/50">
          <BookOpen className="w-3 h-3" /> 단어
        </span>
        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-muted/50">
          <FileText className="w-3 h-3" /> 시험
        </span>
      </div>
    </div>
  );
}
