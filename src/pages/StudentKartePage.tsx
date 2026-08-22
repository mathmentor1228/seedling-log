// STUDENT-KARTE-V2 — 원장/담당 강사용 학생 카르테 (읽기 전용)
// 새 저장·발송·자동 점수 없음. 기존 상세 화면으로 링크만 제공한다.
import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, ExternalLink, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { summarizeEvents } from '@/lib/reportDelivery';
import {
  KARTE_REPORT_WEEKS, KARTE_SUMMARY_DAYS, KARTE_TREND_WEEKS, useStudentKarte,
} from '@/components/student-karte/useStudentKarte';
import {
  PERIOD_LABEL, parsePeriod, type KartePeriod,
} from '@/components/student-karte/karteSummary';

function EmptyLine({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{text}</p>;
}

function SectionCard({ title, basis, children }: { title: string; basis: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2 min-w-0">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="text-[11px] text-muted-foreground break-words">{basis}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function KarteContent() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const period: KartePeriod = parsePeriod(sp.get('period'));
  const subject = sp.get('subject') || 'all';

  const k = useStudentKarte(studentId, { period, subject });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (!value || value === 'all' || (key === 'period' && value === '12w')) next.delete(key);
    else next.set(key, value);
    setSp(next, { replace: true });
  };

  const summaryItems = useMemo(() => {
    const s = k.summary;
    if (!s) return [];
    const d = `최근 ${KARTE_SUMMARY_DAYS}일`;
    return [
      { label: '미작성 수업일지', value: s.notStarted, basis: `${d} · 수업일지 기록 없음` },
      { label: '작성 중(미마감)', value: s.inProgress, basis: `${d} · 일부 기록·미마감` },
      { label: '수업출결 미선택', value: s.attendanceUnset, basis: `${d} · 미마감 기록 중 출결 공란` },
      { label: '결석', value: s.absent, basis: `${d} · 강사 판단 수업출결` },
      { label: '지각', value: s.late, basis: `${d} · 강사 판단 수업출결` },
      { label: '조퇴', value: s.earlyLeave, basis: `${d} · 강사 판단 수업출결` },
      { label: '입실 태그 차이', value: s.checkInGap, basis: `${d} · 출석인데 입실 로그 없음` },
      { label: '숙제 미이행', value: s.homeworkNotDone, basis: `${d} · 확인 결과 미이행 계열` },
      { label: '숙제 미제출·미확인', value: s.homeworkUnsubmitted, basis: `${d} · 제출·확인 기록 없음` },
    ].filter((i) => i.value > 0);
  }, [k.summary]);

  // (라) 최근 8주 리포트 + 수업 0건 판정 (실제 수업일지 건수 기준)
  const reportRows = useMemo(() => {
    return k.reports.slice(0, KARTE_REPORT_WEEKS).map((r) => {
      const lessonCount = k.lessons.filter(
        (l) => l.lesson_date >= r.week_start && l.lesson_date <= r.week_end
      ).length;
      const ev = summarizeEvents(k.deliveryEvents[r.id] || []);
      return { report: r, lessonCount, delivery: ev };
    });
  }, [k.reports, k.lessons, k.deliveryEvents]);

  const staleNote = useMemo(() => {
    if (k.notesUnavailable) return null;
    if (!k.lastNoteDate) return '상담 기록 없음';
    const days = Math.round(
      (new Date(`${k.today}T00:00:00Z`).getTime() - new Date(`${k.lastNoteDate}T00:00:00Z`).getTime()) / 86400000
    );
    return days >= 60 ? `마지막 상담 ${days}일 경과` : null;
  }, [k.notesUnavailable, k.lastNoteDate, k.today]);

  const zeroLessonReports = reportRows.filter((r) => r.lessonCount === 0).length;

  if (k.loading) {
    return (
      <div className="space-y-3 max-w-4xl mx-auto p-3 sm:p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (k.forbidden) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          담당 학생이 아니어서 카르테를 열람할 수 없습니다. 담당 반·과목 배정 또는 수업 기록이 있어야 조회됩니다.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/teacher')}>대시보드로</Button>
      </div>
    );
  }

  if (k.notFound) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          해당 학생을 찾을 수 없습니다. 삭제되었거나 잘못된 주소일 수 있습니다.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/students')}>학생 목록으로</Button>
      </div>
    );
  }

  if (k.fatalError || !k.student) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{k.fatalError || '학생 정보를 불러오지 못했습니다.'}</p>
        <Button variant="outline" size="sm" onClick={k.reload}>다시 시도</Button>
      </div>
    );
  }

  const s = k.student;
  const withdrawn = !!s.withdrawn_at || s.enrollment_status === '퇴원';
  const recentLessons = k.lessons.slice(0, 8);

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4 min-w-0">
      <Button variant="ghost" size="sm" onClick={() => navigate('/students')} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> 학생 목록
      </Button>

      {/* 헤더 */}
      <Card>
        <CardContent className="p-4 space-y-2 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-lg font-bold break-words">{s.name} 카르테</h1>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                {[s.school || '학교 미등록', s.grade || (s.grade_year ? `${s.grade_year}학년` : null)]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <Badge variant={withdrawn ? 'destructive' : 'secondary'}>
              {withdrawn ? `퇴원${s.withdrawn_at ? ` (${s.withdrawn_at.slice(0, 10)})` : ''}` : s.enrollment_status || '재원'}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="min-w-0">
              <p className="text-muted-foreground">담당 반</p>
              <p className="font-medium break-words">{k.classNames.length ? k.classNames.join(', ') : '배정 없음'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">담당 강사</p>
              <p className="font-medium break-words">
                {k.teachers.length ? k.teachers.map((t) => `${t.subject} ${t.name}`).join(', ') : '지정 없음'}
              </p>
              {k.teachers.some((t) => t.source === 'fallback') && (
                <p className="text-[11px] text-muted-foreground">최근 수업 담당(대체) · 담당 매핑 미등록</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">최근 수업일</p>
              <p className="font-medium">{k.lastLessonDate || '수업 기록 없음'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">최근 상담 / 리포트</p>
              <p className="font-medium break-words">
                {(k.notesUnavailable ? '상담 조회 불가' : k.lastNoteDate || '상담 기록 없음')}
                {' / '}
                {k.lastReportDate || '리포트 없음'}
              </p>
            </div>
          </div>

          {/* 필터 */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Select value={period} onValueChange={(v) => setParam('period', v)}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4w">{PERIOD_LABEL['4w']}</SelectItem>
                <SelectItem value="12w">{PERIOD_LABEL['12w']}</SelectItem>
                <SelectItem value="term">{PERIOD_LABEL.term}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={subject} onValueChange={(v) => setParam('subject', v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="과목" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 과목</SelectItem>
                {k.subjects.map((sub) => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {withdrawn && (
            <p className="text-[11px] text-muted-foreground">
              퇴원 처리된 학생입니다. 과거 기록 열람 전용이며 이 화면에서는 어떤 수정도 하지 않습니다.
            </p>
          )}
          {k.partialErrors.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 break-words">
              <AlertTriangle className="w-3 h-3 shrink-0" /> 일부 데이터를 불러오지 못했습니다(0건 아님): {k.partialErrors.join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* (가) 지금 확인할 것 */}
      <SectionCard
        title="지금 확인할 것"
        basis={`기준 ${k.from30} ~ ${k.today} (KST · 최근 ${KARTE_SUMMARY_DAYS}일) · 원천: 수업일지·출입 태그·숙제·주간 리포트 실제 기록만`}
      >
        {summaryItems.length === 0 && zeroLessonReports === 0 && !staleNote ? (
          <p className="text-sm flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> 정상 — 확인이 필요한 항목이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {summaryItems.map((i) => (
              <div key={i.label} className="rounded-lg border border-border/60 bg-muted/30 p-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold break-words">{i.label}</span>
                  <span className="text-base font-bold tabular-nums shrink-0">{i.value}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{i.basis}</p>
              </div>
            ))}
            {zeroLessonReports > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">수업 0건 주간 리포트</span>
                  <span className="text-base font-bold tabular-nums shrink-0">{zeroLessonReports}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">최근 {KARTE_REPORT_WEEKS}주 · 해당 주 수업일지 0건</p>
              </div>
            )}
            {staleNote && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 min-w-0">
                <span className="text-xs font-semibold">상담 간격</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">{staleNote} (60일 기준)</p>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* (나) 최근 수업 8회 */}
      <SectionCard
        title="최근 수업 8회"
        basis={`${PERIOD_LABEL[period]}(${k.fromPeriod} ~ ${k.today}) · ${subject === 'all' ? '전체 과목' : subject} · 수업출결은 강사 판단(수업일지) 기준`}
      >
        {recentLessons.length === 0 ? (
          <EmptyLine text="해당 기간 수업일지 기록이 없습니다." />
        ) : (
          <ul className="space-y-1.5">
            {recentLessons.map((l) => (
              <li key={l.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-w-0">
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-[52px] pt-0.5">
                  {l.lesson_date.slice(5)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{l.subject || '과목 미기재'}</span>
                    <span className="text-xs font-medium break-words">
                      {(l.attendance_status || []).join('/') || '수업출결 미선택'}
                    </span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded',
                      l.submitted ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                      {l.submitted ? '마감 완료' : '미마감'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                    진도 {l.lesson_range?.trim() || '미입력'} · 이해도 {typeof l.understanding_score === 'number' ? `${l.understanding_score}/5` : '미입력'} · 숙제 {l.homework_status || '미입력'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {l.teacher_display_name ? `강사 ${l.teacher_display_name}` : '강사 미기재'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => navigate(`/lessons/record/${l.id}`)} title="수업일지 상세">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* (다) 변화 */}
      <SectionCard
        title={`변화 — 최근 ${KARTE_TREND_WEEKS}주`}
        basis={`주(월요일) 단위 · 출석률 분모=출결이 기록된 수업, 숙제 완료율 분모=결과가 기록된 숙제, 이해도=입력된 값 평균. 분모 0은 '데이터 없음'`}
      >
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] min-w-[320px]">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1 pr-2 font-medium">주</th>
                <th className="py-1 pr-2 font-medium">수업</th>
                <th className="py-1 pr-2 font-medium">출석률</th>
                <th className="py-1 pr-2 font-medium">숙제</th>
                <th className="py-1 font-medium">이해도</th>
              </tr>
            </thead>
            <tbody>
              {k.trend.map((w) => (
                <tr key={w.weekStart} className="border-t border-border/40">
                  <td className="py-1 pr-2 tabular-nums">{w.weekStart.slice(5)}</td>
                  <td className="py-1 pr-2 tabular-nums">{w.lessonCount || '—'}</td>
                  <td className="py-1 pr-2 tabular-nums">
                    {w.attendanceRate === null ? <span className="text-muted-foreground">데이터 없음</span> : `${w.attendanceRate}% (${w.attendanceDenom})`}
                  </td>
                  <td className="py-1 pr-2 tabular-nums">
                    {w.homeworkRate === null ? <span className="text-muted-foreground">데이터 없음</span> : `${w.homeworkRate}% (${w.homeworkDenom})`}
                  </td>
                  <td className="py-1 tabular-nums">
                    {w.understandingAvg === null ? <span className="text-muted-foreground">데이터 없음</span> : `${w.understandingAvg} (${w.understandingDenom})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* (라) 리포트 */}
      <SectionCard
        title={`최근 ${KARTE_REPORT_WEEKS}주 주간 리포트`}
        basis="작성(생성 여부) · 공개(학부모 공개 설정) · 발송 확인(사람이 남긴 수동 확인 이력)은 서로 다른 신호입니다. 이 화면에서는 발송하지 않습니다."
      >
        {reportRows.length === 0 ? (
          <EmptyLine text="해당 기간 생성된 주간 리포트가 없습니다." />
        ) : (
          <ul className="space-y-1.5">
            {reportRows.map(({ report: r, lessonCount, delivery }) => (
              <li key={r.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium tabular-nums">{r.week_start} ~ {r.week_end}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">작성 완료</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded',
                      r.parent_visible ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                      {r.parent_visible ? '학부모 공개' : '비공개 초안'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      발송 {delivery.state === 'confirmed' ? '확인됨' : delivery.state === 'failed' ? '실패 기록' : '확인 없음'}
                    </span>
                    {lessonCount === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">수업 0건</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">해당 주 수업일지 {lessonCount}건</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => navigate('/reports')}>목록</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => navigate('/reports/status')}>발송 현황</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* (마) 상담·메모 */}
      <SectionCard
        title="상담 · 원내 메모"
        basis="기존 팀 메모 중 이 학생과 연결된 기록만 조회합니다. 이 화면에서는 작성·수정하지 않습니다."
      >
        {k.notesUnavailable ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 py-4">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> 상담 기록을 조회하지 못했습니다. 기록이 0건이라는 뜻이 아닙니다.
          </p>
        ) : k.notes.length === 0 ? (
          <EmptyLine text="연결된 상담·메모 기록이 없습니다." />
        ) : (
          <ul className="space-y-1.5">
            {k.notes.slice(0, 10).map((n) => (
              <li key={n.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-w-0">
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-[52px] pt-0.5">
                  {n.created_at.slice(5, 10)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium break-words">{n.title || '제목 없음'}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                    {[n.scope, n.status, n.target_role ? `대상 ${n.target_role}` : null].filter(Boolean).join(' · ') || '분류 없음'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="w-3.5 h-3.5" /> 최근 {KARTE_REPORT_WEEKS}주 리포트 {k.reports.length}건 · 조회 전용 화면입니다.
        </div>
      </SectionCard>
    </div>
  );
}

export default function StudentKartePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <KarteContent />
    </ProtectedRoute>
  );
}
