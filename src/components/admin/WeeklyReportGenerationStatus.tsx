// WEEKLY-REPORT-REPAIR-V1: 주간리포트 생성 상태 패널 (생성과 공개/발송은 분리)
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, FileClock } from 'lucide-react';

interface Props {
  weekStart: string;
  weekEnd: string;
  generating: boolean;
  onGenerateAll: () => void | Promise<void>;
  refreshToken?: number;
}

export function WeeklyReportGenerationStatus({ weekStart, weekEnd, generating, onGenerateAll, refreshToken }: Props) {
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [lastWeekStart, setLastWeekStart] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastRunSource, setLastRunSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ count: students }, { data: rows }, { data: lastReport }, { data: lastJob }] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).in('enrollment_status', ['재학', '재등원']),
        supabase.from('weekly_reports').select('id, parent_visible, report_quality_tag, summary').eq('week_start', weekStart),
        supabase.from('weekly_reports').select('week_start').order('week_start', { ascending: false }).limit(1),
        supabase.from('weekly_jobs_log').select('created_at, scheduler_source').eq('job_name', 'generate_weekly_reports').order('created_at', { ascending: false }).limit(1),
      ]);

      setActiveCount(students || 0);
      const list = rows || [];
      setDraftCount(list.filter(r => !r.parent_visible && r.summary !== 'error').length);
      setErrorCount(list.filter(r => r.summary === 'error' || r.report_quality_tag === 'RED').length);
      setVisibleCount(list.filter(r => r.parent_visible).length);
      setLastWeekStart(lastReport?.[0]?.week_start ?? null);
      setLastRunAt(lastJob?.[0]?.created_at ?? null);
      setLastRunSource(lastJob?.[0]?.scheduler_source ?? null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const generatedTotal = draftCount + errorCount + visibleCount;
  const missing = Math.max(0, activeCount - generatedTotal);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileClock className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">생성 상태</CardTitle>
            <Badge variant="outline" className="text-[11px]">{weekStart} ~ {weekEnd}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={generating}>
                  {generating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  이번 주 초안 생성
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{weekStart} ~ {weekEnd} 초안을 생성할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    미생성 학생 {missing}명 대상입니다. 초안만 만들며 학부모 공개나 발송은 하지 않습니다.
                    이미 생성된 리포트와 공개본은 덮어쓰지 않습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => { await onGenerateAll(); load(); }}>
                    초안 생성
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: '활성 학생', value: activeCount },
            { label: '이번 주 초안', value: draftCount },
            { label: '미생성', value: missing },
            { label: '오류/RED', value: errorCount },
            { label: '공개됨', value: visibleCount },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-xl font-bold">{loading ? '—' : m.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          마지막 생성 주차: {lastWeekStart ?? '없음'} · 마지막 실행: {lastRunAt ? new Date(lastRunAt).toLocaleString('ko-KR') : '없음'}
          {lastRunSource ? ` (${lastRunSource})` : ''} · 자동 스케줄 미설정 상태입니다.
        </p>
      </CardContent>
    </Card>
  );
}
