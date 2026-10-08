// EXAM-HUB-A ③ 시험지 분석 — 학교×과목 카드. 보기 중심. 작성·편집은 자료실 분석보고서 탭으로(스킬 `내신대비리뷰` 경로 유지).
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, ExternalLink, FileText, Images, ListOrdered, NotebookPen, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Cycle, DeepReportRow, ReportRow } from './examHubUtils';

interface Props {
  cycle: Cycle;
  reports: ReportRow[];
  subjects: string[];
  deepByReport: Map<string, DeepReportRow>;
  itemCountByReport: Map<string, number>;
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}{label}
    </span>
  );
}

export function PaperAnalysisTab({ cycle, reports, subjects, deepByReport, itemCountByReport }: Props) {
  const archiveHref = `/exam-archive?tab=analysis&school=${encodeURIComponent(cycle.school_name)}`;
  const bySubject = new Map(reports.map(r => [r.subject, r]));
  const all = Array.from(new Set([...subjects, ...reports.map(r => r.subject)])).sort((a, b) => a.localeCompare(b, 'ko'));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">과목별 시험지 분석 상태 · {reports.length}/{all.length} 작성</span>
        <span className="flex-1" />
        <Button asChild size="sm" variant="outline">
          <Link to={archiveHref}><PenLine className="w-3.5 h-3.5 mr-1" />분석보고서 작성·편집</Link>
        </Button>
      </div>
      {all.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">과목 정보가 없어 카드를 만들 수 없습니다. 시험 정보 탭에서 과목을 채우세요.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {all.map(subject => {
            const r = bySubject.get(subject);
            const deep = r ? deepByReport.get(r.id) : undefined;
            const items = r ? itemCountByReport.get(r.id) || 0 : 0;
            const cards = r && Array.isArray(r.card_image_paths) ? (r.card_image_paths as unknown[]).length : 0;
            return (
              <Card key={subject} className={cn(!r && 'border-dashed')}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{subject}</span>
                    {r ? (
                      <Badge variant={r.is_published ? 'default' : 'secondary'} className="text-[11px]">{r.is_published ? '학부모 공개' : '내부'}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">미작성</Badge>
                    )}
                    {r?.exam_difficulty && <span className="text-xs text-muted-foreground">난이도 {r.exam_difficulty}</span>}
                    {r?.avg_score != null && <span className="text-xs text-muted-foreground">평균 {r.avg_score}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <Mark ok={!!r?.original_pdf_path} label="원본 PDF" />
                    <Mark ok={items > 0} label={items > 0 ? `문항 난도 ${items}문항` : '문항 난도'} />
                    <Mark ok={cards > 0} label={cards > 0 ? `카드뉴스 ${cards}장` : '카드뉴스'} />
                    <Mark ok={!!deep?.teacher_notes || !!deep} label="티칭 메모" />
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    {r?.original_pdf_path && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to={`${archiveHref}&report=${r.id}`}><FileText className="w-3.5 h-3.5 mr-1" />보기</Link>
                      </Button>
                    )}
                    {r && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to={`${archiveHref}&report=${r.id}`}><ExternalLink className="w-3.5 h-3.5 mr-1" />자료실에서 열기</Link>
                      </Button>
                    )}
                    {!r && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to={archiveHref}><PenLine className="w-3.5 h-3.5 mr-1" />작성하기</Link>
                      </Button>
                    )}
                  </div>
                  {r && (
                    <div className="text-[11px] text-muted-foreground">
                      {r.created_by_name ? `${r.created_by_name} · ` : ''}{r.updated_at ? `수정 ${r.updated_at.slice(0, 10)}` : ''}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <div className="rounded-md border p-3 text-xs text-muted-foreground flex items-start gap-2">
        <NotebookPen className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <div className="flex items-center gap-2"><ListOrdered className="w-3.5 h-3.5" />동향(같은 학교·과목의 사이클 간 비교)과 <Images className="w-3.5 h-3.5" />카드뉴스 미리보기는 D단계에서 이 탭에 들어옵니다.</div>
        </div>
      </div>
    </div>
  );
}
