// UNCLOSED-BY-TEACHER-V1 — 원장/관리자 전용 강사별 미마감 관리 (읽기 전용)
// 자동 발송·DB write 없음. 안내문은 클립보드 텍스트만 생성한다.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Copy, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useUnclosedByTeacher, type StatusFilter, type WindowDays,
} from '@/components/principal/useUnclosedByTeacher';
import { buildTeacherNotice, groupStateLabel, NO_CLASS } from '@/components/principal/unclosedSummary';

const DAY_OPTIONS: WindowDays[] = [7, 14, 30];
const STATUS_LABEL: Record<StatusFilter, string> = {
  all: '전체',
  not_started: '전체 미작성',
  in_progress: '일부 작성',
};

function fmtDate(d: string) {
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${d}T12:00:00+09:00`).getUTCDay()];
  return `${d.slice(5).replace('-', '.')} (${dow})`;
}

function UnclosedContent() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);

  const daysParam = Number(params.get('days'));
  const days: WindowDays = (DAY_OPTIONS as number[]).includes(daysParam) ? (daysParam as WindowDays) : 14;
  const statusParam = params.get('status') as StatusFilter | null;
  const status: StatusFilter = statusParam && statusParam in STATUS_LABEL ? statusParam : 'all';
  const teacher = params.get('teacher');
  const classId = params.get('classId');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next); // push → 뒤로가기로 이전 필터 복원
  };

  const data = useUnclosedByTeacher({ days, teacher, classId, status });
  const windowLabel = `최근 ${days}일(${data.from} ~ ${data.to})`;

  const filtersActive = !!(teacher || classId || status !== 'all');

  const copyNotice = async (teacherName: string) => {
    const t = data.teachers.find((x) => x.teacher === teacherName);
    if (!t) return;
    const text = buildTeacherNotice(t, windowLabel);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('안내문을 복사했습니다. 발송은 직접 확인 후 진행하세요.');
    } catch {
      toast.error('복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
    }
  };

  const summary = useMemo(() => {
    const t = data.teachers;
    return {
      teacherCount: t.length,
      total: data.totalUnclosed,
      oldest: t.length ? t.map((x) => x.oldestDate).sort()[0] : null,
    };
  }, [data.teachers, data.totalUnclosed]);

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/principal')}>
        <ArrowLeft className="w-4 h-4 mr-1" /> 원장 대시보드
      </Button>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-bold">강사별 미마감 수업일지</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                {windowLabel} (KST) · lesson_records 기준, 마감(제출 완료) 기록은 제외합니다.
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={data.reload} aria-label="새로고침">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* 필터 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Select value={String(days)} onValueChange={(v) => setParam('days', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((d) => <SelectItem key={d} value={String(d)}>최근 {d}일</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={teacher || 'all'} onValueChange={(v) => setParam('teacher', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="강사 전체" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">강사 전체</SelectItem>
                {data.teacherOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classId || 'all'} onValueChange={(v) => setParam('classId', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="반 전체" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">반 전체</SelectItem>
                {data.classOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setParam('status', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setParams(new URLSearchParams({ days: String(days) }))}>
              필터 초기화
            </Button>
          )}

          {/* 상단 요약 */}
          {!data.loading && !data.error && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>미마감 <b className="tabular-nums text-destructive">{summary.total}</b>건</span>
              <span>강사 <b className="tabular-nums">{summary.teacherCount}</b>명</span>
              <span className="text-muted-foreground">
                가장 오래된 수업일 {summary.oldest ? fmtDate(summary.oldest) : '-'}
              </span>
            </div>
          )}

          {data.partialErrors.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 일부 정보를 불러오지 못했습니다: {data.partialErrors.join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      {data.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : data.error ? (
        <Card><CardContent className="p-6 text-center space-y-3">
          <p className="text-sm text-destructive">{data.error}</p>
          <Button variant="outline" size="sm" onClick={data.reload}>다시 시도</Button>
        </CardContent></Card>
      ) : data.teachers.length === 0 ? (
        <Card><CardContent className="p-6">
          <p className="text-sm flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            {filtersActive ? '선택한 조건에 해당하는 미마감이 없습니다.' : '정상 — 미마감 수업일지가 없습니다.'}
          </p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.teachers.map((t) => {
            const open = expanded === t.teacher;
            return (
              <Card key={t.teacher}>
                <CardContent className="p-3 space-y-2">
                  <button
                    type="button"
                    className="w-full text-left flex items-start gap-2 min-w-0"
                    onClick={() => setExpanded(open ? null : t.teacher)}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="w-4 h-4 mt-1 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-1 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold truncate">{t.teacher}</span>
                        <span className="text-lg font-bold tabular-nums text-destructive shrink-0">
                          {t.unclosedCount}<span className="text-xs font-medium ml-0.5">건</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <Badge variant="outline" className="text-[10px]">가장 오래된 {fmtDate(t.oldestDate)}</Badge>
                        <Badge variant="outline" className="text-[10px]">반 {t.classCount}개</Badge>
                        <Badge variant="secondary" className="text-[10px]">최근 7일 {t.recentCount}건</Badge>
                        <Badge variant="secondary" className="text-[10px]">8일 이상 경과 {t.olderCount}건</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        전체 미작성 {t.notStartedCount}건 · 일부 작성 {t.inProgressCount}건
                      </p>
                    </div>
                  </button>

                  {t.unclosedCount > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copyNotice(t.teacher)}>
                      <Copy className="w-3 h-3 mr-1" /> 강사에게 안내문 복사
                    </Button>
                  )}

                  {open && (
                    <ul className="space-y-1.5 pt-1">
                      {t.groups.map((g) => (
                        <li
                          key={g.key}
                          className={cn(
                            'p-2.5 rounded-lg border min-w-0',
                            g.state === 'not_started' ? 'border-destructive/30 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{g.className} · {fmtDate(g.date)}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                                {groupStateLabel(g)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                미마감 {g.openCount}명 / 전체 {g.studentCount}명 (학생 이름은 표시하지 않습니다)
                              </p>
                            </div>
                            {g.classId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0 text-xs"
                                onClick={() => navigate(`/lessons/close?classId=${g.classId}&date=${g.date}`)}
                              >
                                수업 마감 열기
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 shrink-0 text-xs"
                                onClick={() => navigate('/lessons')}
                                title={`${NO_CLASS} 기록은 반 지정이 없어 수업 기록 조회에서 처리합니다`}
                              >
                                기록 조회
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        이 화면은 조회 전용입니다. 안내문 복사는 클립보드 텍스트만 만들며 어떤 메시지도 자동 발송하지 않습니다.
      </p>
    </div>
  );
}

export default function UnclosedLessonsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <UnclosedContent />
    </ProtectedRoute>
  );
}
