import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

const EXAM_TYPE_LABELS: Record<string, string> = {
  midterm: '중간고사',
  final: '기말고사',
  performance: '수행평가',
  other: '기타',
};

const ERROR_TYPES = ['개념이해 부족', '계산실수', '문제이해 오류', '시간부족', '풀이누락', '유형파악 못함'] as const;

function createItemDrafts(count: number, source: ItemReviewDraft[] = []): ItemReviewDraft[] {
  return Array.from({ length: count }, (_, index) => {
    const itemNumber = index + 1;
    const existing = source.find((item) => item.item_number === itemNumber);
    return existing ?? { item_number: itemNumber, result: '', error_types: [], item_comment: '' };
  });
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div
      className="mb-3 border-b-2 pb-2 text-[15px] font-semibold text-foreground"
      style={{ borderColor: 'hsl(var(--review-correct-surface))' }}
    >
      {title}
    </div>
  );
}

function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
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

async function resolvePhotoUrl(storagePath: string) {
  const publicUrl = supabase.storage.from('exam-results').getPublicUrl(storagePath).data.publicUrl;
  if (publicUrl) return publicUrl;
  const { data } = await supabase.storage.from('exam-results').createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? '';
}

function getStatusClasses(status: ReviewStatus, selected: boolean) {
  if (selected) {
    return {
      card: 'border-2 border-[hsl(var(--review-done-badge))] bg-[hsl(var(--review-correct-surface))]',
      badge: 'bg-[hsl(var(--review-done-badge))] text-[hsl(var(--review-done-badge-foreground))]',
    };
  }

  if (status === 'pending') {
    return {
      card: 'border border-[hsl(var(--review-pending-border))] bg-[hsl(var(--review-pending-surface))]',
      badge: 'bg-[hsl(var(--review-pending-badge))] text-[hsl(var(--review-pending-badge-foreground))]',
    };
  }
  if (status === 'in_review') {
    return {
      card: 'border border-[hsl(var(--review-progress-border))] bg-[hsl(var(--review-progress-surface))]',
      badge: 'bg-[hsl(var(--review-progress-badge))] text-[hsl(var(--review-progress-badge-foreground))]',
    };
  }
  return {
    card: 'border border-[hsl(var(--review-done-border))] bg-[hsl(var(--review-done-surface))] opacity-75',
    badge: 'bg-[hsl(var(--review-done-badge))] text-[hsl(var(--review-done-badge-foreground))]',
  };
}

function getResultButtonClasses(active: boolean, value: Exclude<ItemResult, ''>) {
  if (!active) {
    return 'border-[hsl(var(--review-idle-border))] bg-[hsl(var(--review-idle-surface))] text-[hsl(var(--review-idle-foreground))]';
  }
  if (value === 'correct') {
    return 'border-[hsl(var(--review-correct-border))] bg-[hsl(var(--review-correct-surface))] text-[hsl(var(--review-correct-foreground))]';
  }
  if (value === 'wrong') {
    return 'border-[hsl(var(--review-wrong-border))] bg-[hsl(var(--review-wrong-surface))] text-[hsl(var(--review-wrong-foreground))]';
  }
  return 'border-[hsl(var(--review-partial-border))] bg-[hsl(var(--review-partial-surface))] text-[hsl(var(--review-partial-foreground))]';
}

