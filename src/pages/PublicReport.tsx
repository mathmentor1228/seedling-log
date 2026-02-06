import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, AlertTriangle } from 'lucide-react';

interface PublicReportData {
  id: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  homework_completion_rate: number | null;
  common_issues: string[] | null;
  summary: string | null;
  risk_level: string | null;
  parent_message: string | null;
  student_message: string | null;
  generated_at: string;
  students: {
    name: string;
    school: string | null;
    grade: string | null;
    school_level: string | null;
    grade_year: number | null;
  } | null;
}

export default function PublicReport() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [report, setReport] = useState<PublicReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('유효하지 않은 링크입니다.');
      setLoading(false);
      return;
    }
    fetchReport(token);
  }, [token]);

  async function fetchReport(shareToken: string) {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-report?token=${encodeURIComponent(shareToken)}`;
      const res = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const result = await res.json();

      if (!res.ok || result.error) {
        setError(result.error || '리포트를 불러올 수 없습니다.');
        return;
      }

      setReport(result.report);
    } catch (err: any) {
      setError('리포트를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-muted-foreground text-sm">리포트를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-white p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
            <h2 className="font-semibold text-lg mb-2">리포트를 찾을 수 없습니다</h2>
            <p className="text-muted-foreground text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const student = report.students;
  const studentLabel = student
    ? `${student.name}${student.school_level && student.grade_year ? ` (${student.school_level}${student.grade_year})` : ''}`
    : '학생';

  // Strip debug markers from message
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

  const parentMsg = cleanMessage(report.parent_message);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">M</span>
          </div>
          <span className="font-semibold text-sm">더멘토학원 주간 리포트</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Student info card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              {studentLabel} 주간 학습 리포트
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {report.week_start} ~ {report.week_end}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold text-primary">{report.total_lessons}</p>
                <p className="text-[10px] text-muted-foreground">수업 횟수</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold text-primary">
                  {report.avg_understanding != null ? `${Math.round(report.avg_understanding * 20)}%` : '-'}
                </p>
                <p className="text-[10px] text-muted-foreground">이해도</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold text-primary">
                  {report.homework_completion_rate != null ? `${Math.round(report.homework_completion_rate)}%` : '-'}
                </p>
                <p className="text-[10px] text-muted-foreground">숙제 완료율</p>
              </div>
            </div>

            {/* Risk level badge */}
            {report.risk_level && report.risk_level !== 'low' && (
              <div className="flex items-center gap-2">
                <Badge variant={report.risk_level === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                  {report.risk_level === 'high' ? '⚠️ 주의 필요' : '📋 관심 필요'}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Parent message */}
        {parentMsg && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">📝 학습 리포트</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {parentMsg}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Common issues */}
        {report.common_issues && report.common_issues.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">📌 주요 이슈</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {report.common_issues.map((issue, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground pt-4 pb-8">
          더멘토학원 · MENTOR LOG
        </p>
      </main>
    </div>
  );
}
