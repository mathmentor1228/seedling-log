// EXAM-ANALYSIS-PUBLIC-V1: shared card used in student & parent webs
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PublishedReportLite {
  id: string;
  school_name: string;
  grade: string;
  subject: string;
  exam_type: string;
  exam_year: number;
  exam_period: string;
  exam_scope: string | null;
  textbook: string | null;
  avg_score: number | null;
  exam_difficulty: string | null;
  overall_review: string | null;
  card_image_paths: string[] | null;
  student_message: string | null;
  parent_message: string | null;
  published_at: string | null;
  updated_at: string;
}

interface Props {
  report: PublishedReportLite;
  audience: 'student' | 'parent';
  studentId?: string | null;
  /** Whether to log a view when the card mounts (default true) */
  logView?: boolean;
}

export function PublishedReportCard({ report, audience, studentId, logView = true }: Props) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const paths = useMemo(
    () => (Array.isArray(report.card_image_paths) ? report.card_image_paths.filter(Boolean) : []),
    [report.card_image_paths],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls = await Promise.all(
        paths.map(async (path) => (await getCachedSignedUrl('exam-analysis', path, 3600)) ?? ''),
      );
      if (!cancelled) setImageUrls(urls.filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, [paths]);

  useEffect(() => {
    if (!logView) return;
    // Best-effort view log; ignore errors silently
    void (async () => {
      try {
        await (supabase as any).from('exam_analysis_report_views').insert({
          report_id: report.id,
          viewer_type: audience,
          student_id: studentId ?? null,
        });
      } catch (e) { /* noop */ }
    })();
  }, [report.id, audience, studentId, logView]);

  const message = audience === 'student' ? report.student_message : report.parent_message;
  const total = imageUrls.length;
  const goPrev = () => setActiveIdx((idx) => (idx === 0 ? total - 1 : idx - 1));
  const goNext = () => setActiveIdx((idx) => (idx + 1 >= total ? 0 : idx + 1));

  const headerColor = audience === 'student' ? 'from-pink-500/10 to-orange-500/10' : 'from-primary/10 to-blue-500/10';

  return (
    <Card className={cn('overflow-hidden border-primary/20 shadow-card')}>
      <div className={cn('bg-gradient-to-r px-4 py-3 border-b', headerColor)}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {report.exam_year}년 {report.exam_period} · {report.exam_type}
            </p>
            <p className="truncate text-sm font-bold text-foreground">
              {report.school_name} {report.grade}학년 {report.subject}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
            <Sparkles className="h-3 w-3" /> 분석
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-3 p-3">
        {total > 0 ? (
          <div className="relative overflow-hidden rounded-xl bg-muted">
            <div className="aspect-square w-full">
              <img
                src={imageUrls[activeIdx]}
                alt={`카드뉴스 ${activeIdx + 1}/${total}`}
                className="h-full w-full object-contain"
                loading="lazy"
              />
            </div>
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="이전"
                  className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1 shadow hover:bg-background"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="다음"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1 shadow hover:bg-background"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {imageUrls.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        i === activeIdx ? 'w-4 bg-primary' : 'w-1.5 bg-background/70',
                      )}
                    />
                  ))}
                </div>
                <span className="absolute right-2 top-2 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium">
                  {activeIdx + 1}/{total}
                </span>
              </>
            )}
          </div>
        ) : null}

        {message ? (
          <div
            className={cn(
              'rounded-xl border p-3 text-sm leading-6 whitespace-pre-wrap',
              audience === 'student'
                ? 'border-pink-200 bg-pink-50 text-pink-900 dark:border-pink-900/40 dark:bg-pink-950/30 dark:text-pink-100'
                : 'border-primary/20 bg-primary/5 text-foreground',
            )}
          >
            {audience === 'student' && <p className="mb-1 text-[11px] font-bold text-pink-600">📣 선생님 메시지</p>}
            {audience === 'parent' && <p className="mb-1 text-[11px] font-bold text-primary">📊 분석 요지</p>}
            {message}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-xs">
          {report.exam_scope ? (
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[10px] text-muted-foreground">시험 범위</p>
              <p className="mt-0.5 line-clamp-2 font-medium text-foreground">{report.exam_scope}</p>
            </div>
          ) : null}
          {report.textbook ? (
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[10px] text-muted-foreground">교과서</p>
              <p className="mt-0.5 line-clamp-2 font-medium text-foreground">{report.textbook}</p>
            </div>
          ) : null}
          {audience === 'parent' && report.avg_score != null ? (
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[10px] text-muted-foreground">평균 점수</p>
              <p className="mt-0.5 font-bold text-foreground">{report.avg_score}점</p>
            </div>
          ) : null}
          {audience === 'parent' && report.exam_difficulty ? (
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[10px] text-muted-foreground">난도</p>
              <p className="mt-0.5 font-medium text-foreground">{report.exam_difficulty}</p>
            </div>
          ) : null}
        </div>

        {report.published_at ? (
          <p className="text-right text-[10px] text-muted-foreground">
            {new Date(report.published_at).toLocaleDateString('ko-KR')} 게시
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