export function ExamReviewPanel() {
  const { user, fullName } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [rows, setRows] = useState<ExamResultRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('all');
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
          exam_reviews(id, overall_comment)
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      const nextRows = (data ?? []) as unknown as ExamResultRow[];
      setRows(nextRows);
      setSelectedId((prev) => (prev && nextRows.some((row) => row.id === prev) ? prev : null));
    } catch (error: any) {
      toast({ title: '목록 조회 실패', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

  const sortedPhotos = useMemo(
    () => (selectedRow?.student_exam_result_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [selectedRow],
  );

  const subjectOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.subject))).sort(), [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (subjectFilter !== 'all' && row.subject !== subjectFilter) return false;
    if (statusFilter !== 'all' && (row.review_status ?? 'pending') !== statusFilter) return false;
    return true;
  }), [rows, statusFilter, subjectFilter]);

  const counts = useMemo(() => {
    const correct = itemReviews.filter((item) => item.result === 'correct').length;
    const wrong = itemReviews.filter((item) => item.result === 'wrong').length;
    const partial = itemReviews.filter((item) => item.result === 'partial').length;
    const errorMap = new Map<string, number>();
    itemReviews.forEach((item) => {
      item.error_types.forEach((type) => errorMap.set(type, (errorMap.get(type) ?? 0) + 1));
    });
    const topErrorType = [...errorMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { correct, wrong, partial, topErrorType };
  }, [itemReviews]);

  const loadReviewDetail = useCallback(async (resultId: string) => {
    try {
      const { data: reviews, error: reviewError } = await supabase
        .from('exam_reviews')
        .select('id, overall_comment, created_at')
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

      const drafts: ItemReviewDraft[] = (items ?? []).map((item) => ({
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

    setRows((prev) => prev.map((item) => (item.id === resultId ? { ...item, review_status: 'in_review' } : item)));
    const { error } = await supabase
      .from('student_exam_results')
      .update({ review_status: 'in_review' })
      .eq('id', resultId)
      .eq('review_status', 'pending');

    if (error) {
      await loadResults();
    }
  }, [loadResults, rows]);

  useEffect(() => {
    if (!selectedId) {
      setReviewId(null);
      setOverallComment('');
      setItemCount(20);
      setItemReviews(createItemDrafts(20));
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

  const setItemResult = (itemNumber: number, value: Exclude<ItemResult, ''>) => {
    setItemReviews((prev) => prev.map((item) => {
      if (item.item_number !== itemNumber) return item;
      const nextValue: ItemResult = item.result === value ? '' : value;
      return {
        ...item,
        result: nextValue,
        error_types: nextValue === 'correct' ? [] : item.error_types,
      };
    }));
  };

  const toggleError = (itemNumber: number, errorType: string, checked: boolean) => {
    setItemReviews((prev) => prev.map((item) => {
      if (item.item_number !== itemNumber) return item;
      const error_types = checked
        ? Array.from(new Set([...item.error_types, errorType]))
        : item.error_types.filter((value) => value !== errorType);
      return { ...item, error_types };
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

      const { error: deleteError } = await supabase.from('exam_item_reviews').delete().eq('review_id', currentReviewId);
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
        const { error: resultError } = await supabase.from('student_exam_results').update({ review_status: 'done' }).eq('id', selectedRow.id);
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
      <div className="flex h-full w-full overflow-hidden [white-space:normal] [word-break:keep-all]">
        <div className="w-[360px] min-w-[360px] border-r border-border p-4">
          <div className="mb-3 space-y-2">
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none"
            >
              <option value="all">전체 과목</option>
              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map((option) => {
                const active = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`flex-1 rounded-md px-0 py-1.5 text-xs transition ${active ? 'bg-primary text-primary-foreground font-semibold' : 'bg-muted text-muted-foreground'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-[calc(100vh-18rem)] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                조건에 맞는 시험지가 없습니다.
              </div>
            ) : (
              filteredRows.map((record) => {
                const status = (record.review_status ?? 'pending') as ReviewStatus;
                const styles = getStatusClasses(status, selectedId === record.id);
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedId(record.id)}
                    className={`mb-2 block w-full rounded-[10px] p-[14px_16px] text-left ${styles.card}`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.badge}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">{record.subject}</span>
                    </div>
                    <div className="mb-1 text-[15px] font-bold text-foreground">{record.students?.name ?? '이름 없음'}</div>
                    <div className="text-xs text-muted-foreground">
                      {record.school_name} · {EXAM_TYPE_LABELS[record.exam_type] ?? record.exam_type} · 예상 {formatScoreLabel(record.expected_score)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground/80">
                      사진 {record.student_exam_result_photos?.length ?? 0}장 · {formatDateTimeLabel(record.submitted_at)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          {!selectedRow ? (
            <div className="flex h-full min-h-[32rem] items-center justify-center text-[15px] text-muted-foreground">
              좌측에서 시험지를 선택해주세요
            </div>
          ) : (
            <div className="mx-auto max-w-[1400px] [white-space:normal] [word-break:keep-all]">
              <div className="mb-6 flex items-center justify-between gap-4 border-b-2 pb-4" style={{ borderColor: 'hsl(var(--review-correct-surface))' }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[22px] font-bold text-foreground">{selectedRow.students?.name ?? '이름 없음'}</span>
                    <span className="rounded-full px-3 py-1 text-[13px] font-medium" style={{ backgroundColor: 'hsl(var(--review-correct-surface))', color: 'hsl(var(--review-correct-foreground))' }}>
                      {selectedRow.subject}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13px] text-muted-foreground">
                    {selectedRow.school_name} · {EXAM_TYPE_LABELS[selectedRow.exam_type] ?? selectedRow.exam_type} · 예상 {formatScoreLabel(selectedRow.expected_score)}{selectedRow.actual_score != null ? ` → 실제 ${formatScoreLabel(selectedRow.actual_score)}` : ''}
                  </div>
                </div>
                <Button onClick={() => void persistReview(true)} disabled={saving} className="px-6 py-3">
                  {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  리뷰 완료
                </Button>
              </div>

              <div className="mb-8">
                <SectionTitle title="시험지 사진" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {sortedPhotos.map((photo, index) => (
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
                      className="relative cursor-pointer text-left"
                    >
                      <PhotoThumb
                        storagePath={photo.storage_path}
                        alt={`시험지 ${index + 1}`}
                        className="block h-40 w-full rounded-lg border border-border"
                        imageClassName="block h-40 w-full rounded-lg border border-border object-cover"
                        onResolvedUrl={(url) => setResolvedPhotoUrls((prev) => (prev[photo.storage_path] ? prev : { ...prev, [photo.storage_path]: url }))}
                      />
                      <div className="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-2 py-0.5 text-[11px] text-white">
                        {index + 1}번째
                      </div>
                    </button>
                  ))}
                  {sortedPhotos.length === 0 ? (
                    <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      등록된 시험지 사진이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mb-8">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px] flex-1">
                    <SectionTitle title="문항별 채점" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-muted-foreground">총 문항 수</span>
                    <Input
                      type="number"
                      min={1}
                      value={itemCount}
                      onChange={(event) => handleItemCountChange(Number(event.target.value) || 1)}
                      className="h-9 w-[60px] px-2 text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
                  {itemReviews.map((item) => {
                    const showErrors = item.result === 'wrong' || item.result === 'partial';
                    return (
                      <div key={item.item_number} className="rounded-[10px] border border-border bg-background px-2 py-3 text-center">
                        <div className="mb-2 text-xs text-muted-foreground">{item.item_number}번</div>
                        <div className="flex justify-center gap-1">
                          {([
                            ['correct', 'O'],
                            ['wrong', 'X'],
                            ['partial', '△'],
                          ] as const).map(([value, label]) => {
                            const active = item.result === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setItemResult(item.item_number, value)}
                                className={`h-9 w-9 rounded-md border text-[15px] font-bold ${getResultButtonClasses(active, value)}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        {showErrors ? (
                          <div className="mt-2 text-left">
                            {ERROR_TYPES.map((type) => (
                              <label key={type} className="mb-1 flex cursor-pointer items-center gap-1 text-[10px] text-foreground/80">
                                <Checkbox
                                  checked={item.error_types.includes(type)}
                                  onCheckedChange={(checked) => toggleError(item.item_number, type, checked === true)}
                                />
                                <span>{type}</span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mb-6 rounded-[10px] border p-4" style={{ backgroundColor: 'hsl(var(--review-photo-placeholder-surface) / 0.35)', borderColor: 'hsl(var(--review-correct-surface))' }}>
                <div className="mb-2 text-sm font-semibold text-foreground">오답 분석</div>
                <div className="flex flex-wrap gap-4 text-[13px] text-foreground">
                  <span>맞음 <b style={{ color: 'hsl(var(--review-correct-border))' }}>{counts.correct}</b>개</span>
                  <span>틀림 <b style={{ color: 'hsl(var(--review-wrong-border))' }}>{counts.wrong}</b>개</span>
                  <span>부분 <b style={{ color: 'hsl(var(--review-partial-border))' }}>{counts.partial}</b>개</span>
                </div>
                {counts.topErrorType ? (
                  <div className="mt-2 text-xs text-muted-foreground">주요 오답유형: <b className="text-foreground">{counts.topErrorType}</b></div>
                ) : null}
              </div>

              <div className="mb-6">
                <SectionTitle title="선생님 코멘트" />
                <Textarea
                  value={overallComment}
                  onChange={(event) => setOverallComment(event.target.value)}
                  placeholder="전체적인 피드백을 입력해주세요"
                  rows={4}
                  className="min-h-[112px] resize-y"
                />
              </div>

              <div className="flex gap-2.5">
                <Button onClick={() => void persistReview(false)} disabled={saving} variant="outline" className="flex-1 py-3">
                  {saving && !completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  임시저장
                </Button>
                <Button onClick={() => void persistReview(true)} disabled={saving} className="flex-[2] py-3">
                  {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  리뷰 완료로 저장
                </Button>
              </div>
            </div>
          )}
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