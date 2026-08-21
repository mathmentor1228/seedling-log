// STUDENT-KARTE-V1 — 원장/관리자 전용 학생 카르테 (읽기 전용)
// 새 저장·발송·자동 점수 없음. 기존 상세 화면으로 링크만 제공한다.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Loader2, ExternalLink, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAttendanceLabel } from '@/lib/attendance';
import {
  KARTE_SUMMARY_DAYS, KARTE_TIMELINE_DAYS, useStudentKarte,
} from '@/components/student-karte/useStudentKarte';
import type { TimelineItem, TimelineKind } from '@/components/student-karte/karteSummary';

const KIND_LABEL: Record<TimelineKind, string> = {
  lesson: '수업일지',
  attendance: '출입',
  homework: '숙제',
  report: '리포트',
  note: '상담·메모',
};

const KIND_TONE: Record<TimelineKind, string> = {
  lesson: 'bg-primary/10 text-primary',
  attendance: 'bg-muted text-muted-foreground',
  homework: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  report: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  note: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

function EmptyLine({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{text}</p>;
}

function TimelineList({ items, emptyText }: { items: TimelineItem[]; emptyText: string }) {
  const navigate = useNavigate();
  if (items.length === 0) return <EmptyLine text={emptyText} />;
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-w-0">
          <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-[52px] pt-0.5">
            {it.date.slice(5)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded', KIND_TONE[it.kind])}>{KIND_LABEL[it.kind]}</span>
              <span className="text-xs font-medium truncate">{it.title}</span>
            </div>
            {it.detail && <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{it.detail}</p>}
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{it.authorRole}</p>
          </div>
          {it.href && (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => navigate(it.href!)} title="상세 보기">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function KarteContent() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const k = useStudentKarte(studentId);
  const [tab, setTab] = useState('summary');

  const summaryItems = useMemo(() => {
    const s = k.summary;
    if (!s) return [];
    return [
      { label: '미작성 수업일지', value: s.notStarted, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · lesson_records 기록 없음` },
      { label: '작성 중(미마감)', value: s.inProgress, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 일부 기록·미마감` },
      { label: '수업출결 미선택', value: s.attendanceUnset, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 미마감 기록 중 출결 공란` },
      { label: '결석', value: s.absent, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 교사 판단 수업출결` },
      { label: '지각', value: s.late, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 교사 판단 수업출결` },
      { label: '조퇴', value: s.earlyLeave, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 교사 판단 수업출결` },
      { label: '입실 태그 차이', value: s.checkInGap, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 출석인데 attendance_logs 입실 없음` },
      { label: '숙제 미이행', value: s.homeworkNotDone, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 확인 결과 미이행 계열` },
      { label: '숙제 미제출·미확인', value: s.homeworkUnsubmitted, basis: `최근 ${KARTE_SUMMARY_DAYS}일 · 제출·확인 기록 없음` },
    ].filter((i) => i.value > 0);
  }, [k.summary]);

  if (k.loading) {
    return (
      <div className="space-y-3 max-w-4xl mx-auto p-3 sm:p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
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
  const lessonItems = k.timeline.filter((t) => t.kind === 'lesson' || t.kind === 'attendance');
  const hwItems = k.timeline.filter((t) => t.kind === 'homework' || t.kind === 'report');
  const noteItems = k.timeline.filter((t) => t.kind === 'note');

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/students')} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> 학생 목록
      </Button>

      {/* 헤더 */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{s.name} 카르테</h1>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                {[s.school || '학교 미등록', s.grade || (s.grade_year ? `${s.grade_year}학년` : null)]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <Badge variant={withdrawn ? 'destructive' : 'secondary'}>
              {withdrawn ? `퇴원${s.withdrawn_at ? ` (${s.withdrawn_at.slice(0, 10)})` : ''}` : s.enrollment_status || '재원'}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="min-w-0">
              <p className="text-muted-foreground">담당 반</p>
              <p className="font-medium break-words">{k.classNames.length ? k.classNames.join(', ') : '배정 없음'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">담당 강사</p>
              <p className="font-medium break-words">
                {k.teachers.length ? k.teachers.map((t) => `${t.subject} ${t.name}`).join(', ') : '지정 없음'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">최근 상담·메모</p>
              <p className="font-medium">{k.lastNoteDate || '상담 기록 없음'}</p>
            </div>
          </div>
          {withdrawn && (
            <p className="text-[11px] text-muted-foreground">
              퇴원 처리된 학생입니다. 과거 기록 열람 전용이며 이 화면에서는 어떤 수정도 하지 않습니다.
            </p>
          )}
          {k.partialErrors.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 일부 데이터를 불러오지 못했습니다: {k.partialErrors.join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="summary" className="text-xs">요약</TabsTrigger>
          <TabsTrigger value="lessons" className="text-xs">수업·출결</TabsTrigger>
          <TabsTrigger value="homework" className="text-xs">숙제·리포트</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">상담</TabsTrigger>
        </TabsList>

        {/* 요약 */}
        <TabsContent value="summary" className="space-y-3 mt-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-bold">지금 볼 것</h2>
              <p className="text-[11px] text-muted-foreground">
                기준 {k.from30} ~ {k.today} (KST · 최근 {KARTE_SUMMARY_DAYS}일). 원천: 수업일지·출입 태그·숙제·주간 리포트.
              </p>
              {summaryItems.length === 0 ? (
                <p className="text-sm flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> 정상 — 확인이 필요한 항목이 없습니다.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {summaryItems.map((i) => (
                    <div key={i.label} className="rounded-lg border border-border/60 bg-muted/30 p-2.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{i.label}</span>
                        <span className="text-base font-bold tabular-nums shrink-0">{i.value}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{i.basis}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-1 flex items-center gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  최근 {KARTE_SUMMARY_DAYS}일 주간 리포트: {k.summary?.hasRecentReport ? '있음' : '없음'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-bold">타임라인</h2>
              <p className="text-[11px] text-muted-foreground">
                최근 {KARTE_TIMELINE_DAYS}일 ({k.from90} ~ {k.today}) 상담·수업일지·출입·숙제·리포트 통합, 최신순 · 요약만 표시
              </p>
              <TimelineList items={k.timeline.slice(0, 60)} emptyText={`최근 ${KARTE_TIMELINE_DAYS}일 기록이 없습니다.`} />
              {k.timeline.length > 60 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  최근 60건만 표시합니다. 상세는 각 탭과 기존 상세 화면에서 확인하세요.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 수업·출결 */}
        <TabsContent value="lessons" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-bold">수업일지 · 출입 기록</h2>
              <p className="text-[11px] text-muted-foreground">
                수업출결은 강사 판단(lesson_records), 입실·퇴실은 출입 태그(attendance_logs) 기준입니다.
              </p>
              <TimelineList items={lessonItems} emptyText="수업·출결 기록이 없습니다." />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 숙제·리포트 */}
        <TabsContent value="homework" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-bold">숙제 · 주간 리포트</h2>
              <p className="text-[11px] text-muted-foreground">
                내용은 요약만 표시하며 원문·발송은 기존 화면에서 확인합니다.
              </p>
              <TimelineList items={hwItems} emptyText="숙제·리포트 기록이 없습니다." />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 상담 */}
        <TabsContent value="notes" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h2 className="text-sm font-bold">상담 · 원내 메모</h2>
              <p className="text-[11px] text-muted-foreground">
                기존 팀 메모(team_notes) 중 이 학생과 연결된 기록만 표시합니다. 이 화면에서는 작성·수정하지 않습니다.
              </p>
              <TimelineList items={noteItems} emptyText="상담·메모 기록이 없습니다." />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StudentKartePage() {
  return (
    <ProtectedRoute allowedRoles={['admin']} allowedEmails={['bfkor8810@naver.com']}>
      <KarteContent />
    </ProtectedRoute>
  );
}
