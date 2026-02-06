import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, BookOpen, AlertTriangle, CheckCircle2, XCircle, Clock, FileText, FlaskConical } from 'lucide-react';

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

interface TestRecord {
  id: string;
  date: string;
  subject: string;
  name: string;
  content: string;
  result: string;
  result_text: string | null;
  understanding_score: number | null;
  source: string;
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
  tests: TestRecord[];
  reports: WeeklyReport[];
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
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

  const { student, homework, tests, reports } = data;
  const studentLabel = `${student.name}${student.school_level && student.grade_year ? ` (${student.school_level}${student.grade_year})` : ''}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <div>
            <span className="font-semibold text-sm">{studentLabel}</span>
            <span className="text-gray-400 text-xs ml-2">학습 현황</span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4">
        <Tabs defaultValue="homework" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="homework" className="text-xs">📝 숙제</TabsTrigger>
            <TabsTrigger value="tests" className="text-xs">📊 테스트</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs">📋 주간리포트</TabsTrigger>
          </TabsList>

          <TabsContent value="homework" className="space-y-3">
            <HomeworkSection homework={homework} />
          </TabsContent>

          <TabsContent value="tests" className="space-y-3">
            <TestsSection tests={tests} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-3">
            <ReportsSection reports={reports} />
          </TabsContent>
        </Tabs>

        <p className="text-center text-[10px] text-gray-400 pt-6 pb-8">
          더멘토학원 · MENTOR LOG
        </p>
      </main>
    </div>
  );
}

function HomeworkSection({ homework }: { homework: Homework[] }) {
  if (homework.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-sm">
          최근 30일간 숙제가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {homework.map((hw) => (
        <Card key={hw.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] shrink-0">{hw.subject}</Badge>
                  <span className="text-[10px] text-gray-400">{hw.assigned_date}</span>
                </div>
                <p className="text-sm font-medium truncate">{hw.content}</p>
                {hw.notes && <p className="text-xs text-gray-500 mt-1">{hw.notes}</p>}
              </div>
              <HomeworkStatusBadge status={hw.check_status} result={hw.result} />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function HomeworkStatusBadge({ status, result }: { status: string; result: string | null }) {
  if (status === 'checked') {
    if (result === 'good' || result === 'excellent') {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-xs">완료</span>
        </div>
      );
    }
    if (result === 'incomplete' || result === 'poor') {
      return (
        <div className="flex items-center gap-1 text-amber-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-xs">미흡</span>
        </div>
      );
    }
    if (result === 'not_done') {
      return (
        <div className="flex items-center gap-1 text-red-500">
          <XCircle className="w-4 h-4" />
          <span className="text-xs">미완료</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-green-600">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-xs">확인</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-gray-400">
      <Clock className="w-4 h-4" />
      <span className="text-xs">대기</span>
    </div>
  );
}

function TestsSection({ tests }: { tests: TestRecord[] }) {
  if (tests.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-sm">
          최근 60일간 테스트 기록이 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {tests.map((test) => (
        <Card key={test.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px]">{test.subject}</Badge>
              <span className="text-[10px] text-gray-400">{test.date}</span>
            </div>
            <p className="text-sm font-medium">{test.content || test.name || '테스트'}</p>
            <div className="flex items-center gap-3 mt-2">
              <TestResultBadge result={test.result} />
              {test.result_text && (
                <span className="text-xs text-gray-600">{test.result_text}</span>
              )}
              {test.understanding_score != null && (
                <span className="text-xs text-blue-600">이해도 {test.understanding_score}/5</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function TestResultBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pass: { label: '합격', color: 'bg-green-100 text-green-700' },
    fail: { label: '불합격', color: 'bg-red-100 text-red-700' },
    retest: { label: '재시험', color: 'bg-amber-100 text-amber-700' },
    excellent: { label: '우수', color: 'bg-blue-100 text-blue-700' },
  };
  const m = map[result] || { label: result, color: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.color}`}>{m.label}</span>;
}

function ReportsSection({ reports }: { reports: WeeklyReport[] }) {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-sm">
          아직 생성된 주간 리포트가 없습니다.
        </CardContent>
      </Card>
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
                <div className="text-center p-2 bg-gray-50 rounded">
                  <p className="text-base font-bold text-blue-600">{r.total_lessons}</p>
                  <p className="text-[10px] text-gray-500">수업</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <p className="text-base font-bold text-blue-600">
                    {r.avg_understanding != null ? `${Math.round(r.avg_understanding * 20)}%` : '-'}
                  </p>
                  <p className="text-[10px] text-gray-500">이해도</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
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
