// PRINCIPAL-ACTION-V1
// 원장 홈 최상단 '지금 처리할 것'. 읽기 전용이며 어떤 저장도 하지 않는다.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALERT_WINDOW_DAYS,
  sumIssues,
  usePrincipalAlerts,
  type ClassDayGroup,
} from './usePrincipalAlerts';

type ItemKey = 'not_started' | 'in_progress' | 'attendance_unset' | 'check_in_partial' | 'no_check_in' | 'job_failure';

interface ActionItem {
  key: ItemKey;
  label: string;
  /** 숫자의 의미·기준·기간 */
  basis: string;
  count: number;
  unit: string;
  tone: 'red' | 'amber' | 'neutral';
  groups?: ClassDayGroup[];
}

const TONE: Record<ActionItem['tone'], string> = {
  red: 'border-destructive/40 bg-destructive/5',
  amber: 'border-amber-500/40 bg-amber-500/5',
  neutral: 'border-border bg-muted/30',
};

const TONE_TEXT: Record<ActionItem['tone'], string> = {
  red: 'text-destructive',
  amber: 'text-amber-600 dark:text-amber-400',
  neutral: 'text-foreground',
};

function fmtDate(d: string) {
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${d}T12:00:00+09:00`).getUTCDay()];
  return `${d.slice(5).replace('-', '.')} (${dow})`;
}

export function PrincipalActionCenter({
  todayNoCheckInCount,
  onOpenNoCheckIn,
}: {
  /** 오늘 출입 로그가 있으나 입실 태그가 없는 학생 수 (상위 컴포넌트가 이미 조회한 값 재사용) */
  todayNoCheckInCount: number;
  onOpenNoCheckIn: () => void;
}) {
  const navigate = useNavigate();
  const alerts = usePrincipalAlerts();
  const [detail, setDetail] = useState<ActionItem | null>(null);

  const items = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [
      {
        key: 'not_started',
        label: '미작성 수업일지',
        basis: `최근 ${ALERT_WINDOW_DAYS}일 · 기록이 전혀 없는 수업`,
        count: sumIssues(alerts.notStarted),
        unit: '건',
        tone: 'red',
        groups: alerts.notStarted,
      },
      {
        key: 'in_progress',
        label: '작성 중(미마감)',
        basis: `최근 ${ALERT_WINDOW_DAYS}일 · 일부만 기록되고 마감 안 된 수업`,
        count: sumIssues(alerts.inProgress),
        unit: '건',
        tone: 'amber',
        groups: alerts.inProgress,
      },
      {
        key: 'attendance_unset',
        label: '수업출결 미선택',
        basis: `최근 ${ALERT_WINDOW_DAYS}일 · 교사 판단 출결이 비어 있는 미마감 기록`,
        count: sumIssues(alerts.attendanceUnset),
        unit: '명',
        tone: 'amber',
        groups: alerts.attendanceUnset,
      },
      {
        key: 'check_in_partial',
        label: '입실 태그 부분 누락',
        basis: `최근 ${ALERT_WINDOW_DAYS}일 · 종료된 수업 · 마감 완료 · 출석 처리 학생 중, 같은 반에서 일부만 태그된 경우의 누락 인원 (결석 제외)`,
        count: sumIssues(alerts.checkInPartial),
        unit: '명',
        tone: 'amber',
        groups: alerts.checkInPartial,
      },
      {
        key: 'no_check_in',
        label: '오늘 입실 미기록',
        basis: '오늘 · 출입 태그 기준 입실이 찍히지 않은 학생',
        count: todayNoCheckInCount,
        unit: '명',
        tone: 'amber',
      },
    ];
    if (alerts.jobFailures > 0) {
      list.push({
        key: 'job_failure',
        label: '자동 작업 실패',
        basis: `최근 ${ALERT_WINDOW_DAYS}일 · 주간 리포트 자동 생성 작업 실패`,
        count: alerts.jobFailures,
        unit: '건',
        tone: 'red',
      });
    }
    return list;
  }, [alerts, todayNoCheckInCount]);

  const problems = items.filter((i) => i.count > 0);

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
              지금 처리할 것
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              기준 기간 {alerts.from} ~ {alerts.to} (KST · 최근 {ALERT_WINDOW_DAYS}일)
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={alerts.reload} aria-label="새로고침">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {alerts.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> 점검 중…
          </div>
        ) : alerts.error ? (
          <div className="text-sm text-destructive py-2">
            점검 데이터를 불러오지 못했습니다.
            <Button variant="outline" size="sm" className="ml-2 h-7" onClick={alerts.reload}>다시 시도</Button>
          </div>
        ) : problems.length === 0 ? (
          <p className="text-sm flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 py-1">
            <CheckCircle2 className="w-4 h-4" /> 정상 — 처리할 항목이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {problems.map((it) => (
              <button
                key={`${it.key}-${it.label}`}
                type="button"
                onClick={() => {
                  if (it.key === 'not_started' || it.key === 'in_progress') {
                    navigate(`/admin/unclosed?days=${ALERT_WINDOW_DAYS}&status=${it.key}`);
                    return;
                  }
                  if (it.groups) setDetail(it);
                  else onOpenNoCheckIn();
                }}
                className={cn(
                  'text-left rounded-xl border p-3 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-0',
                  TONE[it.tone]
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{it.label}</span>
                  <span className={cn('text-lg font-bold tabular-nums shrink-0', TONE_TEXT[it.tone])}>
                    {it.count}
                    <span className="text-xs font-medium ml-0.5">{it.unit}</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{it.basis}</p>
                <span className="text-[11px] text-primary inline-flex items-center mt-1">
                  자세히 보기 <ChevronRight className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        )}

        {!alerts.loading && !alerts.error && alerts.checkInUntagged.length > 0 && (
          <details className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <summary className="text-xs font-medium cursor-pointer list-none flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 shrink-0" />
              입실 태그 미사용 수업 {alerts.checkInUntagged.length}개
              <span className="text-[11px] font-normal text-muted-foreground">
                (참고 · 학생 {alerts.checkInUntaggedStudents}명)
              </span>
            </summary>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              반 전체가 출입 태그를 쓰지 않은 수업입니다. 학생 개인의 누락이 아니므로 경고 숫자에 넣지 않습니다.
              기준: 최근 {ALERT_WINDOW_DAYS}일 · 종료된 수업 · 마감 완료 · 출석 처리 학생 · 단위는 수업(반·날짜).
            </p>
            <ul className="mt-2 space-y-1">
              {alerts.checkInUntagged.map((g) => (
                <li key={g.key} className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                  <span className="truncate">{fmtDate(g.date)} · {g.className}</span>
                  <span className="tabular-nums shrink-0">체크인 0/{g.studentCount}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {!alerts.loading && !alerts.error && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(`/admin/unclosed?days=${ALERT_WINDOW_DAYS}`)}>
              강사별 미마감 관리 열기
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate('/admin/data-quality')}>
              데이터 점검 열기
            </Button>
          </div>
        )}

        {!alerts.loading && !alerts.error && problems.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            미작성·작성 중 숫자를 누르면 강사별 미마감 화면으로, 그 외 숫자는 해당 반·날짜 목록으로 이동합니다. 완료된 정상 건은 목록에 표시하지 않습니다.
          </p>
        )}
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.label} · {detail ? sumIssues(detail.groups || []) : 0}{detail?.unit}</DialogTitle>
            <DialogDescription className="text-xs">{detail?.basis}</DialogDescription>
          </DialogHeader>
          {(detail?.groups?.length || 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">해당 항목이 없습니다.</p>
          ) : (
            <ScrollArea className="max-h-[55vh] pr-2">
              <ul className="space-y-1.5">
                {(detail?.groups || []).map((g) => (
                  <li
                    key={g.key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{g.className}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(g.date)} ·{' '}
                        {detail?.key === 'check_in_partial'
                          ? `체크인 ${g.studentCount - g.issueCount}/${g.studentCount} · 누락 ${g.issueCount}명`
                          : `대상 ${g.issueCount}/${g.studentCount}명`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0"
                      onClick={() => {
                        setDetail(null);
                        navigate(`/lessons/close?classId=${g.classId}&date=${g.date}`);
                      }}
                    >
                      열기
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          <div className="pt-1">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDetail(null); navigate('/lessons'); }}>
              전체 수업 기록 목록으로 이동
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PrincipalIssueBadge({ count }: { count: number }) {
  return count > 0 ? <Badge variant="destructive">{count}</Badge> : null;
}
