// DATA-QUALITY-V1 — 원장/관리자 전용 데이터 점검 (읽기 전용, 자동 수정 없음)
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataQuality } from '@/components/admin/useDataQuality';
import { SEVERITY_LABEL, SEVERITY_ORDER, type Severity, type DQFinding } from '@/components/admin/dataQuality';

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

function FindingCard({ f }: { f: DQFinding }) {
  const navigate = useNavigate();
  return (
    <Card className={cn('border', SEV_STYLE[f.severity])}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold break-words">{f.title}</p>
            <p className="text-[11px] text-muted-foreground break-words mt-0.5">{f.basis}</p>
          </div>
          <Badge variant="outline" className={cn('shrink-0 text-[10px]', SEV_BADGE[f.severity])}>
            {SEVERITY_LABEL[f.severity]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-bold">{f.recordCount.toLocaleString()}<span className="text-xs font-normal ml-0.5">{f.recordUnit}</span></span>
          <span className="text-xs text-muted-foreground">원인 그룹 {f.groupCount.toLocaleString()}{f.groupUnit}</span>
        </div>
        {f.samples.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {f.samples.map((s, i) => (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-background/70 border border-border break-all">{s}</span>
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

  const sevParam = params.get('severity') as Severity | null;
  const severity: Severity | 'all' = sevParam && sevParam in SEVERITY_LABEL ? sevParam : 'all';
  const typeParam = params.get('type') || 'all';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const issues = useMemo(() => findings.filter((f) => f.recordCount > 0), [findings]);
  const clean = useMemo(() => findings.filter((f) => f.recordCount === 0), [findings]);

  const visible = useMemo(() => {
    let list = issues;
    if (severity !== 'all') list = list.filter((f) => f.severity === severity);
    if (typeParam !== 'all') list = list.filter((f) => f.id === typeParam);
    return [...list].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.recordCount - a.recordCount,
    );
  }, [issues, severity, typeParam]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, check: 0, info: 0 };
    for (const f of issues) c[f.severity] += 1;
    return c;
  }, [issues]);

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
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={reload} aria-label="새로고침">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {failedSources.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] break-words">
                일부 데이터를 불러오지 못했습니다: {failedSources.join(', ')}. 표시된 숫자는 실제보다 적을 수 있습니다(0건 아님).
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
                <p className="text-lg font-bold">{counts[s]}<span className="text-xs font-normal ml-0.5">항목</span></p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                {issues.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm">{issues.length === 0 ? '점검 항목 전체 정상입니다.' : '선택한 조건에 해당하는 이상이 없습니다.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((f) => <FindingCard key={f.id} f={f} />)}
        </div>
      )}

      {!loading && clean.length > 0 && (
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> 정상 항목 {clean.length}개 보기
          </summary>
          <ul className="mt-2 space-y-1">
            {clean.map((f) => (
              <li key={f.id} className="text-[11px] text-muted-foreground break-words">· {f.title} — 0건</li>
            ))}
          </ul>
        </details>
      )}
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
