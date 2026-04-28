import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, GraduationCap, BookOpen, ChevronLeft, ChevronRight, Calendar, Camera, MessageSquare, TrendingUp } from 'lucide-react';
import { ExamDdayBannerStatic } from '@/components/ExamDdayBanner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

/* ═══════ Types ═══════ */
interface StudentInfo { name: string; school: string | null; school_level: string | null; grade_year: number | null; grade: string | null; }
interface Homework { id: string; content: string; subject: string; assigned_date: string; check_status: string; result: string | null; notes: string | null; submitted_at: string | null; submission_image_url: string | null; }
interface LessonRecord { id: string; date: string; subject: string; range: string; course: string | null; understanding_score: number | null; attendance_status: string[] | null; lesson_types: string[]; notes: string | null; learning_issues: string[]; next_lesson_goal: string | null; }
interface Attendance { date: string; status: string; note: string | null; }
interface WeeklyReport { id: string; week_start: string; week_end: string; total_lessons: number; avg_understanding: number | null; homework_completion_rate: number | null; risk_level: string | null; parent_message: string | null; generated_at: string; }
interface VocabScheduleItem { id: string; test_date: string; day_number: number; book_name: string; schedule_type: string; }
interface VocabResultItem { id: string; test_date: string; day_number: number; book_name: string; score_percent: number | null; passed: boolean; total_words: number | null; correct_words: number | null; }
interface ClassScheduleItem { class_name: string; subject: string; day_of_week: number; start_time: string; end_time: string; }
interface UpcomingSupplement { id: string; date: string; subject: string; range: string; course: string | null; time: string | null; teacher_name: string | null; }
interface UnpaidTextbook { id: string; textbook_name: string; subject: string; total_amount: number; created_at: string; }
interface ExamPrepScheduleItem { course_id: string; subject: string; title: string; description: string | null; status: string; sessions: Array<{ session_label: string; schedule_date: string; start_time: string; end_time: string }>; }
interface DeepExamReport { id: string; overall_insights: string | null; difficult_points: Array<{ title?: string; reason?: string; study_tip?: string }>; score_band_recommendations: Array<{ band?: string; diagnosis?: string; priority?: string }>; student_recommendations: Array<{ student_id?: string; student_name?: string; score_band?: string; summary?: string; recommended_actions?: string[] }>; published_at: string | null; exam_analysis_reports?: { school_name?: string; subject?: string; exam_year?: number; exam_period?: string; exam_type?: string; exam_scope?: string | null }; }
interface PortalData { student: StudentInfo; homework: Homework[]; lessons: LessonRecord[]; attendance: Attendance[]; reports: WeeklyReport[]; vocab_schedules?: VocabScheduleItem[]; vocab_results?: VocabResultItem[]; class_schedule?: ClassScheduleItem[]; upcoming_supplements?: UpcomingSupplement[]; exam_events?: Array<{ id: string; title: string; start_at: string; end_at: string | null }>; unpaid_textbooks?: UnpaidTextbook[]; account_info?: string | null; exam_prep_schedules?: ExamPrepScheduleItem[]; deep_exam_reports?: DeepExamReport[]; }

