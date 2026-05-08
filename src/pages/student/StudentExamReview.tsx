import { useCallback, useEffect, useMemo, useState } from 'react';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StudentStudyTabs } from '@/components/student/StudentStudyTabs';
import { SelfCheckTab } from '@/components/student/exam-review/SelfCheckTab';
import { PublishedReportCard, type PublishedReportLite } from '@/components/exam-analysis/PublishedReportCard';
import { useStudentAuth } from '@/lib/studentAuth';
import { CheckCircle2, ClipboardCheck, Image as ImageIcon, School, Sparkles } from 'lucide-react';

type ReviewStatus = 'pending' | 'in_review' | 'done';
type ItemResult = 'correct' | 'wrong' | 'partial' | null;

interface ReviewItem {
  id: string;
  item_number: number;
  result: ItemResult;
  error_types: string[];
  item_comment: string | null;
  score_earned?: number | null;
  page_number?: number | null;
  custom_reason?: string | null;
}

interface SelfCheckRow {
  id?: string;
  item_number: number;
  q_remembered: boolean | null;
  q_concept_confused: boolean | null;
  q_academy_helped: boolean | null;
  q_need_more: string | null;
  self_error_types: string[];
  self_custom_reason?: string | null;
}

interface ReviewData {
  id: string;
  earned_score: number | null;
  total_score: number | null;
  overall_comment: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  exam_item_reviews: ReviewItem[];
  self_check_completed?: boolean;
  self_checks?: SelfCheckRow[];
  is_published?: boolean;
  published_at?: string | null;
  template?: { id: string; error_types: string[]; items: Array<{ no: number; points: number }> } | null;
}

interface ExamReviewRow {
  id: string;
  subject: string;
  exam_type: string;
  exam_date: string | null;
  exam_year: number | null;
  exam_period: string | null;
  actual_score: number | null;
  expected_score: number | null;
  review_status: ReviewStatus | null;
  school_name: string;
  submitted_at: string;
  student_exam_result_photos: Array<{ id: string; storage_path: string; sort_order: number; signed_url: string | null }>;
  exam_reviews: ReviewData[];
}

interface SchoolExamReport {
  id: string;
  school_name: string;
  subject: string;
  grade: string;
  exam_type: string;
  exam_year: number;
  exam_period: string;
  total_students: number | null;
  academy_helped_rate: number | null;
  wrong_item_stats: Array<{ wrong_rate?: number; item_number?: number }> | null;
  final_report: string | null;
  recommended_study: string[] | null;
  top_weak_concepts: string[] | null;
  ai_report?: string | null;
}

interface DeepExamReport {
  id: string;
  overall_insights: string | null;
  difficult_points: Array<{ title?: string; reason?: string; study_tip?: string; items?: number[] }>;
  score_band_recommendations: Array<{ band?: string; diagnosis?: string; priority?: string; actions?: string[] }>;
  student_recommendations: Array<{ student_id?: string; student_name?: string; score_band?: string; summary?: string; focus_items?: number[]; recommended_actions?: string[] }>;
  my_recommendation?: { score_band?: string; summary?: string; focus_items?: number[]; recommended_actions?: string[] } | null;
  published_at: string | null;
  exam_analysis_reports?: { school_name?: string; subject?: string; exam_year?: number; exam_period?: string; exam_type?: string; exam_scope?: string | null };
}

interface SelfCheckTarget {
  row: ExamReviewRow;
  review: ReviewData;
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간고사',
  final: '기말고사',
  performance: '수행평가',
  other: '기타',
};

