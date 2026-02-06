import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, BookOpen, GraduationCap } from 'lucide-react';

interface StudentInfo {
  name: string;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
  grade: string | null;
}

interface Homework {
  id: string;
  content: string;
  subject: string;
  assigned_date: string;
  check_status: string;
  result: string | null;
  notes: string | null;
}

interface LessonRecord {
  id: string;
  date: string;
  subject: string;
  range: string;
  course: string | null;
  understanding_score: number | null;
}

interface WeeklyReport {
  id: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  homework_completion_rate: number | null;
  risk_level: string | null;
  parent_message: string | null;
  generated_at: string;
}

interface PortalData {
  student: StudentInfo;
  homework: Homework[];
  lessons: LessonRecord[];
  reports: WeeklyReport[];
}

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'bg-blue-50 text-blue-700 border-blue-200',
  '영어': 'bg-violet-50 text-violet-700 border-violet-200',
  '국어': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '과학': 'bg-amber-50 text-amber-700 border-amber-200',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = weekdays[d.getDay()];
  return `${month}/${day} (${wd})`;
}

function SubjectBadge({ subject }: { subject: string }) {
  const color = SUBJECT_COLORS[subject] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${color}`}>
      {subject}
    </span>
  );
}

export default function ParentPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('유효하지 않은 링크입니다.');
      setLoading(false);
      return;
    }
    fetchData(token);
  }, [token]);

  async function fetchData(t: string) {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-portal?token=${encodeURIComponent(t)}`;
      const res = await fetch(url, {
        headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        setError(result.error || '데이터를 불러올 수 없습니다.');
        return;
      }
      setData(result);
    } catch {
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-500 text-sm">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
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
  }

  const { student, homework, lessons, reports } = data;
  const studentLabel = `${student.name}${student.school_level && student.grade_year ? ` (${student.school_level}${student.grade_year})` : ''}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">{studentLabel}</p>
            <p className="text-[11px] text-gray-400">학습 현황</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4">
        <Tabs defaultValue="lessons" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 h-10">
            <TabsTrigger value="lessons" className="text-xs gap-1">
              <BookOpen className="w-3.5 h-3.5" /> 수업
            </TabsTrigger>
            <TabsTrigger value="homework" className="text-xs gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> 숙제
            </TabsTrigger>
            <TabsTrigger value="reports" className="text-xs gap-1">
              📋 리포트
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lessons" className="space-y-2">
            <LessonsSection lessons={lessons} />
          </TabsContent>

          <TabsContent value="homework" className="space-y-2">
            <HomeworkSection homework={homework} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-3">
            <ReportsSection reports={reports} />
          </TabsContent>
        </Tabs>

        <p className="text-center text-[10px] text-gray-300 pt-6 pb-8">
          더멘토학원 · MENTOR LOG
        </p>
      </main>
    </div>
  );
}

/* ───── 수업 섹션 ───── */
function LessonsSection({ lessons }: { lessons: LessonRecord[] }) {
  if (lessons.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        최근 2주간 수업 기록이 없습니다.
      </div>
    );
  }

  // Group by date
  const grouped = lessons.reduce<Record<string, LessonRecord[]>>((acc, l) => {
    (acc[l.date] ||= []).push(l);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5 px-1">{formatDate(date)}</p>
          <div className="space-y-1.5">
            {items.map((l) => (
              <div
                key={l.id}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <SubjectBadge subject={l.subject} />
                    {l.course && (
                      <span className="text-[10px] text-gray-400 truncate">{l.course}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-gray-800 leading-snug">{l.range}</p>
                </div>
                {l.understanding_score != null && (
                  <UnderstandingDots score={l.understanding_score} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnderstandingDots({ score }: { score: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= score ? 'bg-blue-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <span className="text-[9px] text-gray-400">이해도</span>
    </div>
  );
}

/* ───── 숙제 섹션 ───── */
function HomeworkSection({ homework }: { homework: Homework[] }) {
  if (homework.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        최근 2주간 숙제가 없습니다.
      </div>
    );
  }

  // Group by date
  const grouped = homework.reduce<Record<string, Homework[]>>((acc, hw) => {
    (acc[hw.assigned_date] ||= []).push(hw);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5 px-1">{formatDate(date)}</p>
          <div className="space-y-1.5">
            {items.map((hw) => (
              <div
                key={hw.id}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SubjectBadge subject={hw.subject} />
                  </div>
                  <p className="text-[13px] text-gray-800 leading-snug">{hw.content}</p>
                  {hw.notes && <p className="text-[11px] text-gray-400 mt-0.5">{hw.notes}</p>}
                </div>
                <HwStatus status={hw.check_status} result={hw.result} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HwStatus({ status, result }: { status: string; result: string | null }) {
  if (status === 'checked') {
    if (result === 'good' || result === 'excellent') {
      return (
        <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5" /> 완료
        </span>
      );
    }
    if (result === 'incomplete' || result === 'poor') {
      return (
        <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
          <AlertTriangle className="w-3.5 h-3.5" /> 미흡
        </span>
      );
    }
    if (result === 'not_done') {
      return (
        <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
          <XCircle className="w-3.5 h-3.5" /> 미완료
        </span>
      );
    }
    return (
      <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <CheckCircle2 className="w-3.5 h-3.5" /> 확인
      </span>
    );
  }
  return (
    <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
      <Clock className="w-3.5 h-3.5" /> 대기
    </span>
  );
}

/* ───── 리포트 섹션 ───── */
function ReportsSection({ reports }: { reports: WeeklyReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        아직 생성된 주간 리포트가 없습니다.
      </div>
    );
  }

  function cleanMessage(text: string | null): string {
    if (!text) return '';
    return text
      .split('\n')
      .filter(line => {
        const t = line.trim();
        return !t.startsWith('[NARRATIVE_RENDER_ACTIVE') && !t.startsWith('[REPORT_GEN_DEBUG') && !t.startsWith('[REPORT-');
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return (
    <>
      {reports.map((r) => {
        const msg = cleanMessage(r.parent_message);
        return (
          <Card key={r.id}>
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
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-base font-bold text-blue-600">{r.total_lessons}</p>
                  <p className="text-[10px] text-gray-500">수업</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-base font-bold text-blue-600">
                    {r.avg_understanding != null ? `${Math.round(r.avg_understanding * 20)}%` : '-'}
                  </p>
                  <p className="text-[10px] text-gray-500">이해도</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-base font-bold text-blue-600">
                    {r.homework_completion_rate != null ? `${Math.round(r.homework_completion_rate)}%` : '-'}
                  </p>
                  <p className="text-[10px] text-gray-500">숙제완료</p>
                </div>
              </div>
              {msg && (
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 border-t pt-3">
                  {msg}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
