import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BookOpen, Clock, ClipboardCheck } from 'lucide-react';

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
}

interface Props {
  homework: HomeworkItem[];
  classes: UpcomingClass[];
  vocabSchedules: VocabSchedule[];
}

const SUBJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  '수학': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  '영어': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  '국어': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  '과학': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function getSubjectStyle(subject: string) {
  return SUBJECT_COLORS[subject] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' };
}

export default function StudentWeeklyCalendar({ homework, classes, vocabSchedules }: Props) {
  const today = new Date();
  // Week starts on Monday (weekStartsOn: 1)
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Map homework by date
  const hwByDate = new Map<string, HomeworkItem[]>();
  homework.forEach(hw => {
    const key = hw.assigned_date;
    if (!hwByDate.has(key)) hwByDate.set(key, []);
    hwByDate.get(key)!.push(hw);
  });

  // Map classes by day_of_week (0=Sun, 1=Mon, ...)
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

  return (
    <div className="space-y-3">
      {/* Day header row */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => {
          const dayIsToday = isToday(day);
          return (
            <div key={i} className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground font-medium">
                {DAY_LABELS[day.getDay()]}
              </span>
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold mt-0.5',
                  dayIsToday
                    ? 'bg-primary text-primary-foreground'
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
          const hasEvents = dayHw.length > 0 || dayCls.length > 0 || dayVocab.length > 0;

          return (
            <div
              key={i}
              className={cn(
                'min-h-[72px] rounded-lg p-0.5 flex flex-col gap-0.5',
                isToday(day) ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'
              )}
            >
              {dayCls.map((cls, j) => {
                const style = getSubjectStyle(cls.subject);
                return (
                  <div
                    key={`c-${j}`}
                    className={cn('rounded px-1 py-0.5 text-[9px] leading-tight font-medium truncate', style.bg, style.text)}
                    title={`${cls.class_name} ${cls.start_time?.slice(0, 5)}`}
                  >
                    <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                    {cls.start_time?.slice(0, 5)}
                  </div>
                );
              })}
              {dayHw.map((hw, j) => {
                const style = getSubjectStyle(hw.subject);
                const isDone = hw.check_status !== 'unchecked';
                return (
                  <div
                    key={`h-${j}`}
                    className={cn(
                      'rounded px-1 py-0.5 text-[9px] leading-tight truncate',
                      isDone ? 'bg-muted/50 text-muted-foreground line-through' : `${style.bg} ${style.text} font-medium`
                    )}
                    title={hw.content}
                  >
                    <ClipboardCheck className="w-2.5 h-2.5 inline mr-0.5" />
                    {hw.subject}
                  </div>
                );
              })}
              {dayVocab.map((vs, j) => (
                <div
                  key={`v-${j}`}
                  className="rounded px-1 py-0.5 text-[9px] leading-tight font-medium truncate bg-amber-50 text-amber-700"
                  title={`${vs.book_name} Day ${vs.day_number}`}
                >
                  <BookOpen className="w-2.5 h-2.5 inline mr-0.5" />
                  D{vs.day_number}
                </div>
              ))}
              {!hasEvents && (
                <div className="flex-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground justify-center pt-1">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> 수업
        </span>
        <span className="flex items-center gap-1">
          <ClipboardCheck className="w-3 h-3" /> 숙제
        </span>
        <span className="flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> 단어시험
        </span>
      </div>
    </div>
  );
}