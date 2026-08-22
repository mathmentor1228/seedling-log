// FEATURE-MAP-PAGE-V1 (읽기 전용 · 원장 전용)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import {
  FEATURE_MAP,
  TIER_LABEL,
  featuresByTier,
  signalTables,
  type FeatureEntry,
  type FeatureRole,
  type FeatureTier,
} from '@/lib/featureMap';

interface Signal {
  count30: number | null;
  lastAt: string | null;
}

const ROLE_TABS: { value: FeatureRole; label: string }[] = [
  { value: 'admin', label: '원장/관리자' },
  { value: 'teacher', label: '강사' },
  { value: 'assistant', label: '조교' },
];

const TIER_ORDER: FeatureTier[] = ['core', 'asNeeded', 'archive'];

const TIER_STYLE: Record<FeatureTier, string> = {
  core: 'bg-primary/10 text-primary border-primary/30',
  asNeeded: 'bg-muted text-muted-foreground border-border',
  archive: 'bg-destructive/10 text-destructive border-destructive/30',
};

function useUsageSignals() {
  const [signals, setSignals] = useState<Record<string, Signal>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    (async () => {
      const entries = await Promise.all(
        signalTables().map(async ({ table, column }) => {
          try {
            const [{ count }, { data }] = await Promise.all([
              supabase
                .from(table as never)
                .select('*', { count: 'exact', head: true })
                .gte(column, since),
              supabase
                .from(table as never)
                .select(column)
                .order(column, { ascending: false })
                .limit(1),
            ]);
            const last = (data as Record<string, string>[] | null)?.[0]?.[column] ?? null;
            return [table, { count30: count ?? null, lastAt: last }] as const;
          } catch {
            return [table, { count30: null, lastAt: null }] as const;
          }
        })
      );
      if (!cancelled) {
        setSignals(Object.fromEntries(entries));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { signals, loading };
}

function SignalText({ feature, signals }: { feature: FeatureEntry; signals: Record<string, Signal> }) {
  if (!feature.signalTable) return <span className="text-muted-foreground">신호 없음</span>;
  const s = signals[feature.signalTable];
  if (!s) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="tabular-nums">
      최근 30일 {s.count30 ?? '–'}건
      <span className="text-muted-foreground"> · 최근 {s.lastAt ? s.lastAt.slice(0, 10) : '기록 없음'}</span>
    </span>
  );
}

function FeatureRow({ feature, signals }: { feature: FeatureEntry; signals: Record<string, Signal> }) {
  const isDynamic = feature.href.includes(':');
  return (
    <div className="border border-border rounded-lg p-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm text-foreground">{feature.label}</span>
        <Badge variant="outline" className={TIER_STYLE[feature.tier]}>
          {TIER_LABEL[feature.tier]}
        </Badge>
        {!feature.hasEntryPoint && (
          <Badge variant="outline" className="text-[10px]">메뉴 없음</Badge>
        )}
        {feature.note && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <AlertTriangle className="w-3 h-3" />
            {feature.note}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{feature.description}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {isDynamic ? (
          <span className="text-muted-foreground break-all">{feature.href}</span>
        ) : (
          <Link to={feature.href} className="text-primary inline-flex items-center gap-1 break-all">
            {feature.href}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </Link>
        )}
        <SignalText feature={feature} signals={signals} />
      </div>
    </div>
  );
}

function FeatureMapContent() {
  const { signals, loading } = useUsageSignals();

  const duplicates = useMemo(() => FEATURE_MAP.filter((f) => f.note?.includes('중복')), []);
  const noEntry = useMemo(() => FEATURE_MAP.filter((f) => !f.hasEntryPoint), []);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">기능 지도 (읽기 전용)</h1>
        <p className="text-xs text-muted-foreground">
          역할별 핵심/필요 시/보관 분류와 사용 신호입니다. 사용 신호는 UI 클릭 로그가 아니라 각 기능이 생성·수정하는
          테이블의 최근 30일 레코드 수와 최근 기록일입니다. 이 화면에서는 설정 변경·삭제·자동 숨김을 하지 않습니다.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 사용 신호 불러오는 중…
        </div>
      )}

      <Tabs defaultValue="admin">
        <TabsList className="flex-wrap h-auto">
          {ROLE_TABS.map((r) => (
            <TabsTrigger key={r.value} value={r.value} className="text-xs">
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ROLE_TABS.map((r) => (
          <TabsContent key={r.value} value={r.value} className="space-y-4 mt-4">
            {TIER_ORDER.map((tier) => {
              const items = featuresByTier(r.value, tier);
              if (items.length === 0) return null;
              return (
                <Card key={tier}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {TIER_LABEL[tier]} <span className="text-muted-foreground font-normal">({items.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((f) => (
                      <FeatureRow key={f.href} feature={f} signals={signals} />
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">중복·주의 항목</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {duplicates.map((f) => (
            <div key={f.href} className="flex flex-wrap gap-2">
              <span className="font-medium text-foreground">{f.label}</span>
              <span className="text-muted-foreground break-all">{f.href}</span>
              <span className="text-muted-foreground">{f.note}</span>
            </div>
          ))}
          <div className="pt-2 text-muted-foreground">
            사이드바 메뉴가 없는 화면 {noEntry.length}개 (URL·북마크는 그대로 동작):{' '}
            {noEntry.map((f) => f.label).join(', ')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminFeatureMapPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <FeatureMapContent />
    </ProtectedRoute>
  );
}