const RESULT_LABELS: Record<Exclude<ItemResult, null>, string> = {
  correct: 'O',
  wrong: 'X',
  partial: '△',
};

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function ExamReportOverview({
  schoolReport, reviews, onOpenSelfCheck,
}: {
  schoolReport: SchoolExamReport | null;
  reviews: ExamReviewRow[];
  onOpenSelfCheck: (target: SelfCheckTarget) => void;
}) {
  const recommended = toStringList(schoolReport?.recommended_study);
  const weakConcepts = toStringList(schoolReport?.top_weak_concepts);
  const topWrongRate = schoolReport?.wrong_item_stats?.[0]?.wrong_rate ?? 0;

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <School className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">종합 리포트</h2>
        </div>
        {schoolReport ? (
          <div className="rounded-2xl bg-gradient-to-br from-primary to-info p-5 text-primary-foreground shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs text-primary-foreground/70">
                  {schoolReport.school_name} · {schoolReport.exam_year}년 {schoolReport.exam_period} {schoolReport.exam_type}
                </p>
                <h3 className="text-xl font-bold">📊 시험 종합 리포트</h3>
              </div>
              <span className="rounded-full bg-success/25 px-3 py-1 text-[11px] font-medium text-success-foreground">더멘토학원 분석</span>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2">
              <MetricCard value={`${schoolReport.total_students ?? 0}명`} label="더멘토 수강생" tone="success" />
              <MetricCard value={`${schoolReport.academy_helped_rate ?? 0}%`} label="학원 수업 도움됨" tone="warning" />
              <MetricCard value={`${topWrongRate}%`} label="최고 오답률 문항" tone="destructive" />
            </div>

            <div className="mb-3 rounded-xl bg-primary-foreground/10 p-4">
              <p className="mb-2 text-xs font-semibold text-primary-foreground/75">📝 시험 총평</p>
              <p className="whitespace-pre-wrap text-sm leading-7 text-primary-foreground/90">{schoolReport.final_report || '등록된 시험 총평이 없습니다.'}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InsightBox title="✅ 학원이 도움준 것" items={weakConcepts.length ? weakConcepts : ['핵심 개념 정리 및 문제풀이 전략']} tone="success" />
              <InsightBox title="🎯 앞으로 집중할 것" items={recommended.length ? recommended : ['취약 단원 반복 학습 필요']} tone="warning" />
            </div>
          </div>
        ) : (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">공개된 학교별 종합 리포트가 없습니다.</CardContent></Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">개인 리포트</h2>
        {reviews.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">아직 리뷰가 없습니다.</CardContent></Card>
        ) : (
          reviews.map((row) => <PersonalReportCard key={row.id} row={row} onOpenSelfCheck={onOpenSelfCheck} />)
        )}
      </section>
    </div>
  );
}

function DeepExamReportSection({ reports }: { reports: DeepExamReport[] }) {
  if (reports.length === 0) return null;
  return <section className="space-y-3"><h2 className="text-base font-bold text-foreground">시험지 분석 & 점수대별 학습 추천</h2>{reports.map((report) => { const meta = report.exam_analysis_reports; return <Card key={report.id} className="rounded-2xl border-primary/20"><CardContent className="space-y-4 p-5"><div><Badge variant="outline">{meta?.subject || '내신'}</Badge><h3 className="mt-2 text-lg font-bold text-foreground">{meta?.school_name} {meta?.exam_year}년 {meta?.exam_period} {meta?.exam_type}</h3>{meta?.exam_scope ? <p className="mt-1 text-xs text-muted-foreground">범위: {meta.exam_scope}</p> : null}</div><p className="whitespace-pre-wrap rounded-xl bg-primary/10 p-3 text-sm leading-7 text-foreground">{report.overall_insights}</p>{report.my_recommendation ? <div className="rounded-xl bg-success/10 p-3"><p className="text-sm font-semibold text-success">내 점수대 추천</p><p className="mt-1 text-xs leading-5 text-foreground">{report.my_recommendation.summary}</p>{report.my_recommendation.recommended_actions?.length ? <p className="mt-2 text-xs text-primary">{report.my_recommendation.recommended_actions.join(' · ')}</p> : null}</div> : null}<div className="space-y-2"><p className="text-sm font-semibold text-foreground">학생들이 어려웠을 부분</p>{report.difficult_points.slice(0, 3).map((item, index) => <div key={index} className="rounded-xl bg-warning/10 p-3"><p className="text-sm font-semibold text-warning">{item.title}</p><p className="mt-1 text-xs leading-5 text-foreground">{item.reason}</p>{item.study_tip ? <p className="mt-2 text-xs text-primary">추천: {item.study_tip}</p> : null}</div>)}</div><div className="space-y-2"><p className="text-sm font-semibold text-foreground">점수대별 학습 방향</p>{report.score_band_recommendations.map((band, index) => <div key={index} className="rounded-xl border bg-card p-3"><p className="text-sm font-bold text-primary">{band.band}</p><p className="mt-1 text-xs text-muted-foreground">{band.diagnosis}</p><p className="mt-1 text-xs text-foreground">{band.priority}</p></div>)}</div></CardContent></Card>; })}</section>;
}

