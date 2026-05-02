// EXAM-ANALYSIS-PUBLIC-V1: principal dashboard view-stats widget
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, GraduationCap, Users, Sparkles } from 'lucide-react';

interface ReportRow {
  id: string;
  school_name: string;
  grade: string;
  subject: string;
  exam_year: number;
  exam_period: string;
  exam_type: string;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
}

interface ViewRow {
  report_id: string;
  viewer_type: 'student' | 'parent';
  student_id: string | null;
  viewed_at: string;
}

interface AggregatedRow extends ReportRow {
  student_views: number;
  parent_views: number;
  unique_students: number;
  unique_parents: number;
  last_viewed_at: string | null;
}

export function AnalysisReportViewsSection() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: rep }, { data: vws }] = await Promise.all([
        (supabase as any)
          .from('exam_analysis_reports')
          .select('id, school_name, grade, subject, exam_year, exam_period, exam_type, is_published, published_at, updated_at')
          .eq('is_published', true)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(50),
        (supabase as any)
          .from('exam_analysis_report_views')
          .select('report_id, viewer_type, student_id, viewed_at')
          .order('viewed_at', { ascending: false })
          .limit(5000),
      ]);
      if (cancelled) return;
      setReports((rep || []) as ReportRow[]);
      setViews((vws || []) as ViewRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const aggregated: AggregatedRow[] = useMemo(() => {
    const byReport = new Map<string, ViewRow[]>();
    for (const v of views) {
      const list = byReport.get(v.report_id) || [];
      list.push(v);
      byReport.set(v.report_id, list);
    }
    return reports.map((r) => {
      const list = byReport.get(r.id) || [];
      const studentList = list.filter((v) => v.viewer_type === 'student');
      const parentList = list.filter((v) => v.viewer_type === 'parent');
      const uniqStudents = new Set(studentList.map((v) => v.student_id).filter(Boolean));
      // For parent we don't have a unique id, treat each insert as unique session
      const last = list[0]?.viewed_at ?? null;
      return {
        ...r,
        student_views: studentList.length,
        parent_views: parentList.length,
        unique_students: uniqStudents.size,
        unique_parents: parentList.length,
        last_viewed_at: last,
      };
    });
  }, [reports, views]);

  const totals = useMemo(() => ({
    reports: reports.length,
    studentViews: views.filter((v) => v.viewer_type === 'student').length,
    parentViews: views.filter((v) => v.viewer_type === 'parent').length,
  }), [reports, views]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">게시된 보고서</p>
              <p className="text-2xl font-bold text-foreground">{totals.reports}건</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/15 text-pink-500 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">학생 조회수 (누적)</p>
              <p className="text-2xl font-bold text-foreground">{totals.studentViews}회</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">학부모 조회수 (누적)</p>
              <p className="text-2xl font-bold text-foreground">{totals.parentViews}회</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="w-4 h-4" /> 분석보고서별 조회 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : aggregated.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">아직 게시된 보고서가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {aggregated.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {r.school_name} {r.grade} {r.subject}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.exam_year}년 {r.exam_period} · {r.exam_type}
                      {r.published_at ? ` · ${new Date(r.published_at).toLocaleDateString('ko-KR')} 게시` : ''}
                      {r.last_viewed_at ? ` · 마지막 조회 ${new Date(r.last_viewed_at).toLocaleDateString('ko-KR')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="gap-1">
                      <GraduationCap className="w-3 h-3" /> 학생 {r.student_views}
                      <span className="text-[10px] text-muted-foreground">({r.unique_students}명)</span>
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Users className="w-3 h-3" /> 학부모 {r.parent_views}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
