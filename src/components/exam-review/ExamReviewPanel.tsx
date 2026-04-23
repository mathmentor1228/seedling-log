import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PhotoThumb } from '@/components/exam-review/PhotoThumb';

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

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: '대기중',
  in_review: '리뷰중',
  done: '완료',
};

const STATUS_STYLE: Record<ReviewStatus, { card: React.CSSProperties; badge: React.CSSProperties }> = {
  pending: {
    card: {
      borderWidth: '2px',
      borderColor: 'hsl(var(--review-pending-border))',
      backgroundColor: 'hsl(var(--review-pending-surface))',
    },
    badge: {
      backgroundColor: 'hsl(var(--review-pending-badge))',
      color: 'hsl(var(--review-pending-badge-foreground))',
    },
  },
  in_review: {
    card: {
      borderWidth: '2px',
      borderColor: 'hsl(var(--review-progress-border))',
      backgroundColor: 'hsl(var(--review-progress-surface))',
    },
    badge: {
      backgroundColor: 'hsl(var(--review-progress-badge))',
      color: 'hsl(var(--review-progress-badge-foreground))',
    },
  },
  done: {
    card: {
      borderWidth: '1px',
      borderColor: 'hsl(var(--review-done-border))',
      backgroundColor: 'hsl(var(--review-done-surface))',
      opacity: 0.75,
    },
    badge: {
      backgroundColor: 'hsl(var(--review-done-badge))',
      color: 'hsl(var(--review-done-badge-foreground))',
    },
  },
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간고사',
  final: '기말고사',
  performance: '수행평가',
  other: '기타',
};

const RESULT_BUTTON_STYLES: Record<Exclude<ItemResult, ''>, { active: React.CSSProperties; idle: React.CSSProperties }> = {
  correct: {
    active: {
      backgroundColor: 'hsl(var(--review-correct-surface))',
      border: '2px solid hsl(var(--review-correct-border))',
      color: 'hsl(var(--review-correct-foreground))',
    },
    idle: {
      backgroundColor: 'hsl(var(--review-idle-surface))',
      border: '1px solid hsl(var(--review-idle-border))',
      color: 'hsl(var(--review-idle-foreground))',
    },
  },
  wrong: {
    active: {
      backgroundColor: 'hsl(var(--review-wrong-surface))',
      border: '2px solid hsl(var(--review-wrong-border))',
      color: 'hsl(var(--review-wrong-foreground))',
    },
    idle: {
      backgroundColor: 'hsl(var(--review-idle-surface))',
      border: '1px solid hsl(var(--review-idle-border))',
      color: 'hsl(var(--review-idle-foreground))',
    },
  },
  partial: {
    active: {
      backgroundColor: 'hsl(var(--review-partial-surface))',
      border: '2px solid hsl(var(--review-partial-border))',
      color: 'hsl(var(--review-partial-foreground))',
    },
    idle: {
      backgroundColor: 'hsl(var(--review-idle-surface))',
      border: '1px solid hsl(var(--review-idle-border))',
      color: 'hsl(var(--review-idle-foreground))',
    },
  },
};

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

function formatDateLabel(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatScoreLabel(value: number | null | undefined) {
  if (value == null) return '-';
  return `${value}점`;
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div
      className="mb-3 mt-6 border-b-2 pb-2 text-[15px] font-semibold text-foreground first:mt-0"
      style={{ borderColor: 'hsl(var(--review-correct-surface))' }}
    >
      {title}
    </div>
  );
}

async function resolvePhotoUrl(storagePath: string) {
  const publicUrl = supabase.storage.from('exam-results').getPublicUrl(storagePath).data.publicUrl;
  if (publicUrl) return publicUrl;
  const { data } = await supabase.storage.from('exam-results').createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? '';
}