function MetricCard({ value, label, tone }: { value: string; label: string; tone: 'success' | 'warning' | 'destructive' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-destructive';
  return <div className="rounded-xl bg-primary-foreground/10 p-3 text-center"><p className={`text-2xl font-bold ${toneClass}`}>{value}</p><p className="text-[11px] text-primary-foreground/65">{label}</p></div>;
}

function InsightBox({ title, items, tone }: { title: string; items: string[]; tone: 'success' | 'warning' }) {
  const className = tone === 'success' ? 'border-success/40 bg-success/20 text-success' : 'border-warning/40 bg-warning/20 text-warning';
  return <div className={`rounded-xl border p-3 ${className}`}><p className="mb-2 text-xs font-semibold">{title}</p><ul className="m-0 list-disc space-y-1 pl-4 text-xs text-primary-foreground/85">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
}

function PersonalReportCard({ row, onOpenSelfCheck }: { row: ExamReviewRow; onOpenSelfCheck: (target: SelfCheckTarget) => void }) {
  const review = row.exam_reviews[0];
  const items = review?.exam_item_reviews || [];
  const teacherDone = row.review_status === 'done' && !!review?.reviewed_at;
  const isPublished = !!review?.is_published;
  const selfChecks = review?.self_checks || [];
  const correct = items.filter((item) => item.result === 'correct').length;
  const wrong = items.filter((item) => item.result === 'wrong').length;
  const helped = selfChecks.filter((check) => check.q_academy_helped).length;
  const helpedRate = selfChecks.length > 0 ? `${Math.round((helped / selfChecks.length) * 100)}%` : '-';
  const needMore = selfChecks.filter((check) => check.q_need_more).slice(0, 2);

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="success">{row.subject}</Badge>
            <span className="text-sm text-muted-foreground">{row.exam_year ?? '-'}년 {row.exam_period ?? '-'} {EXAM_TYPE_LABELS[row.exam_type] ?? row.exam_type}</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">{isPublished ? (review?.earned_score ?? row.actual_score ?? '-') : '-'}점</p>
            <p className="text-[11px] text-muted-foreground">/ {isPublished ? (review?.total_score ?? '-') : '-'}점 만점</p>
          </div>
        </div>
        <div className="mb-4 flex items-center justify-end gap-2">
          {teacherDone ? (
            <>
              {!review?.self_check_completed ? (
                <button type="button" onClick={() => review && onOpenSelfCheck({ row, review })} className="rounded-full border-0 bg-success/15 px-3 py-1 text-xs font-medium text-success">자가진단 하기 (+15P) 🎯</button>
              ) : (
                <span className="text-xs text-primary">✦ 자가진단 완료</span>
              )}
              {isPublished
                ? <span className="text-xs font-medium text-success">✓ 리뷰 공개됨</span>
                : <span className="text-xs font-medium text-warning">⏳ 원장 검토중</span>}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">리뷰 준비중</span>
          )}
        </div>
        {isPublished ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <MiniStat value={String(correct)} label="맞음" variant="success" />
              <MiniStat value={String(wrong)} label="틀림" variant="destructive" />
              <MiniStat value={helpedRate} label="학원도움" variant="primary" />
            </div>
            {review?.overall_comment ? <div className="mb-3 rounded-xl border border-success/20 bg-success/10 p-3"><p className="mb-1 text-xs font-semibold text-success">선생님 코멘트</p><p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{review.overall_comment}</p></div> : null}
            {selfChecks.length > 0 ? <div className="grid gap-2 md:grid-cols-2"><div className="rounded-xl bg-success/10 p-3"><p className="mb-2 text-xs font-semibold text-success">✅ 학원이 도움준 부분</p>{selfChecks.filter((check) => check.q_academy_helped).slice(0, 3).map((check) => <p key={check.item_number} className="text-xs text-success">· {check.item_number}번 문항 관련 학습</p>) || null}{helped === 0 ? <p className="text-xs text-muted-foreground">자가진단 완료 후 표시됩니다</p> : null}</div><div className="rounded-xl bg-warning/10 p-3"><p className="mb-2 text-xs font-semibold text-warning">🎯 앞으로 집중할 부분</p>{needMore.map((check) => <p key={check.item_number} className="text-xs text-warning">· {check.q_need_more}</p>)}{needMore.length === 0 ? <p className="text-xs text-muted-foreground">자가진단 완료 후 표시됩니다</p> : null}</div></div> : null}
          </>
        ) : (
          <div className="rounded-xl bg-warning/10 p-4 text-center">
            <p className="text-sm font-semibold text-warning">⏳ 원장 선생님 검토 후 공개됩니다</p>
            <p className="mt-1 text-xs text-muted-foreground">자가진단을 먼저 완료하면 더 정확한 리뷰를 받을 수 있어요</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ value, label, variant }: { value: string; label: string; variant: 'success' | 'destructive' | 'primary' }) {
  const className = variant === 'success' ? 'bg-success/10 text-success' : variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary';
  return <div className={`rounded-lg p-3 text-center ${className}`}><p className="text-lg font-bold">{value}</p><p className="text-[11px]">{label}</p></div>;
}

export default function StudentExamReview() {
  const { student } = useStudentAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ExamReviewRow[]>([]);
  const [schoolReport, setSchoolReport] = useState<SchoolExamReport | null>(null);
  const [deepReports, setDeepReports] = useState<DeepExamReport[]>([]);
  const [publishedReports, setPublishedReports] = useState<PublishedReportLite[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selected, setSelected] = useState<ExamReviewRow | null>(null);
  const [selfCheckTarget, setSelfCheckTarget] = useState<SelfCheckTarget | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'teacher' | 'self'>('teacher');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await studentApi.getExamReviews(selectedYear);
    setRows((data?.reviews || []) as ExamReviewRow[]);
    setSchoolReport((data?.school_report || null) as SchoolExamReport | null);
    setDeepReports((data?.deep_reports || []) as DeepExamReport[]);
    setPublishedReports(((data as any)?.published_analysis_reports || []) as PublishedReportLite[]);
    setAvailableYears((data?.available_years || []) as number[]);
    setSelectedYear((data?.selected_exam_year ?? null) as number | null);
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => { void load(); }, [load]);

  const openSelfCheck = useCallback((target: SelfCheckTarget) => {
    setSelected(null);
    setSelfCheckTarget(target);
  }, []);


  const selectedReview = selected?.exam_reviews?.[0] ?? null;

  const summary = useMemo(() => {
    const items = selectedReview?.exam_item_reviews || [];
    const wrongNumbers = items.filter((item) => item.result === 'wrong' || item.result === 'partial').map((item) => item.item_number);
    const errorTypes = [...new Set(items.flatMap((item) => item.error_types))];
    return { wrongNumbers, errorTypes };
  }, [selectedReview]);

  const completedReviews = useMemo(() => rows.filter((row) => row.exam_reviews?.[0]?.reviewed_at), [rows]);
  const hasSubmittedExamPhotos = rows.length > 0;

  return (
    <div className="space-y-4 pb-20">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          내신 시험지 리뷰
        </h1>
        <StudentStudyTabs />
      </div>

      {!loading && availableYears.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">조회 연도</p>
            <p className="text-xs text-muted-foreground">시험 본 연도 기준으로 표시됩니다.</p>
          </div>
          <Select value={selectedYear ? String(selectedYear) : undefined} onValueChange={(value) => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="연도 선택" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => <SelectItem key={year} value={String(year)}>{year}년</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {!loading && publishedReports.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-pink-500" />
            <h2 className="text-base font-bold text-foreground">새로 도착한 시험 분석</h2>
            <Badge variant="outline" className="text-[10px]">{publishedReports.length}건</Badge>
          </div>
          <div className="space-y-3">
            {publishedReports.map((report) => (
              <PublishedReportCard
                key={report.id}
                report={report}
                audience="student"
                studentId={student?.id ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && hasSubmittedExamPhotos ? <ExamReportOverview schoolReport={schoolReport} reviews={completedReviews} onOpenSelfCheck={openSelfCheck} /> : null}
      {!loading && hasSubmittedExamPhotos ? <DeepExamReportSection reports={deepReports} /> : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">등록된 시험지가 없습니다.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const done = (row.review_status ?? 'pending') === 'done';
            return (
              <button
                key={row.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (done) {
                    setActiveTab('teacher');
                    setSelected(row);
                  }
                }}
                className="w-full text-left"
              >
                <Card className={done ? 'border-success/30' : 'border-border'}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-foreground">{row.subject} · {EXAM_TYPE_LABELS[row.exam_type] ?? row.exam_type}</p>
                          {done ? <span className="h-2 w-2 rounded-full bg-destructive" /> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.exam_date ?? row.submitted_at.slice(0, 10)} · {row.exam_year ?? '-'} / {row.exam_period ?? '-'}
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          점수 {row.actual_score ?? row.expected_score ?? '-'}
                        </p>
                      </div>
                      <Badge variant={done ? 'success' : 'muted'}>
                        {done ? '리뷰 완료!' : '리뷰 준비중'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.subject} 리뷰</DialogTitle>
          </DialogHeader>

          {selected ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'teacher' | 'self')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="teacher">선생님 채점 결과</TabsTrigger>
                <TabsTrigger value="self">
                  내 자가진단 {selectedReview?.self_check_completed ? '✓' : ''}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="teacher" className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  {(selected.student_exam_result_photos || []).map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (photo.signed_url) setSelectedImage(photo.signed_url);
                      }}
                      className="overflow-hidden rounded-md border bg-muted/20"
                    >
                      {photo.signed_url ? (
                        <img src={photo.signed_url} alt={`시험지 ${photo.sort_order + 1}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground">문항별 결과</h3>
                  <div className="flex flex-wrap gap-2">
                    {(selectedReview?.exam_item_reviews || []).map((item) => (
                      <div key={item.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.item_number}번</span>
                          <Badge variant={item.result === 'correct' ? 'success' : item.result === 'partial' ? 'warning' : 'destructive'}>
                            {item.result ? RESULT_LABELS[item.result] : '-'}
                          </Badge>
                        </div>
                        {item.error_types.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.error_types.map((errorType) => <Badge key={errorType} variant="outline">{errorType}</Badge>)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-4">
                  <h3 className="font-semibold text-foreground">전체 선생님 코멘트</h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selectedReview?.overall_comment || '등록된 코멘트가 없습니다.'}</p>
                </div>

                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> 오답 분석 요약
                  </div>
                  <p className="text-foreground">틀린 문항: {summary.wrongNumbers.length > 0 ? summary.wrongNumbers.map((n) => `${n}번`).join(', ') : '없음'}</p>
                  <p className="text-foreground">주요 오답유형: {summary.errorTypes.length > 0 ? summary.errorTypes.join(', ') : '없음'}</p>
                </div>
              </TabsContent>

              <TabsContent value="self">
                {selectedReview ? (
                  <SelfCheckTab
                    reviewId={selectedReview.id}
                    items={selectedReview.exam_item_reviews || []}
                    selfChecks={selectedReview.self_checks || []}
                    templateErrorTypes={selectedReview.template?.error_types || []}
                    templateItems={selectedReview.template?.items || []}
                    photos={selected.student_exam_result_photos || []}
                    selfCheckCompleted={!!selectedReview.self_check_completed}
                    onCompleted={() => void load()}
                  />
                ) : null}
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {selfCheckTarget ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-foreground/50 px-4 py-5">
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-background shadow-xl">
            <div className="bg-gradient-to-br from-primary to-info px-6 py-5 text-primary-foreground">
              <h2 className="mb-1 text-lg font-bold">내 시험 돌아보기 🔍</h2>
              <p className="text-sm text-primary-foreground/75">틀린 문항을 하나씩 분석해보세요. 완료하면 +15P 지급돼요!</p>
            </div>
            <div className="p-5">
              <SelfCheckTab
                reviewId={selfCheckTarget.review.id}
                items={selfCheckTarget.review.exam_item_reviews || []}
                selfChecks={selfCheckTarget.review.self_checks || []}
                templateErrorTypes={selfCheckTarget.review.template?.error_types || []}
                templateItems={selfCheckTarget.review.template?.items || []}
                photos={selfCheckTarget.row.student_exam_result_photos || []}
                selfCheckCompleted={!!selfCheckTarget.review.self_check_completed}
                onCompleted={() => {
                  setSelfCheckTarget(null);
                  void load();
                }}
              />
              <button type="button" onClick={() => setSelfCheckTarget(null)} className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-muted-foreground">나중에 하기</button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>시험지 원본</DialogTitle>
          </DialogHeader>
          {selectedImage ? <img src={selectedImage} alt="시험지 원본" className="max-h-[80vh] w-full rounded-md object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}