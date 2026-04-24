import { useCallback, useEffect, useMemo, useState } from 'react';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StudentStudyTabs } from '@/components/student/StudentStudyTabs';
import { SelfCheckTab } from '@/components/student/exam-review/SelfCheckTab';
import { CheckCircle2, ClipboardCheck, Image as ImageIcon } from 'lucide-react';

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
  item_number: number;
  q_remembered: boolean | null;
  q_concept_confused: boolean | null;
  q_academy_helped: boolean | null;
  q_need_more: string | null;
  self_error_types: string[];
}

interface ReviewData {
  id: string;
  overall_comment: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  exam_item_reviews: ReviewItem[];
  self_check_completed?: boolean;
  self_checks?: SelfCheckRow[];
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

export default function StudentExamReview() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ExamReviewRow[]>([]);
  const [selected, setSelected] = useState<ExamReviewRow | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'teacher' | 'self'>('teacher');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await studentApi.getExamReviews();
    setRows((data?.reviews || []) as ExamReviewRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);


  const selectedReview = selected?.exam_reviews?.[0] ?? null;

  const summary = useMemo(() => {
    const items = selectedReview?.exam_item_reviews || [];
    const wrongNumbers = items.filter((item) => item.result === 'wrong' || item.result === 'partial').map((item) => item.item_number);
    const errorTypes = [...new Set(items.flatMap((item) => item.error_types))];
    return { wrongNumbers, errorTypes };
  }, [selectedReview]);

  return (
    <div className="space-y-4 pb-20">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          내신 시험지 리뷰
        </h1>
        <StudentStudyTabs />
      </div>

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