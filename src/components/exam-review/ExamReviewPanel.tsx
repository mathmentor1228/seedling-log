import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FileSearch } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

type ReviewStatus = 'pending' | 'in_review' | 'done';
type ItemResult = 'correct' | 'wrong' | 'partial' | '';

interface PhotoRow {
  id: string;
  storage_path: string;
  sort_order: number;
}

interface ReviewSummary {
  id: string;
  overall_comment: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

interface ExamResultRow {
  id: string;
  student_id: string;
  subject: string;
  exam_year: number | null;
  exam_period: string | null;
  exam_type: string;
  actual_score: number | null;
  expected_score: number | null;
  review_status: string | null;
  submitted_at: string;
  school_name: string;
  exam_date: string | null;
  students: { name: string; grade: string | null } | null;
  student_exam_result_photos: PhotoRow[] | null;
  exam_reviews: ReviewSummary[] | null;
}

interface ItemReviewDraft {
  id?: string;
  item_number: number;
  result: ItemResult;
  error_types: string[];
  item_comment: string;
}

interface ReviewStats {
  correct: number;
  wrong: number;
  partial: number;
  topError: { label: string; count: number } | null;
}

const STATUS_OPTIONS: Array<{ value: 'all' | ReviewStatus; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'in_review', label: '리뷰중' },
  { value: 'done', label: '완료' },
];

const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: 'bg-warning/15 text-warning border-warning/30',
  in_review: 'bg-primary/15 text-primary border-primary/30',
  done: 'bg-success/15 text-success border-success/30',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: '대기중',
  in_review: '리뷰중',
  done: '완료',
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간',
  final: '기말',
  performance: '수행',
  other: '기타',
};