/* ═══════ Constants ═══════ */
const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  '수학': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  '영어': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  '국어': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  '과학': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
};
const DEFAULT_COLOR = { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ═══════ Main Component ═══════ */
export default function ParentPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('유효하지 않은 링크입니다.'); setLoading(false); return; }
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-portal?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        const result = await res.json();
        if (!res.ok || result.error) { setError(result.error || '데이터를 불러올 수 없습니다.'); return; }
        setData(result);
      } catch { setError('데이터를 불러오는 중 오류가 발생했습니다.'); }
      finally { setLoading(false); }
    })();
  }, [token]);

  // Deduplicate reports by week_start — keep only the latest generated_at per week
  // Must be before any early returns to maintain hooks order
  const reports = useMemo(() => {
    const rawReports = data?.reports || [];
    const weekMap = new Map<string, WeeklyReport>();
    for (const r of rawReports) {
      const existing = weekMap.get(r.week_start);
      if (!existing || new Date(r.generated_at) > new Date(existing.generated_at)) {
        weekMap.set(r.week_start, r);
      }
    }
    return Array.from(weekMap.values()).sort((a, b) => b.week_start.localeCompare(a.week_start));
  }, [data?.reports]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-destructive/5 to-background p-4">
      <Card className="max-w-sm w-full shadow-elevated">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h2 className="font-bold text-lg mb-2 text-foreground">접속할 수 없습니다</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  const { student, homework, lessons, attendance } = data;
  const vocabSchedules = data.vocab_schedules || [];
  const vocabResults = data.vocab_results || [];
  const classSchedule = data.class_schedule || [];
  const upcomingSupplements = data.upcoming_supplements || [];
  const deepExamReports = data.deep_exam_reports || [];
  const label = `${student.name}${student.school_level && student.grade_year ? ` (${student.school_level}${student.grade_year})` : ''}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/[0.03] to-background">
      <header className="bg-card/80 backdrop-blur-xl border-b border-border px-4 py-3.5 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <GraduationCap className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight text-foreground">{label}</p>
            <p className="text-[11px] text-muted-foreground">학습 현황</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-5">
        {/* Unpaid textbook fees - top priority notice */}
        {(data.unpaid_textbooks && data.unpaid_textbooks.length > 0) && (
          <Card className="border-yellow-300 bg-yellow-50/80 dark:bg-yellow-950/30 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                미납 교재비 안내
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {data.unpaid_textbooks.map(tb => (
                <div key={tb.id} className="flex items-center justify-between py-1.5 border-b border-yellow-200/60 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{tb.textbook_name}</p>
                    <p className="text-xs text-muted-foreground">{tb.subject}</p>
                  </div>
                  <p className="text-sm font-bold text-yellow-800 dark:text-yellow-300">{tb.total_amount.toLocaleString()}원</p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-yellow-300/60">
                <span className="text-xs font-medium text-muted-foreground">총 미납액</span>
                <span className="text-base font-bold text-yellow-800 dark:text-yellow-300">
                  {data.unpaid_textbooks.reduce((s, t) => s + t.total_amount, 0).toLocaleString()}원
                </span>
              </div>
              {data.account_info && (
                <div className="mt-2 p-2.5 rounded-lg bg-white/80 dark:bg-background/50 border border-yellow-200">
                  <p className="text-xs text-muted-foreground mb-0.5">입금 계좌</p>
                  <p className="text-sm font-bold text-foreground">{data.account_info}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* EXAM-DDAY-V1: Exam D-day countdown */}
        {data.exam_events && data.exam_events.length > 0 && (
          <ExamDdayBannerStatic exams={data.exam_events} />
        )}

        {/* Exam Prep Schedules for Parent */}
        {data.exam_prep_schedules && data.exam_prep_schedules.length > 0 && (
          <ExamPrepParentSection schedules={data.exam_prep_schedules} />
        )}

        {deepExamReports.length > 0 && <DeepExamParentSection reports={deepExamReports} studentName={student.name} />}

        {/* Summary Stats */}
        <SummaryCards lessons={lessons} homework={homework} />

        {/* Learning Trend Chart */}
        {lessons.length >= 2 && (
          <LearningTrendChart lessons={lessons} />
        )}
        {classSchedule.length > 0 && (
          <ClassScheduleSection schedule={classSchedule} />
        )}

        {/* Upcoming 보충 Lessons */}
        {upcomingSupplements.length > 0 && (
          <SupplementSection supplements={upcomingSupplements} />
        )}

        {/* Calendar */}
        <MiniCalendar
          lessons={lessons}
          homework={homework}
          attendance={attendance}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* Timeline / Detail */}
        {selectedDate ? (
          <DayDetail
            date={selectedDate}
            lessons={lessons.filter(l => l.date === selectedDate)}
            homework={homework.filter(h => h.assigned_date === selectedDate)}
            attendance={attendance.filter(a => a.date === selectedDate)}
            onClose={() => setSelectedDate(null)}
          />
        ) : (
          <Timeline lessons={lessons} homework={homework} />
        )}

        {/* Vocab Test Section */}
        {(vocabSchedules.length > 0 || vocabResults.length > 0) && (
          <VocabSection schedules={vocabSchedules} results={vocabResults} />
        )}

        {/* Reports */}
        {reports.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground px-1">📋 주간 리포트</h3>
            <ReportsSection reports={reports} />
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground/50 pt-4 pb-8">더멘토학원 · MENTOR LOG</p>
      </main>
    </div>
  );
}

/* ═══════ Status Banner + Summary ═══════ */
function SummaryCards({ lessons, homework }: { lessons: LessonRecord[]; homework: Homework[] }) {
  const totalLessons = lessons.length;
  const checkedHw = homework.filter(h => h.check_status === 'checked');
  const goodHw = checkedHw.filter(h => h.result === 'completed' || h.result === 'good' || h.result === 'excellent');
  const hwRate = checkedHw.length > 0 ? Math.round((goodHw.length / checkedHw.length) * 100) : null;
  const scoredLessons = lessons.filter(l => l.understanding_score != null);
  const avgScore = scoredLessons.length > 0
    ? scoredLessons.reduce((s, l) => s + (l.understanding_score || 0), 0) / scoredLessons.length
    : null;
  const notDone = checkedHw.filter(h => h.result === 'not_done').length;
  const incomplete = checkedHw.filter(h => h.result === 'incomplete' || h.result === 'poor').length;

  // Determine overall status
  const status = getOverallStatus(avgScore, hwRate, notDone, incomplete, totalLessons);

  return (
    <div className="space-y-3">
      {/* Emoji Status Banner */}
      <div className={`rounded-2xl px-5 py-4 flex items-center gap-4 border shadow-card ${status.bgClass}`}>
        <span className="text-4xl">{status.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${status.titleColor}`}>{status.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{status.desc}</p>
        </div>
      </div>

      {/* Compact Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat value={totalLessons} label="수업" unit="회" color="text-primary" />
        <MiniStat value={avgScore != null ? avgScore.toFixed(1) : '-'} label="이해도" unit="/5" color="text-chart-5" />
        <MiniStat value={hwRate != null ? `${hwRate}` : '-'} label="숙제완료" unit="%" color="text-success" />
      </div>
    </div>
  );
}

function MiniStat({ value, label, unit, color }: { value: string | number; label: string; unit: string; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border py-3 px-2.5 text-center shadow-card">
      <p className={`text-base font-bold ${color}`}>
        {value}<span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
      </p>
      <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function getOverallStatus(avgScore: number | null, hwRate: number | null, notDone: number, incomplete: number, totalLessons: number) {
  // No data
  if (totalLessons === 0) return {
    emoji: '📭', title: '아직 수업 기록이 없어요',
    desc: '최근 2주간 수업이 없습니다.',
    bgClass: 'bg-gray-50 border-gray-100', titleColor: 'text-gray-600',
  };

  // Bad: low understanding or many not_done
  if ((avgScore != null && avgScore < 2.5) || notDone >= 3) return {
    emoji: '😟', title: '학습에 주의가 필요해요',
    desc: avgScore != null && avgScore < 2.5
      ? '이해도가 낮은 수업이 많습니다. 복습이 필요합니다.'
      : '미완료 숙제가 많습니다. 숙제 관리에 신경 써주세요.',
    bgClass: 'bg-red-50 border-red-100', titleColor: 'text-red-700',
  };

  // Warning: mediocre
  if ((avgScore != null && avgScore < 3.5) || (hwRate != null && hwRate < 60) || incomplete >= 2) return {
    emoji: '🤔', title: '조금 더 신경 쓰면 좋겠어요',
    desc: '전반적으로 무난하지만, 일부 부족한 부분이 있습니다.',
    bgClass: 'bg-amber-50 border-amber-100', titleColor: 'text-amber-700',
  };

  // Good
  if ((avgScore != null && avgScore >= 4.0) && (hwRate == null || hwRate >= 80)) return {
    emoji: '😊', title: '학습 흐름이 아주 좋아요!',
    desc: '이해도가 높고 숙제도 잘 해오고 있습니다.',
    bgClass: 'bg-emerald-50 border-emerald-100', titleColor: 'text-emerald-700',
  };

  // Normal/default
  return {
    emoji: '🙂', title: '꾸준히 잘 하고 있어요',
    desc: '학습이 안정적으로 진행되고 있습니다.',
    bgClass: 'bg-blue-50 border-blue-100', titleColor: 'text-blue-700',
  };
}

/* ═══════ Mini Calendar ═══════ */
function MiniCalendar({ lessons, homework, attendance, selectedDate, onSelectDate }: {
  lessons: LessonRecord[]; homework: Homework[]; attendance: Attendance[];
  selectedDate: string | null; onSelectDate: (d: string | null) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const { weekDays, weekLabel } = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    const m1 = days[0].getMonth() + 1;
    const m2 = days[6].getMonth() + 1;
    const label = m1 === m2 ? `${days[0].getFullYear()}년 ${m1}월` : `${m1}월 ~ ${m2}월`;
    return { weekDays: days, weekLabel: label };
  }, [weekOffset]);

  // Build lookup maps
  const lessonMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    lessons.forEach(l => { (m[l.date] ||= []).push(l.subject); });
    return m;
  }, [lessons]);

  const hwMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    homework.forEach(h => { m[h.assigned_date] = true; });
    return m;
  }, [homework]);

  const attMap = useMemo(() => {
    const m: Record<string, string> = {};
    attendance.forEach(a => { m[a.date] = a.status; });
    return m;
  }, [attendance]);

  const todayKey = toDateKey(new Date());

  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded-md hover:bg-accent transition-colors">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <span className="text-xs font-semibold text-foreground">{weekLabel}</span>
        <button
          onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}
          disabled={weekOffset >= 0}
          className="p-1 rounded-md hover:bg-accent transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0">
        {weekDays.map((day) => {
          const key = toDateKey(day);
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const dayLessons = lessonMap[key] || [];
          const hasHw = hwMap[key];
          const att = attMap[key];
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <button
              key={key}
              onClick={() => onSelectDate(isSelected ? null : key)}
              className={`flex flex-col items-center py-2.5 px-1 transition-colors relative
                ${isSelected ? 'bg-primary/5' : 'hover:bg-accent'}
                ${isWeekend ? 'opacity-60' : ''}`}
            >
              <span className={`text-[10px] mb-1 ${isWeekend ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                {WEEKDAYS[day.getDay()]}
              </span>
              <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'bg-primary text-primary-foreground' : isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                {day.getDate()}
              </span>

              {/* Dots */}
              <div className="flex gap-0.5 mt-1.5 h-2 items-center">
                {dayLessons.length > 0 && (
                  [...new Set(dayLessons)].slice(0, 3).map((subj, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${(SUBJECT_COLORS[subj] || DEFAULT_COLOR).dot}`} />
                  ))
                )}
                {hasHw && <div className="w-1.5 h-1.5 rounded-full bg-warning" />}
              </div>

              {/* Attendance indicator */}
              {att && att !== 'present' && (
                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full
                  ${att === '인정결석' ? 'bg-warning' : att === '무단결석' ? 'bg-destructive' : 'bg-muted-foreground'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border flex-wrap">
        {Object.entries(SUBJECT_COLORS).map(([subj, c]) => (
          <div key={subj} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${c.dot}`} />
            <span className="text-[9px] text-muted-foreground">{subj}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-warning" />
          <span className="text-[9px] text-muted-foreground">숙제</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════ Day Detail ═══════ */
function DayDetail({ date, lessons, homework, attendance, onClose }: {
  date: string; lessons: LessonRecord[]; homework: Homework[]; attendance: Attendance[]; onClose: () => void;
}) {
  const hasContent = lessons.length > 0 || homework.length > 0 || attendance.length > 0;

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-gray-700">{fmt(date)} 상세</h3>
        <button onClick={onClose} className="text-xs text-blue-600 hover:underline">전체 보기</button>
      </div>

      {!hasContent && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
          이 날짜에 기록이 없습니다.
        </div>
      )}

      {attendance.map((a, i) => (
        <div key={i} className={`rounded-xl px-4 py-2.5 text-xs font-medium
          ${a.status === '무단결석' ? 'bg-red-50 text-red-700 border border-red-100' :
            a.status === '인정결석' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
            'bg-gray-50 text-gray-600 border border-gray-100'}`}>
          출결: {a.status} {a.note && `· ${a.note}`}
        </div>
      ))}

      {lessons.map(l => <LessonCard key={l.id} lesson={l} />)}
      {homework.map(hw => <HomeworkCard key={hw.id} hw={hw} />)}
    </div>
  );
}

/* ═══════ Timeline ═══════ */
function Timeline({ lessons, homework }: { lessons: LessonRecord[]; homework: Homework[] }) {
  // Merge and group by date
  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    lessons.forEach(l => dateSet.add(l.date));
    homework.forEach(h => dateSet.add(h.assigned_date));
    return [...dateSet].sort((a, b) => b.localeCompare(a));
  }, [lessons, homework]);

  const lessonsByDate = useMemo(() => {
    const m: Record<string, LessonRecord[]> = {};
    lessons.forEach(l => (m[l.date] ||= []).push(l));
    return m;
  }, [lessons]);

  const hwByDate = useMemo(() => {
    const m: Record<string, Homework[]> = {};
    homework.forEach(h => (m[h.assigned_date] ||= []).push(h));
    return m;
  }, [homework]);

  if (allDates.length === 0) {
    return <div className="py-8 text-center text-gray-400 text-sm">최근 2주간 기록이 없습니다.</div>;
  }

  return (
    <div className="space-y-4">
      {allDates.map(date => (
        <div key={date} className="relative">
          {/* Date label */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-[11px] font-semibold text-gray-500">{fmt(date)}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <div className="pl-4 space-y-1.5 border-l-2 border-gray-100 ml-1">
            {(lessonsByDate[date] || []).map(l => <LessonCard key={l.id} lesson={l} />)}
            {(hwByDate[date] || []).map(hw => <HomeworkCard key={hw.id} hw={hw} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════ Learning Trend Chart ═══════ */
function LearningTrendChart({ lessons }: { lessons: LessonRecord[] }) {
  const chartData = useMemo(() => {
    // Group by date, average understanding score per date
    const byDate: Record<string, { scores: number[]; date: string }> = {};
    [...lessons].reverse().forEach(l => {
      if (l.understanding_score != null) {
        if (!byDate[l.date]) byDate[l.date] = { scores: [], date: l.date };
        byDate[l.date].scores.push(l.understanding_score);
      }
    });
    return Object.values(byDate).map(d => ({
      date: `${new Date(d.date + 'T00:00:00').getMonth() + 1}/${new Date(d.date + 'T00:00:00').getDate()}`,
      이해도: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length * 10) / 10,
    }));
  }, [lessons]);

  if (chartData.length < 2) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-bold text-gray-700">학습 추이</span>
      </div>
      <div className="px-2 py-3" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#ccc" />
            <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10 }} stroke="#ccc" width={25} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }} />
            <Line type="monotone" dataKey="이해도" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ═══════ Lesson Card ═══════ */
function LessonCard({ lesson: l }: { lesson: LessonRecord }) {
  const c = SUBJECT_COLORS[l.subject] || DEFAULT_COLOR;
  const isSupplement = l.lesson_types?.includes('보충수업');
  const hasTeacherComment = !!(l.notes || (l.learning_issues && l.learning_issues.length > 0) || l.next_lesson_goal);
  
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-2">
      <div className="flex items-start gap-3">
        <div className={`w-1 self-stretch rounded-full ${isSupplement ? 'bg-orange-400' : c.dot} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${c.bg} ${c.text} ${c.border}`}>{l.subject}</span>
            {isSupplement && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 border border-orange-200">보충</span>}
            {l.course && <span className="text-[10px] text-gray-400 truncate">{l.course}</span>}
          </div>
          <p className="text-[13px] text-gray-800 leading-snug">{l.range}</p>
        </div>
        {l.understanding_score != null && <UnderstandingDots score={l.understanding_score} />}
      </div>

      {/* Teacher comments section */}
      {hasTeacherComment && (
        <div className="ml-4 space-y-1.5">
          {l.notes && (
            <div className="flex items-start gap-1.5 bg-blue-50/70 rounded-lg px-3 py-2 border border-blue-100">
              <MessageSquare className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-blue-800 leading-snug">{l.notes}</p>
            </div>
          )}
          {l.learning_issues && l.learning_issues.length > 0 && (
            <div className="flex items-start gap-1.5 bg-amber-50/70 rounded-lg px-3 py-2 border border-amber-100">
              <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800 leading-snug">{l.learning_issues.join(', ')}</p>
            </div>
          )}
          {l.next_lesson_goal && (
            <div className="flex items-start gap-1.5 bg-emerald-50/70 rounded-lg px-3 py-2 border border-emerald-100">
              <BookOpen className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-emerald-800 leading-snug">다음 목표: {l.next_lesson_goal}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════ Homework Card ═══════ */
function HomeworkCard({ hw }: { hw: Homework }) {
  const hasSubmission = !!hw.submitted_at;
  const hasPhoto = !!hw.submission_image_url;
  const photoCount = hasPhoto ? hw.submission_image_url!.split(',').filter(Boolean).length : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-1 self-stretch rounded-full bg-orange-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-orange-50 text-orange-700 border-orange-200">숙제</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SUBJECT_COLORS[hw.subject]?.bg || 'bg-gray-50'} ${SUBJECT_COLORS[hw.subject]?.text || 'text-gray-500'}`}>{hw.subject}</span>
          </div>
          <p className="text-[13px] text-gray-800 leading-snug">{hw.content}</p>
          {hw.notes && <p className="text-[10px] text-gray-400 mt-0.5">{hw.notes}</p>}
        </div>
        <HwStatus status={hw.check_status} result={hw.result} />
      </div>

      {/* Submission details */}
      {hasSubmission && (
        <div className="ml-4 flex items-center gap-2 text-[10px]">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span className="text-gray-500">
            제출됨 · {new Date(hw.submitted_at!).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {hasPhoto && (
            <span className="flex items-center gap-0.5 text-blue-500">
              <Camera className="w-3 h-3" />
              사진 {photoCount}장
            </span>
          )}
        </div>
      )}
      {!hasSubmission && hw.check_status === 'unchecked' && (
        <div className="ml-4 flex items-center gap-1.5 text-[10px] text-gray-400">
          <Clock className="w-3 h-3" />
          <span>아직 제출하지 않음</span>
        </div>
      )}
    </div>
  );
}

/* ═══════ Small Components ═══════ */
function UnderstandingDots({ score }: { score: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= score ? 'bg-blue-500' : 'bg-gray-200'}`} />
        ))}
      </div>
      <span className="text-[9px] text-gray-400">이해도</span>
    </div>
  );
}

function HwStatus({ status, result }: { status: string; result: string | null }) {
  if (status === 'checked') {
    if (result === 'completed' || result === 'good' || result === 'excellent')
      return <StatusPill icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="완료" color="text-emerald-600 bg-emerald-50" />;
    if (result === 'partial' || result === 'incomplete' || result === 'poor')
      return <StatusPill icon={<AlertTriangle className="w-3.5 h-3.5" />} label="미흡" color="text-amber-600 bg-amber-50" />;
    if (result === 'not_done')
      return <StatusPill icon={<XCircle className="w-3.5 h-3.5" />} label="미완료" color="text-red-600 bg-red-50" />;
    if (result === 'lost')
      return <StatusPill icon={<XCircle className="w-3.5 h-3.5" />} label="분실" color="text-orange-600 bg-orange-50" />;
    if (result === 'low_effort')
      return <StatusPill icon={<XCircle className="w-3.5 h-3.5" />} label="성의부족" color="text-rose-600 bg-rose-50" />;
    if (result === 'unable_to_verify')
      return <StatusPill icon={<Clock className="w-3.5 h-3.5" />} label="확인불가" color="text-gray-500 bg-gray-50" />;
    return <StatusPill icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="확인" color="text-emerald-600 bg-emerald-50" />;
  }
  return <StatusPill icon={<Clock className="w-3.5 h-3.5" />} label="대기" color="text-gray-400 bg-gray-50" />;
}

function StatusPill({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span className={`shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full ${color}`}>
      {icon} {label}
    </span>
  );
}

/* ═══════ Class Schedule Section (Redesigned) ═══════ */
const SCHED_DAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

function ClassScheduleSection({ schedule }: { schedule: ClassScheduleItem[] }) {
  const today = new Date().getDay();

  const byDay: Record<number, ClassScheduleItem[]> = {};
  for (const item of schedule) {
    (byDay[item.day_of_week] ||= []).push(item);
  }

  // Compact horizontal week view
  const activeDays = [1, 2, 3, 4, 5, 6, 0].filter(d => byDay[d]?.length);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 bg-gradient-to-r from-blue-50/60 to-violet-50/40">
        <Calendar className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-bold text-gray-700">수업 시간표</span>
      </div>

      {/* Week strip - horizontal scrollable day pills */}
      <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto">
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const items = byDay[dow];
          const hasClass = items && items.length > 0;
          const isToday = dow === today;
          return (
            <div key={dow} className={`flex-shrink-0 w-9 flex flex-col items-center gap-0.5 py-1 rounded-lg transition-colors
              ${isToday ? 'bg-blue-600' : hasClass ? 'bg-gray-100' : ''}`}>
              <span className={`text-[10px] font-bold ${isToday ? 'text-blue-100' : hasClass ? 'text-gray-600' : 'text-gray-300'}`}>
                {SCHED_DAY_SHORT[dow]}
              </span>
              <div className="flex gap-0.5">
                {hasClass ? items!.map((item, i) => {
                  const c = SUBJECT_COLORS[item.subject] || DEFAULT_COLOR;
                  return <div key={i} className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : c.dot}`} />;
                }) : <div className="w-1.5 h-1.5" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail rows for active days */}
      <div className="px-3 pb-3 space-y-1">
        {activeDays.map(dow => {
          const items = byDay[dow]!;
          const isToday = dow === today;
          return (
            <div key={dow} className={`rounded-xl px-3 py-2 ${isToday ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50/70'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[11px] font-bold ${isToday ? 'text-blue-700' : 'text-gray-500'}`}>
                  {SCHED_DAY_SHORT[dow]}
                </span>
                {isToday && <span className="text-[8px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full leading-none">TODAY</span>}
              </div>
              {items.map((item, idx) => {
                const c = SUBJECT_COLORS[item.subject] || DEFAULT_COLOR;
                return (
                  <div key={idx} className="flex items-center gap-2 py-0.5">
                    <div className={`w-2 h-2 rounded-sm ${c.dot}`} />
                    <span className={`text-[11px] font-medium ${c.text}`}>{item.subject}</span>
                    <span className="text-[10px] text-gray-400 truncate flex-1">{item.class_name}</span>
                    <span className={`text-[10px] font-mono tabular-nums ${isToday ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                      {item.start_time?.slice(0, 5)}–{item.end_time?.slice(0, 5)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════ Supplement (보충) Section ═══════ */
function SupplementSection({ supplements }: { supplements: UpcomingSupplement[] }) {
  return (
    <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl border border-orange-200 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">📌</span>
        <span className="text-xs font-bold text-orange-800">예정된 보충 수업</span>
      </div>
      <div className="space-y-1.5">
        {supplements.map(s => {
          const c = SUBJECT_COLORS[s.subject] || DEFAULT_COLOR;
          return (
            <div key={s.id} className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
              <span className="text-[11px] font-mono font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                {fmt(s.date)}
              </span>
              <span className="text-[10px] font-mono text-orange-500 bg-orange-50 px-1 py-0.5 rounded">
                {s.time || '시간 미정'}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>{s.subject}</span>
              <span className="text-[12px] text-gray-700 truncate flex-1">{s.range}</span>
              {s.teacher_name && <span className="text-[10px] text-orange-600 font-medium">{s.teacher_name} 선생님</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════ Vocab Section ═══════ */
function VocabSection({ schedules, results }: { schedules: VocabScheduleItem[]; results: VocabResultItem[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 px-1">📖 영어 단어 시험</h3>

      {schedules.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-[11px] font-medium text-gray-500">다가오는 시험</p>
            {schedules.slice(0, 5).map(vs => {
              const d = new Date(vs.test_date + 'T00:00:00');
              return (
                <div key={vs.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {d.getMonth() + 1}/{d.getDate()}
                    </span>
                    <span className="text-[13px] text-gray-700">{vs.book_name}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    vs.schedule_type === 'retest' ? 'bg-red-50 text-red-600' :
                    vs.schedule_type === 'guerrilla' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    Day {vs.day_number} {vs.schedule_type === 'retest' ? '재시험' : vs.schedule_type === 'guerrilla' ? '게릴라' : ''}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-[11px] font-medium text-gray-500">최근 결과</p>
            {results.slice(0, 5).map(vr => (
              <div key={vr.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  {vr.passed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className="text-[13px] text-gray-700">{vr.book_name} Day {vr.day_number}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {vr.total_words != null && vr.correct_words != null && (
                    <span className="text-[10px] text-gray-400">{vr.correct_words}/{vr.total_words}</span>
                  )}
                  <span className={`text-[11px] font-bold font-mono ${vr.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                    {vr.score_percent}%
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════ Reports ═══════ */
function ReportsSection({ reports }: { reports: WeeklyReport[] }) {
  function cleanMessage(text: string | null): string {
    if (!text) return '';
    return text.split('\n')
      .filter(l => { const t = l.trim(); return !t.startsWith('[NARRATIVE_RENDER_ACTIVE') && !t.startsWith('[REPORT_GEN_DEBUG') && !t.startsWith('[REPORT-'); })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  return (
    <>
      {reports.map(r => {
        const msg = cleanMessage(r.parent_message);
        return (
          <Card key={r.id} className="overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{r.week_start} ~ {r.week_end}</span>
                {r.risk_level && r.risk_level !== 'low' && (
                  <Badge variant={r.risk_level === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {r.risk_level === 'high' ? '⚠️ 주의' : '📋 관심'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { value: r.total_lessons, label: '수업', color: 'text-blue-600' },
                  { value: r.avg_understanding != null ? `${Math.round(r.avg_understanding * 20)}%` : '-', label: '이해도', color: 'text-blue-600' },
                  { value: r.homework_completion_rate != null ? `${Math.round(r.homework_completion_rate)}%` : '-', label: '숙제완료', color: 'text-blue-600' },
                ].map((s, i) => (
                  <div key={i} className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
              {msg && <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 border-t pt-3">{msg}</div>}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

/* ═══════ Exam Prep Parent Section ═══════ */
function ExamPrepParentSection({ schedules }: { schedules: ExamPrepScheduleItem[] }) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> 내신 특강 일정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800 leading-relaxed">
            📌 내신 대비 특강은 원내에서 추가 운영되는 특강으로, 해당 수업 결석 시 별도의 보강은 제공되지 않습니다. 학생이 가급적 참여할 수 있도록 독려 부탁드립니다.
          </p>
        </div>
        {schedules.map(course => (
          <div key={course.course_id} className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{course.subject}</Badge>
                <span className="text-sm font-medium">{course.title}</span>
              </div>
              <Badge variant={course.status === 'confirmed' ? 'default' : 'secondary'} className="text-[10px]">
                {course.status === 'confirmed' ? '확인완료' : '확정'}
              </Badge>
            </div>
            <div className="space-y-1">
              {course.sessions.map((sess, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] min-w-[45px] justify-center">{sess.session_label}</Badge>
                  <span>{fmt(sess.schedule_date)}</span>
                  <span className="text-muted-foreground font-mono">
                    {sess.start_time.slice(0, 5)}-{sess.end_time.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
