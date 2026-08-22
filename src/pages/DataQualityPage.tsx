// DATA-QUALITY-V1 — 원장/관리자 전용 데이터 점검 (읽기 전용, 자동 수정 없음)
// 확인 기준선(data_quality_acks) 외에는 어떤 운영 데이터도 write 하지 않는다.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useDataQuality } from '@/components/admin/useDataQuality';
import { useDataQualityAcks } from '@/components/admin/useDataQualityAcks';
import { diffFindings, kstLabel, lastCheckedAt, totalNewCount, type DQFindingStatus } from '@/components/admin/dqAck';
import { SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from '@/components/admin/dataQuality';

const SEV_STYLE: Record<Severity, string> = {
  critical: 'border-destructive/40 bg-destructive/5',
  check: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-border bg-muted/20',
};
const SEV_BADGE: Record<Severity, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  check: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  info: 'bg-muted text-muted-foreground border-border',
};

function FindingCard({ s, acked }: { s: DQFindingStatus; acked?: boolean }) {
  const navigate = useNavigate();
  const f = s.finding;
  return (
    <Card className={cn('border', acked ? 'border-border bg-muted/10' : SEV_STYLE[f.severity])}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold break-words">{f.title}</p>
            <p className="text-[11px] text-muted-foreground break-words mt-0.5">{f.basis}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className={cn('text-[10px]', SEV_BADGE[f.severity])}>
              {SEVERITY_LABEL[f.severity]}
            </Badge>
            {!acked && s.newCount > 0 && (
              <Badge variant="outline" className="text-[10px] bg-primary/15 text-primary border-primary/30">
                새 항목 {s.newCount.toLocaleString()}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-bold">
            {(acked ? f.recordCount : s.newCount).toLocaleString()}
            <span className="text-xs font-normal ml-0.5">{f.recordUnit}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            전체 {f.recordCount.toLocaleString()}{f.recordUnit} · 원인 그룹 {f.groupCount.toLocaleString()}{f.groupUnit}
          </span>
          {s.ackedAt && (
            <span className="text-[11px] text-muted-foreground">확인 {kstLabel(s.ackedAt)}</span>
          )}
        </div>
        {f.samples.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {f.samples.map((v, i) => (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-background/70 border border-border break-all">{v}</span>
            ))}
          </div>
        )}
        {f.note && <p className="text-[11px] text-muted-foreground break-words">{f.note}</p>}
        {f.link && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(f.link!.href)}>
            {f.link.label} <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DataQualityContent() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { loading, findings, failedSources, lessonFrom, reload } = useDataQuality();
  const { acks, loading: ackLoading, error: ackError, saving, ackAll } = useDataQualityAcks();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sevParam = params.get('severity') as Severity | null;
  const severity: Severity | 'all' = sevParam && sevParam in SEVERITY_LABEL ? sevParam : 'all';
  const typeParam = params.get('type') || 'all';
  const view = params.get('view') === 'acked' ? 'acked' : 'new';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const statuses = useMemo(() => diffFindings(findings, acks), [findings, acks]);
  const newItems = useMemo(() => statuses.filter((s) => s.newCount > 0), [statuses]);
  const ackedItems = useMemo(
    () => statuses.filter((s) => s.newCount === 0 && s.finding.recordCount > 0),
    [statuses],
  );
  const clean = useMemo(() => statuses.filter((s) => s.finding.recordCount === 0), [statuses]);
  const newTotal = totalNewCount(statuses);
  const lastChecked = lastCheckedAt(acks);
  const busy = loading || ackLoading || saving || failedSources.length > 0 || !!ackError;

  const visible = useMemo(() => {
    let list = view === 'acked' ? ackedItems : newItems;
    if (severity !== 'all') list = list.filter((s) => s.finding.severity === severity);
    if (typeParam !== 'all') list = list.filter((s) => s.finding.id === typeParam);
    return [...list].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity) ||
        b.newCount - a.newCount || b.finding.recordCount - a.finding.recordCount,
    );
  }, [view, newItems, ackedItems, severity, typeParam]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, check: 0, info: 0 };
    for (const s of newItems) c[s.finding.severity] += 1;
    return c;
  }, [newItems]);

  const doAck = async () => {
    const ok = await ackAll(findings);
    setConfirmOpen(false);
    toast(ok
      ? { title: '확인 완료로 저장했습니다', description: `기준 시각 ${kstLabel(new Date().toISOString())}` }
      : { title: '저장에 실패했습니다', description: '다시 시도해 주세요. 저장되지 않았습니다.', variant: 'destructive' });
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4 overflow-x-hidden">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/principal')}>
        <ArrowLeft className="w-4 h-4 mr-1" /> 원장 대시보드
      </Button>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-bold">데이터 점검</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                읽기 전용 · 수업/숙제는 {lessonFrom} 이후, 학생·반·사용자는 전체 기준. 자동 수정은 하지 않습니다.
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 break-words">
                마지막 전체 확인: {kstLabel(lastChecked)}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={reload} aria-label="새로고침">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <div className="rounded-md border border-border p-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold break-words">
              {loading || ackLoading
                ? '확인 상태 불러오는 중…'
                : newTotal === 0
                  ? '새로 확인할 데이터 이상이 없습니다'
                  : `새로 확인할 항목 ${newTotal.toLocaleString()}개 (${newItems.length}개 유형)`}
            </p>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={busy || newTotal === 0}
              onClick={() => setConfirmOpen(true)}
            >
              현재 항목 모두 확인
            </Button>
          </div>

          {(failedSources.length > 0 || ackError) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] break-words">
                {failedSources.length > 0 && `일부 데이터를 불러오지 못했습니다: ${failedSources.join(', ')}. 표시된 숫자는 실제보다 적을 수 있습니다(0건 아님). `}
                {ackError && '확인 상태를 불러오지 못했습니다. '}
                확인 저장 버튼은 안전을 위해 비활성화됩니다.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {SEVERITY_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => setParam('severity', severity === s ? 'all' : s)}
                className={cn(
                  'rounded-md border p-2 text-left min-w-0 transition-colors',
                  SEV_STYLE[s], severity === s && 'ring-2 ring-primary/40',
                )}
              >
                <p className="text-[11px] text-muted-foreground truncate">{SEVERITY_LABEL[s]}</p>
                <p className="text-lg font-bold">{counts[s]}<span className="text-xs font-normal ml-0.5">신규 유형</span></p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={view} onValueChange={(v) => setParam('view', v === 'new' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">현재 신규 항목</SelectItem>
                <SelectItem value="acked">확인된 과거 항목</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={(v) => setParam('severity', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">심각도 전체</SelectItem>
                {SEVERITY_ORDER.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeParam} onValueChange={(v) => setParam('type', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="유형 전체" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">유형 전체</SelectItem>
                {statuses.filter((s) => s.finding.recordCount > 0).map((s) => (
                  <SelectItem key={s.finding.id} value={s.finding.id}>{s.finding.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading || ackLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm break-words">
              {view === 'acked'
                ? '확인된 과거 항목이 없습니다.'
                : newTotal === 0
                  ? '새로 확인할 데이터 이상이 없습니다.'
                  : '선택한 조건에 해당하는 신규 항목이 없습니다.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => <FindingCard key={s.finding.id} s={s} acked={view === 'acked'} />)}
        </div>
      )}

      {!loading && view === 'new' && ackedItems.length > 0 && (
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> 확인된 과거 항목 {ackedItems.length}개 유형 보기
          </summary>
          <ul className="mt-2 space-y-1">
            {ackedItems.map((s) => (
              <li key={s.finding.id} className="text-[11px] text-muted-foreground break-words">
                · {s.finding.title} — {s.finding.recordCount.toLocaleString()}{s.finding.recordUnit} 확인 완료 ({kstLabel(s.ackedAt)})
              </li>
            ))}
          </ul>
        </details>
      )}

      {!loading && clean.length > 0 && (
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> 정상 항목 {clean.length}개 보기
          </summary>
          <ul className="mt-2 space-y-1">
            {clean.map((s) => (
              <li key={s.finding.id} className="text-[11px] text-muted-foreground break-words">· {s.finding.title} — 0건</li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!saving) setConfirmOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>현재 항목 모두 확인</DialogTitle>
            <DialogDescription className="text-xs">
              신규 {newTotal.toLocaleString()}건({newItems.length}개 유형)을 확인 완료로 저장합니다.
              기준 시각 {kstLabel(new Date().toISOString())}. 데이터는 수정·삭제되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={saving}>취소</Button>
            <Button size="sm" onClick={doAck} disabled={saving}>{saving ? '저장 중…' : '확인 완료로 저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DataQualityPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <DataQualityContent />
    </ProtectedRoute>
  );
}
