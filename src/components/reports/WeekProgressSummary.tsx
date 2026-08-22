// REPORT-STATUS-CLARITY-V1: 주차 단위 진행 요약 (클릭 시 해당 상태로 필터)
import { cn } from '@/lib/utils';
import type { WeekSummary } from '@/lib/reportStatus';

export type StatusFilter = 'all' | 'needs_review' | 'sendable' | 'caution' | 'published';

interface Props {
  summary: WeekSummary;
  active: StatusFilter;
  onSelect: (f: StatusFilter) => void;
  weekStart: string;
  weekEnd: string;
}

export function WeekProgressSummary({ summary, active, onSelect, weekStart, weekEnd }: Props) {
  const cells: { key: StatusFilter; label: string; value: number; hint: string; tone: string }[] = [
    { key: 'all', label: '대상 학생', value: summary.target, hint: '활성 학생 수(자동 집계)', tone: 'text-foreground' },
    { key: 'all', label: '생성됨', value: summary.generated, hint: `미생성 ${summary.missing}명`, tone: 'text-foreground' },
    { key: 'needs_review', label: '검수 필요', value: summary.needsReview, hint: 'RED 또는 메시지 빈값', tone: 'text-destructive' },
    { key: 'sendable', label: '공개 가능', value: summary.sendable, hint: '검수 통과·비공개 초안', tone: 'text-primary' },
    { key: 'caution', label: '주의(수업 0건)', value: summary.caution, hint: '집계 근거 없음', tone: 'text-amber-600' },
    { key: 'published', label: '공개됨', value: summary.published, hint: '학부모 포털 노출', tone: 'text-green-600' },
  ];

  return (
    <div className="rounded-lg border p-3 space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold">주차 진행 요약</p>
        <span className="text-[11px] text-muted-foreground font-mono">{weekStart} ~ {weekEnd}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {cells.map((c, i) => (
          <button
            key={`${c.key}-${i}`}
            type="button"
            onClick={() => onSelect(c.key)}
            aria-label={`${c.label} ${c.value}건 필터`}
            className={cn(
              'text-left rounded-md border p-2 min-w-0 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === c.key && c.key !== 'all' && 'border-primary bg-primary/5'
            )}
          >
            <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
            <p className={cn('text-lg font-bold', c.tone)}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground truncate">{c.hint}</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        발송 근거가 확인된 건수: {summary.deliveryConfirmed}건 · 작성 완료는 발송 완료가 아닙니다.
        {summary.lastGeneratedAt && ` · 최근 생성 ${new Date(summary.lastGeneratedAt).toLocaleString('ko-KR')}`}
      </p>
    </div>
  );
}
