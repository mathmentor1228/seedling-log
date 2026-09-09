// REPORT-FULLTEXT-V1 — 주간 리포트 문안을 한 페이지에 모두 펼쳐 보는 목록
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Printer } from 'lucide-react';

export interface FullTextReport {
  id: string;
  student_name?: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  homework_completion_rate: number | null;
  parent_message: string | null;
  student_message: string | null;
  parent_visible?: boolean;
  report_quality_tag?: 'GREEN' | 'YELLOW' | 'RED' | null;
}

interface Props {
  reports: FullTextReport[];
  clean: (text: string) => string;
  onCopy: (text: string) => void;
}

export function ReportFullTextList({ reports, clean, onCopy }: Props) {
  const copyAll = () => {
    const all = reports
      .map((r) => `■ ${r.student_name || '-'} (${r.week_start}~${r.week_end})\n\n[학부모]\n${clean(r.parent_message || '')}\n\n[학생]\n${clean(r.student_message || '')}`)
      .join('\n\n──────────\n\n');
    onCopy(all);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <span className="text-sm text-muted-foreground">문안 {reports.length}건을 모두 펼쳐서 보여줍니다.</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyAll}>
            <Copy className="w-3.5 h-3.5 mr-1" /> 전체 복사
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {reports.map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-4 space-y-3 break-inside-avoid">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{r.student_name || '-'}</span>
                <span className="text-xs text-muted-foreground">{r.week_start} ~ {r.week_end}</span>
                <Badge variant="outline" className="text-[11px]">수업 {r.total_lessons}회</Badge>
                {r.avg_understanding !== null && (
                  <Badge variant="outline" className="text-[11px]">이해도 {Number(r.avg_understanding).toFixed(1)}</Badge>
                )}
                {r.homework_completion_rate !== null && (
                  <Badge variant="outline" className="text-[11px]">숙제 {Math.round(Number(r.homework_completion_rate))}%</Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[11px] ${r.parent_visible ? 'border-emerald-500/40 text-emerald-600' : 'border-muted-foreground/30 text-muted-foreground'}`}
                >
                  {r.parent_visible ? '학부모 공개' : '비공개'}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">학부모 문안</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 print:hidden" onClick={() => onCopy(r.parent_message || '')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {clean(r.parent_message || '') || <span className="text-muted-foreground">문안 없음</span>}
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">학생 문안</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 print:hidden" onClick={() => onCopy(r.student_message || '')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {clean(r.student_message || '') || <span className="text-muted-foreground">문안 없음</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReportFullTextList;