export function ExamReviewPanel() {
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
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<Record<string, string>>({});
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
      const nextRows = (data ?? []) as unknown as ExamResultRow[];
      setRows(nextRows);
      setSelectedId((prev) => prev ?? nextRows[0]?.id ?? null);
    } catch (error: any) {
      toast({ title: '목록 조회 실패', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const sortedPhotos = useMemo(
    () => (selectedRow?.student_exam_result_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [selectedRow],
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
      setRows((prev) => prev.map((item) => (item.id === resultId ? { ...item, review_status: 'in_review' } : item)));
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

  const handleItemCountChange = (value: number) => {
    const safeCount = Math.max(1, Number.isFinite(value) ? value : 20);
    setItemCount(safeCount);
    setItemReviews((prev) => createItemDrafts(safeCount, prev));
  };

  const handleChangeItem = <K extends keyof ItemReviewDraft>(index: number, key: K, value: ItemReviewDraft[K]) => {
    setItemReviews((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [key]: value };
      if (key === 'result' && value === 'correct') {
        next.error_types = [];
      }
      return next;
    }));
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
    const normalizedItems = itemReviews.filter((item) => item.item_number > 0 && item.result !== '');

    setSaving(true);
    if (markDone) setCompleting(true);

    try {
      const { data: upsertedReview, error: reviewError } = await supabase
        .from('exam_reviews')
        .upsert(
          {
            result_id: selectedRow.id,
            reviewed_by: user.id,
            reviewed_by_name: reviewerName,
            overall_comment: overallComment.trim() || null,
            updated_at: nowIso,
            reviewed_at: markDone ? nowIso : null,
          },
          { onConflict: 'result_id' },
        )
        .select('id')
        .single();

      if (reviewError) throw reviewError;
      const currentReviewId = upsertedReview.id;
      setReviewId(currentReviewId);

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
  }, [fullName, itemReviews, loadResults, loadReviewDetail, overallComment, selectedRow, toast, user]);

  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">내신 시험지 리뷰</h1>
          <p className="text-sm text-muted-foreground">업로드된 시험지를 확인하고 사진, 문항별 채점, 코멘트를 한 화면에서 정리합니다.</p>
        </div>

        <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-4 xl:flex-row">
          <Card className="w-full xl:min-w-[380px] xl:max-w-[420px] xl:flex-[0_0_380px]">
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
              <ScrollArea className="h-[calc(100vh-20rem)] xl:h-[calc(100vh-16rem)]">
                <div className="space-y-2 p-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      조건에 맞는 시험지가 없습니다.
                    </div>
                  ) : (
                    filteredRows.map((row) => {
                      const status = (row.review_status ?? 'pending') as ReviewStatus;
                      const styleSet = STATUS_STYLE[status];
                      const photoCount = row.student_exam_result_photos?.length ?? 0;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="mb-2 w-full rounded-[10px] p-4 text-left transition-transform hover:-translate-y-0.5"
                          style={{
                            cursor: 'pointer',
                            ...styleSet.card,
                            boxShadow: selectedId === row.id ? '0 0 0 2px hsl(var(--ring) / 0.18)' : 'none',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Badge className="border-0 px-2.5 py-1 text-xs font-semibold" style={styleSet.badge}>
                              {STATUS_LABEL[status]}
                            </Badge>
                            <p className="text-sm font-semibold text-foreground">{row.subject}</p>
                          </div>

                          <div className="mt-3">
                            <p className="text-base font-bold text-foreground">
                              {row.students?.name ?? '이름 없음'}
                              <span className="ml-2 text-sm font-medium text-muted-foreground">
                                {row.students?.grade ? `${row.students.grade}학년` : '학년 미등록'}
                              </span>
                            </p>
                            <p className="mt-2 text-sm text-foreground/80">
                              {row.school_name} · {EXAM_TYPE_LABELS[row.exam_type] ?? row.exam_type} · 예상 {row.expected_score ?? '-'} / 실제 {row.actual_score ?? '-'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              사진 {photoCount}장 · 업로드 {formatDateTimeLabel(row.submitted_at)}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="min-w-0 flex-1 overflow-hidden">
            <CardContent className="h-full p-0">
              {!selectedRow ? (
                <div className="flex h-full min-h-[32rem] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <FileSearch className="h-10 w-10 opacity-40" />
                  <p>좌측에서 시험지를 선택해주세요</p>
                </div>
              ) : (
                <div className="flex h-full min-h-[32rem] min-w-0 flex-col">
                  <ScrollArea className="flex-1">
                    <div className="space-y-6 p-6 [word-break:keep-all] [white-space:normal]">
                      <section className="space-y-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[20px] font-bold text-foreground">{selectedRow.students?.name ?? '이름 없음'}</span>
                              <span
                                className="inline-flex rounded-full px-2.5 py-1 text-[13px] font-medium"
                                style={{
                                  backgroundColor: 'hsl(var(--review-correct-surface))',
                                  color: 'hsl(var(--review-correct-foreground))',
                                }}
                              >
                                {selectedRow.subject}
                              </span>
                            </div>
                            <div className="text-[13px] text-muted-foreground">
                              {selectedRow.school_name} · {selectedRow.students?.grade ? `${selectedRow.students.grade}학년` : '학년 미등록'} · {EXAM_TYPE_LABELS[selectedRow.exam_type] ?? selectedRow.exam_type}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-foreground">
                              <span className="text-[13px] text-muted-foreground">예상</span>
                              <span className="text-[22px] font-bold">{formatScoreLabel(selectedRow.expected_score)}</span>
                              <span className="text-[13px] text-muted-foreground">→ 실제</span>
                              <span
                                className="text-[22px] font-bold"
                                style={{ color: 'hsl(var(--review-done-badge))' }}
                              >
                                {formatScoreLabel(selectedRow.actual_score)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {selectedRow.exam_year ?? '-'} / {selectedRow.exam_period ?? '-'} · 시험일 {formatDateLabel(selectedRow.exam_date)} · 업로드 {formatDateTimeLabel(selectedRow.submitted_at)}
                            </div>
                          </div>

                          <Button onClick={() => void persistReview(true)} disabled={saving} className="px-5 py-2.5">
                            {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            리뷰 완료
                          </Button>
                        </div>
                      </section>

                      <section>
                        <SectionTitle title="시험지 사진" />
                        <div className="grid grid-cols-2 gap-3">
                          {sortedPhotos.length > 0 ? (
                            sortedPhotos.map((photo, index) => (
                              <button
                                key={photo.id}
                                type="button"
                                onClick={async () => {
                                  const cachedUrl = resolvedPhotoUrls[photo.storage_path];
                                  if (cachedUrl) {
                                    setSelectedImage(cachedUrl);
                                    return;
                                  }
                                  const resolvedUrl = await resolvePhotoUrl(photo.storage_path);
                                  if (resolvedUrl) {
                                    setResolvedPhotoUrls((prev) => ({ ...prev, [photo.storage_path]: resolvedUrl }));
                                    setSelectedImage(resolvedUrl);
                                  } else {
                                    toast({ title: '사진을 불러올 수 없습니다', variant: 'destructive' });
                                  }
                                }}
                                className="relative overflow-hidden rounded-lg border text-left transition hover:border-primary"
                                style={{ borderColor: 'hsl(var(--review-done-border))' }}
                              >
                                <div className="h-[180px] w-full bg-muted/20 p-2">
                                  <PhotoThumb
                                    storagePath={photo.storage_path}
                                    alt={`시험지 ${index + 1}`}
                                    className="border"
                                    imageClassName="rounded-lg"
                                    onResolvedUrl={(url) => setResolvedPhotoUrls((prev) => prev[photo.storage_path] ? prev : { ...prev, [photo.storage_path]: url })}
                                  />
                                </div>
                                <div className="absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[11px] text-white" style={{ backgroundColor: 'hsl(0 0% 0% / 0.5)' }}>
                                  {index + 1}번째 시험지
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="col-span-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                              등록된 시험지 사진이 없습니다.
                            </div>
                          )}
                        </div>
                      </section>

                      <section>
                        <SectionTitle title="문항별 채점" />
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">총 문항 수를 입력하면 채점 카드가 자동 생성됩니다.</p>
                          </div>
                          <div className="w-full max-w-[140px] space-y-2">
                            <Label htmlFor="item-count">총 문항 수</Label>
                            <Input
                              id="item-count"
                              type="number"
                              min={1}
                              value={itemCount}
                              onChange={(event) => handleItemCountChange(Number(event.target.value) || 1)}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {itemReviews.map((item, index) => {
                            const showErrors = item.result === 'wrong' || item.result === 'partial';
                            return (
                              <div key={item.id ?? `${item.item_number}-${index}`} className="rounded-[10px] border border-border bg-card px-2 py-3 text-center">
                                <div className="mb-2 text-[13px] text-muted-foreground">{item.item_number}번</div>
                                <div className="flex justify-center gap-1">
                                  {(['correct', 'wrong', 'partial'] as const).map((value) => {
                                    const active = item.result === value;
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => handleChangeItem(index, 'result', active ? '' : value)}
                                        className="flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold transition"
                                        style={active ? RESULT_BUTTON_STYLES[value].active : RESULT_BUTTON_STYLES[value].idle}
                                      >
                                        {value === 'correct' ? 'O' : value === 'wrong' ? 'X' : '△'}
                                      </button>
                                    );
                                  })}
                                </div>

                                {item.error_types.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap justify-center gap-1">
                                    {item.error_types.map((errorType) => (
                                      <span
                                        key={errorType}
                                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                        style={{
                                          backgroundColor: 'hsl(var(--review-error-chip-surface))',
                                          color: 'hsl(var(--review-error-chip-foreground))',
                                        }}
                                      >
                                        {errorType}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                {showErrors ? (
                                  <div className="mt-3 space-y-3 text-left">
                                    <div className="space-y-1.5">
                                      {ERROR_TYPES.map((errorType) => (
                                        <label key={errorType} className="flex items-start gap-2 text-[11px] text-foreground">
                                          <Checkbox
                                            checked={item.error_types.includes(errorType)}
                                            onCheckedChange={(checked) => handleToggleErrorType(index, errorType, checked === true)}
                                          />
                                          <span className="leading-4">{errorType}</span>
                                        </label>
                                      ))}
                                    </div>
                                    <Input
                                      id={`item-comment-${item.item_number}`}
                                      value={item.item_comment}
                                      onChange={(event) => handleChangeItem(index, 'item_comment', event.target.value)}
                                      placeholder="문항 코멘트"
                                      className="h-9 text-xs"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section>
                        <SectionTitle title="오답 요약" />
                        <div className="rounded-lg border border-border bg-muted/20 p-4">
                          <div className="flex flex-wrap gap-4 text-sm font-medium text-foreground">
                            <span>맞음 {reviewStats?.correct ?? 0}개</span>
                            <span>틀림 {reviewStats?.wrong ?? 0}개</span>
                            <span>부분 {reviewStats?.partial ?? 0}개</span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            가장 많은 오답유형: {reviewStats?.topError ? `${reviewStats.topError.label} (${reviewStats.topError.count}회)` : '없음'}
                          </p>
                        </div>
                      </section>

                      <section>
                        <SectionTitle title="선생님 코멘트" />
                        <Textarea
                          id="overall-comment"
                          rows={4}
                          value={overallComment}
                          onChange={(event) => setOverallComment(event.target.value)}
                          placeholder="전체적인 피드백을 입력해주세요"
                          className="min-h-[112px] resize-y"
                        />
                      </section>

                      <section>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button onClick={() => void persistReview(false)} disabled={saving} variant="outline" className="flex-1">
                            {saving && !completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            임시저장
                          </Button>
                          <Button onClick={() => void persistReview(true)} disabled={saving} className="sm:flex-[2]">
                            {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            리뷰 완료로 저장
                          </Button>
                        </div>
                      </section>
                    </div>
                  </ScrollArea>
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
            <div className="max-h-[80vh] overflow-hidden rounded-md border border-border bg-muted/20 p-2">
              <img src={selectedImage} alt="시험지 원본" className="max-h-[76vh] w-full rounded-md object-contain" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
