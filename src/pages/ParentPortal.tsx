import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, GraduationCap, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';

/* ═══════ Types ═══════ */
interface StudentInfo { name: string; school: string | null; school_level: string | null; grade_year: number | null; grade: string | null; }
interface Homework { id: string; content: string; subject: string; assigned_date: string; check_status: string; result: string | null; notes: string | null; }
interface LessonRecord { id: string; date: string; subject: string; range: string; course: string | null; understanding_score: number | null; attendance_status: string[] | null; }
interface Attendance { date: string; status: string; note: string | null; }
interface WeeklyReport { id: string; week_start: string; week_end: string; total_lessons: number; avg_understanding: number | null; homework_completion_rate: number | null; risk_level: string | null; parent_message: string | null; generated_at: string; }
interface PortalData { student: StudentInfo; homework: Homework[]; lessons: LessonRecord[]; attendance: Attendance[]; reports: WeeklyReport[]; }

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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-white p-4">
      <Card className="max-w-sm w-full">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="font-semibold text-lg mb-2">접속할 수 없습니다</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  const { student, homework, lessons, attendance, reports } = data;
  const label = `${student.name}${student.school_level && student.grade_year ? ` (${student.school_level}${student.grade_year})` : ''}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">{label}</p>
            <p className="text-[11px] text-gray-400">학습 현황</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Summary Stats */}
        <SummaryCards lessons={lessons} homework={homework} />

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

        {/* Reports */}
        {reports.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 px-1">📋 주간 리포트</h3>
            <ReportsSection reports={reports} />
          </div>
        )}

        <p className="text-center text-[10px] text-gray-300 pt-4 pb-8">더멘토학원 · MENTOR LOG</p>
      </main>
    </div>
  );
}

/* ═══════ Summary Cards ═══════ */
function SummaryCards({ lessons, homework }: { lessons: LessonRecord[]; homework: Homework[] }) {
  const totalLessons = lessons.length;
  const subjects = [...new Set(lessons.map(l => l.subject))];
  const checkedHw = homework.filter(h => h.check_status === 'checked');
  const goodHw = checkedHw.filter(h => h.result === 'good' || h.result === 'excellent');
  const hwRate = checkedHw.length > 0 ? Math.round((goodHw.length / checkedHw.length) * 100) : null;
  const avgScore = lessons.filter(l => l.understanding_score != null).length > 0
    ? (lessons.reduce((s, l) => s + (l.understanding_score || 0), 0) / lessons.filter(l => l.understanding_score != null).length).toFixed(1)
    : null;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-lg font-bold text-blue-600">{totalLessons}</p>
        <p className="text-[10px] text-gray-500">수업 (2주)</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-lg font-bold text-emerald-600">{hwRate != null ? `${hwRate}%` : '-'}</p>
        <p className="text-[10px] text-gray-500">숙제 완료</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-lg font-bold text-violet-600">{avgScore ?? '-'}</p>
        <p className="text-[10px] text-gray-500">평균 이해도</p>
      </div>
    </div>
  );
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <span className="text-xs font-semibold text-gray-600">{weekLabel}</span>
        <button
          onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}
          disabled={weekOffset >= 0}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4 text-gray-500" />
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
                ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}
                ${isWeekend ? 'opacity-60' : ''}`}
            >
              <span className={`text-[10px] mb-1 ${isWeekend ? 'text-gray-400' : 'text-gray-500'}`}>
                {WEEKDAYS[day.getDay()]}
              </span>
              <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'bg-blue-600 text-white' : isSelected ? 'bg-blue-100 text-blue-700' : 'text-gray-700'}`}>
                {day.getDate()}
              </span>

              {/* Dots */}
              <div className="flex gap-0.5 mt-1.5 h-2 items-center">
                {dayLessons.length > 0 && (
                  [...new Set(dayLessons)].slice(0, 3).map((subj, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${(SUBJECT_COLORS[subj] || DEFAULT_COLOR).dot}`} />
                  ))
                )}
                {hasHw && <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
              </div>

              {/* Attendance indicator */}
              {att && att !== 'present' && (
                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full
                  ${att === '인정결석' ? 'bg-yellow-400' : att === '무단결석' ? 'bg-red-400' : 'bg-gray-400'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-50 flex-wrap">
        {Object.entries(SUBJECT_COLORS).map(([subj, c]) => (
          <div key={subj} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${c.dot}`} />
            <span className="text-[9px] text-gray-500">{subj}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-[9px] text-gray-500">숙제</span>
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

/* ═══════ Lesson Card ═══════ */
function LessonCard({ lesson: l }: { lesson: LessonRecord }) {
  const c = SUBJECT_COLORS[l.subject] || DEFAULT_COLOR;
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-start gap-3">
      <div className={`w-1 self-stretch rounded-full ${c.dot} shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${c.bg} ${c.text} ${c.border}`}>{l.subject}</span>
          {l.course && <span className="text-[10px] text-gray-400 truncate">{l.course}</span>}
        </div>
        <p className="text-[13px] text-gray-800 leading-snug">{l.range}</p>
      </div>
      {l.understanding_score != null && <UnderstandingDots score={l.understanding_score} />}
    </div>
  );
}

/* ═══════ Homework Card ═══════ */
function HomeworkCard({ hw }: { hw: Homework }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
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
    if (result === 'good' || result === 'excellent')
      return <StatusPill icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="완료" color="text-emerald-600 bg-emerald-50" />;
    if (result === 'incomplete' || result === 'poor')
      return <StatusPill icon={<AlertTriangle className="w-3.5 h-3.5" />} label="미흡" color="text-amber-600 bg-amber-50" />;
    if (result === 'not_done')
      return <StatusPill icon={<XCircle className="w-3.5 h-3.5" />} label="미완료" color="text-red-600 bg-red-50" />;
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