const RESULT_BUTTONS: Array<{ value: Exclude<ItemResult, ''>; label: string; className: string }> = [
  { value: 'correct', label: 'O', className: 'border-success/40 bg-success/10 text-success hover:bg-success/15' },
  { value: 'wrong', label: 'X', className: 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15' },
  { value: 'partial', label: '△', className: 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15' },
];

const ERROR_TYPES = ['개념이해 부족', '계산실수', '문제이해 오류', '시간부족', '풀이누락', '유형파악 못함'] as const;

function createItemDrafts(count: number, source: ItemReviewDraft[] = []): ItemReviewDraft[] {
  return Array.from({ length: count }, (_, index) => {
    const itemNumber = index + 1;
    const existing = source.find((item) => item.item_number === itemNumber);
    return existing ?? { item_number: itemNumber, result: '', error_types: [], item_comment: '' };
  });
}

function calculateReviewStats(items: ItemReviewDraft[]): ReviewStats | null {
  const reviewedItems = items.filter((item) => item.result !== '');
  if (reviewedItems.length === 0) return null;

  const errorCounter = new Map<string, number>();
  reviewedItems.forEach((item) => {
    item.error_types.forEach((errorType) => {
      errorCounter.set(errorType, (errorCounter.get(errorType) ?? 0) + 1);
    });
  });

  const topErrorEntry = [...errorCounter.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    correct: reviewedItems.filter((item) => item.result === 'correct').length,
    wrong: reviewedItems.filter((item) => item.result === 'wrong').length,
    partial: reviewedItems.filter((item) => item.result === 'partial').length,
    topError: topErrorEntry ? { label: topErrorEntry[0], count: topErrorEntry[1] } : null,
  };
}

function getPublicPhotoUrl(path: string) {
  return supabase.storage.from('exam-results').getPublicUrl(path).data.publicUrl;
}

export default function ExamReviewPage() {
  const { toast } = useToast();
  const { user, fullName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [rows, setRows] = useState<ExamResultRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [overallComment, setOverallComment] = useState('');
  const [itemCount, setItemCount] = useState(20);
  const [itemReviews, setItemReviews] = useState<ItemReviewDraft[]>([]);

  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_exam_results')
        .select(`
          id,
          student_id,
          subject,
          exam_year,
          exam_period,
          exam_type,
          actual_score,
          expected_score,
          review_status,
          submitted_at,
          school_name,
          exam_date,
          students(name, grade),
          student_exam_result_photos(id, storage_path, sort_order),
          exam_reviews(id, overall_comment, reviewed_at, reviewed_by_name)
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as unknown as ExamResultRow[]);
    } catch (error: any) {
      toast({ title: '목록 조회 실패', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const subjectOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.subject))).sort(),
    [rows],
  );

  const gradeOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.students?.grade).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (subjectFilter !== 'all' && row.subject !== subjectFilter) return false;
      if (gradeFilter !== 'all' && row.students?.grade !== gradeFilter) return false;
      if (statusFilter !== 'all' && (row.review_status ?? 'pending') !== statusFilter) return false;
      return true;
    });
  }, [gradeFilter, rows, statusFilter, subjectFilter]);

  const reviewStats = useMemo(() => calculateReviewStats(itemReviews), [itemReviews]);

  const loadReviewDetail = useCallback(async (resultId: string) => {
    try {
      const { data: reviews, error: reviewError } = await supabase
        .from('exam_reviews')
        .select('id, overall_comment, reviewed_at, reviewed_by_name, created_at')
        .eq('result_id', resultId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (reviewError) throw reviewError;

      const currentReview = reviews?.[0] ?? null;
      setReviewId(currentReview?.id ?? null);
      setOverallComment(currentReview?.overall_comment ?? '');

      if (!currentReview) {
        setItemCount(20);
        setItemReviews(createItemDrafts(20));
        return;
      }

      const { data: items, error: itemError } = await supabase
        .from('exam_item_reviews')
        .select('id, item_number, result, error_types, item_comment')
        .eq('review_id', currentReview.id)
        .order('item_number', { ascending: true });

      if (itemError) throw itemError;

      const drafts = (items ?? []).map((item) => ({
        id: item.id,
        item_number: item.item_number,
        result: (item.result ?? '') as ItemResult,
        error_types: Array.isArray(item.error_types) ? item.error_types.filter((value): value is string => typeof value === 'string') : [],
        item_comment: item.item_comment ?? '',
      }));
      const nextCount = Math.max(20, drafts.length || 0);
      setItemCount(nextCount);
      setItemReviews(createItemDrafts(nextCount, drafts));
    } catch (error: any) {
      toast({ title: '리뷰 조회 실패', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  const markInReview = useCallback(async (resultId: string) => {
    const row = rows.find((item) => item.id === resultId);
    if (!row || (row.review_status ?? 'pending') !== 'pending') return;

    const { error } = await supabase
      .from('student_exam_results')
      .update({ review_status: 'in_review' })
      .eq('id', resultId)
      .eq('review_status', 'pending');

    if (!error) {
      setRows((prev) => prev.map((item) => item.id === resultId ? { ...item, review_status: 'in_review' } : item));
    }
  }, [rows]);

  useEffect(() => {
    if (!selectedId) {
      setReviewId(null);
      setOverallComment('');
      setItemCount(20);
      setItemReviews([]);
      return;
    }

    void markInReview(selectedId);
    void loadReviewDetail(selectedId);
  }, [loadReviewDetail, markInReview, selectedId]);

  const handleSelectResult = (resultId: string) => {
    setSelectedId(resultId);
  };

  const handleItemCountChange = (value: number) => {
    const safeCount = Math.max(1, Number.isFinite(value) ? value : 20);
    setItemCount(safeCount);
    setItemReviews((prev) => createItemDrafts(safeCount, prev));
  };

  const handleChangeItem = <K extends keyof ItemReviewDraft>(index: number, key: K, value: ItemReviewDraft[K]) => {
    setItemReviews((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const handleToggleErrorType = (index: number, errorType: string, checked: boolean) => {
    setItemReviews((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const nextErrorTypes = checked
        ? Array.from(new Set([...item.error_types, errorType]))
        : item.error_types.filter((value) => value !== errorType);
      return { ...item, error_types: nextErrorTypes };
    }));
  };

  const persistReview = useCallback(async (markDone: boolean) => {
    if (!selectedRow || !user) return false;

    const nowIso = new Date().toISOString();
    const reviewerName = fullName || user.email || '교직원';
    const normalizedItems = itemReviews
      .filter((item) => item.item_number > 0 && item.result !== '');

    const reviewPayload = {
      result_id: selectedRow.id,
      reviewed_by: user.id,
      reviewed_by_name: reviewerName,
      overall_comment: overallComment.trim() || null,
      updated_at: nowIso,
      ...(markDone ? { reviewed_at: nowIso } : {}),
    };

    setSaving(true);
    if (markDone) setCompleting(true);

    try {
      let currentReviewId = reviewId;

      if (currentReviewId) {
        const { error } = await supabase
          .from('exam_reviews')
          .update(reviewPayload)
          .eq('id', currentReviewId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('exam_reviews')
          .insert({ ...reviewPayload, reviewed_at: markDone ? nowIso : null })
          .select('id')
          .single();
        if (error) throw error;
        currentReviewId = data.id;
        setReviewId(currentReviewId);
      }

      const { error: deleteError } = await supabase
        .from('exam_item_reviews')
        .delete()
        .eq('review_id', currentReviewId);
      if (deleteError) throw deleteError;

      if (normalizedItems.length > 0) {
        const insertPayload = normalizedItems.map((item) => ({
          review_id: currentReviewId,
          item_number: item.item_number,
          result: item.result || null,
          error_types: item.error_types as Json,
          item_comment: item.item_comment.trim() || null,
        }));
        const { error: insertError } = await supabase.from('exam_item_reviews').insert(insertPayload);
        if (insertError) throw insertError;
      }

      if (markDone) {
        const { error: resultError } = await supabase
          .from('student_exam_results')
          .update({ review_status: 'done' })
          .eq('id', selectedRow.id);
        if (resultError) throw resultError;
      }

      await loadResults();
      await loadReviewDetail(selectedRow.id);
      toast({ title: markDone ? '리뷰 완료 처리되었습니다' : '리뷰가 저장되었습니다' });
      return true;
    } catch (error: any) {
      toast({ title: markDone ? '리뷰 완료 실패' : '리뷰 저장 실패', description: error.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
      setCompleting(false);
    }
  }, [fullName, itemReviews, loadResults, loadReviewDetail, overallComment, reviewId, selectedRow, toast, user]);

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AppLayout>
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">내신 시험지 리뷰</h1>
            <p className="text-sm text-muted-foreground">업로드된 시험지를 확인하고 문항별 리뷰를 남길 수 있습니다.</p>
          </div>

          <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-4 lg:flex-row">
            <Card className="w-full lg:w-80 lg:min-w-80 lg:max-w-80">
              <CardHeader className="space-y-3 pb-4">
                <CardTitle className="text-base">업로드 목록</CardTitle>
                <div className="grid gap-2">
                  <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="과목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 과목</SelectItem>
                      {subjectOptions.map((subject) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={gradeFilter} onValueChange={setGradeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="학년 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 학년</SelectItem>
                      {gradeOptions.map((grade) => (
                        <SelectItem key={grade} value={grade}>{grade}학년</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | ReviewStatus)}>
                    <TabsList className="grid w-full grid-cols-4">
                      {STATUS_OPTIONS.map((option) => (
                        <TabsTrigger key={option.value} value={option.value} className="text-xs">
                          {option.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-20rem)] lg:h-[calc(100vh-16rem)]">
                  <div className="space-y-2 p-3">
                    {loading ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : filteredRows.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        조건에 맞는 시험지가 없습니다.
                      </div>
                    ) : (
                      filteredRows.map((row) => {
                        const status = (row.review_status ?? 'pending') as ReviewStatus;
                        const latestReview = row.exam_reviews?.[0] ?? null;
                        const displayScore = row.actual_score ?? row.expected_score;
                        const photoCount = row.student_exam_result_photos?.length ?? 0;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => handleSelectResult(row.id)}
                            className={`w-full rounded-md border p-3 text-left transition-colors ${selectedId === row.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-foreground">{row.students?.name ?? '이름 없음'}</p>
                                <p className="text-sm text-muted-foreground">{row.subject} · {row.students?.grade ? `${row.students.grade}학년` : '학년 미등록'}</p>
                              </div>
                              <Badge className={`border ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</Badge>
                            </div>

                            <div className="mt-2 text-xs text-muted-foreground">
                              {row.exam_year ?? '-'} / {row.exam_period ?? '-'} / {EXAM_TYPE_LABELS[row.exam_type] ?? row.exam_type}
                            </div>
                            <div className="mt-1 text-sm text-foreground">
                              {displayScore != null ? `${row.actual_score != null ? '실제' : '예상'} ${displayScore}점` : '점수 미입력'}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              사진 {photoCount}장{latestReview?.reviewed_by_name ? ` · ${latestReview.reviewed_by_name}` : ''}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardContent className="h-full p-0">
                {!selectedRow ? (
                  <div className="flex h-full min-h-[32rem] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                    <FileSearch className="h-10 w-10 opacity-40" />
                    <p>좌측에서 시험지를 선택해주세요</p>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[32rem] flex-col">
                    <div className="border-b p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h2 className="text-xl font-semibold text-foreground">
                            {selectedRow.students?.name ?? '이름 없음'} · {selectedRow.subject}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {selectedRow.school_name} · {selectedRow.students?.grade ? `${selectedRow.students.grade}학년` : '학년 미등록'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {selectedRow.exam_year ?? '-'}년 / {selectedRow.exam_period ?? '-'} / {EXAM_TYPE_LABELS[selectedRow.exam_type] ?? selectedRow.exam_type}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">점수</p>
                          <p className="text-lg font-semibold text-foreground">
                            {selectedRow.actual_score != null
                              ? `실제 ${selectedRow.actual_score}점`
                              : selectedRow.expected_score != null
                                ? `예상 ${selectedRow.expected_score}점`
                                : '미입력'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="space-y-6 p-6">
                        <section className="space-y-3">
                          <div>
                            <h3 className="font-semibold text-foreground">시험지 사진</h3>
                            <p className="text-sm text-muted-foreground">썸네일을 클릭하면 원본을 크게 볼 수 있습니다.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                            {(selectedRow.student_exam_result_photos ?? [])
                              .slice()
                              .sort((a, b) => a.sort_order - b.sort_order)
                              .map((photo) => {
                                const publicUrl = getPublicPhotoUrl(photo.storage_path);
                                return (
                                  <button
                                    key={photo.id}
                                    type="button"
                                    onClick={() => setSelectedImage(publicUrl)}
                                    className="overflow-hidden rounded-md border bg-muted/30 text-left transition hover:border-primary"
                                  >
                                    <img src={publicUrl} alt={`시험지 ${photo.sort_order + 1}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                                    <div className="px-3 py-2 text-xs text-muted-foreground">{photo.sort_order + 1}번째 사진</div>
                                  </button>
                                );
                              })}
                          </div>
                        </section>

                        <section className="space-y-4">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="font-semibold text-foreground">문항별 채점</h3>
                              <p className="text-sm text-muted-foreground">총 문항 수를 입력하면 카드가 자동 생성됩니다.</p>
                            </div>
                            <div className="w-full max-w-40 space-y-2">
                              <Label htmlFor="item-count">총 문항 수</Label>
                              <Input
                                id="item-count"
                                type="number"
                                min={1}
                                value={itemCount}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => handleItemCountChange(Number(event.target.value) || 1)}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {itemReviews.map((item, index) => {
                              const showErrors = item.result === 'wrong' || item.result === 'partial';
                              return (
                                <div
                                  key={item.id ?? `${item.item_number}-${index}`}
                                  className="w-full rounded-md border border-border bg-card p-4 md:w-[calc(50%-0.375rem)] xl:w-[calc(33.333%-0.5rem)]"
                                >
                                  <div className="mb-3 flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-foreground">{item.item_number}번</p>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2">
                                    {RESULT_BUTTONS.map((option) => {
                                      const active = item.result === option.value;
                                      return (
                                        <Button
                                          key={option.value}
                                          type="button"
                                          variant="outline"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleChangeItem(index, 'result', item.result === option.value ? '' : option.value);
                                            if (item.result !== option.value && option.value === 'correct') {
                                              handleChangeItem(index, 'error_types', []);
                                            }
                                          }}
                                          className={active ? option.className : 'border-border bg-background text-muted-foreground'}
                                        >
                                          {option.label}
                                        </Button>
                                      );
                                    })}
                                  </div>

                                  {showErrors ? (
                                    <div className="mt-4 space-y-3">
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">오답 유형</p>
                                        <div className="grid gap-2">
                                          {ERROR_TYPES.map((errorType) => (
                                            <label key={errorType} className="flex items-center gap-2 text-sm text-foreground">
                                              <Checkbox
                                                checked={item.error_types.includes(errorType)}
                                                onCheckedChange={(checked) => {
                                                  handleToggleErrorType(index, errorType, checked === true);
                                                }}
                                                onClick={(event) => event.stopPropagation()}
                                              />
                                              <span>{errorType}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <Label htmlFor={`item-comment-${item.item_number}`}>코멘트</Label>
                                        <Input
                                          id={`item-comment-${item.item_number}`}
                                          value={item.item_comment}
                                          onClick={(event) => event.stopPropagation()}
                                          onChange={(event) => handleChangeItem(index, 'item_comment', event.target.value)}
                                          placeholder="문항 코멘트 입력"
                                        />
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>

                          {reviewStats ? (
                            <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-foreground">
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span>맞음 {reviewStats.correct}개</span>
                                <span>틀림 {reviewStats.wrong}개</span>
                                <span>부분 {reviewStats.partial}개</span>
                              </div>
                              <p className="mt-2 text-muted-foreground">
                                가장 많은 오답유형: {reviewStats.topError ? `${reviewStats.topError.label} (${reviewStats.topError.count}회)` : '없음'}
                              </p>
                            </div>
                          ) : null}
                        </section>

                        <section className="space-y-3">
                          <div>
                            <Label htmlFor="overall-comment" className="font-semibold text-foreground">전체 코멘트</Label>
                            <p className="text-sm text-muted-foreground">학생에게 전달할 전체 리뷰를 작성하세요.</p>
                          </div>
                          <Textarea
                            id="overall-comment"
                            value={overallComment}
                            onChange={(event) => setOverallComment(event.target.value)}
                            placeholder="전체 총평을 입력하세요"
                            className="min-h-32"
                          />
                        </section>
                      </div>
                    </ScrollArea>

                    <div className="flex flex-col gap-2 border-t p-4 sm:flex-row sm:justify-end">
                      <Button onClick={() => void persistReview(false)} disabled={saving} variant="outline">
                        {saving && !completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        리뷰 저장
                      </Button>
                      <Button onClick={() => void persistReview(true)} disabled={saving}>
                        {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        리뷰 완료
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>시험지 원본 보기</DialogTitle>
            </DialogHeader>
            {selectedImage ? (
              <img src={selectedImage} alt="시험지 원본" className="max-h-[80vh] w-full rounded-md object-contain" />
            ) : null}
          </DialogContent>
        </Dialog>
      </AppLayout>
    </ProtectedRoute>
  );
}