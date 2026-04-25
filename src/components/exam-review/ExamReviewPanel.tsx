import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { displayExamType, normalizeExamType, normalizeGrade, normalizeTextValue } from '@/lib/examTemplateUtils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ExamTemplateSetup } from '@/components/exam/ExamTemplateSetup';
import {
  OverlayGradingPanel,
  type OverlayPhoto,
  type OverlayAnswerDisplay,
  type OverlayReviewItem,
  type OverlayTemplateData,
  type OverlayTemplateItem,
} from '@/components/exam-review/OverlayGradingPanel';

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
  reviewed_at?: string | null;
  self_check_completed?: boolean | null;
  total_score?: number | null;
  earned_score?: number | null;
  template_id?: string | null;
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
  student_exam_result_photos: OverlayPhoto[] | null;
  exam_reviews: ReviewSummary[] | null;
}

interface ScoreTemplateRow {
  id: string;
  total_items: number;
  items: unknown;
  error_types: unknown;
  answer_mode?: string | null;
  answers?: unknown;
  answer_image_paths?: unknown;
  answer_pdf_path?: string | null;
}

interface GenerateExamReviewCommentResponse {
  comment?: string;
  error?: string;
}

interface SelfCheckRow {
  id: string;
  item_number: number;
  q_remembered: boolean | null;
  q_concept_confused: boolean | null;
  q_academy_helped: boolean | null;
  q_need_more: string | null;
  q_my_mistake: string | null;
  self_error_types: unknown;
  self_custom_reason: string | null;
}

const DEFAULT_TOTAL_ITEMS = 20;
const ALWAYS_INCLUDED_ERROR_TYPE = '기타(직접입력)';

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

function normalizeExamYearValue(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTemplateItems(raw: unknown, totalItems: number): OverlayTemplateItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return Array.from({ length: totalItems }, (_, index) => ({
      no: index + 1,
      type: '객관식',
      points: 0,
      is_essay: false,
    }));
  }

  return raw
    .map((item, index) => {
      const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const isEssay = source.is_essay === true || source.type === '주관식';
      return {
        no: typeof source.no === 'number' && Number.isFinite(source.no) ? source.no : index + 1,
        type: isEssay ? '주관식' : '객관식',
        points: typeof source.points === 'number' && Number.isFinite(source.points) ? source.points : 0,
        is_essay: isEssay,
        answer: typeof source.answer === 'string' ? source.answer : null,
      } satisfies OverlayTemplateItem;
    })
    .sort((a, b) => a.no - b.no);
}

function normalizeAnswers(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.entries(raw as Record<string, unknown>).reduce<Record<number, string>>((acc, [key, value]) => {
    const itemNo = Number(key);
    if (Number.isFinite(itemNo) && typeof value === 'string') acc[itemNo] = value;
    return acc;
  }, {});
}

function normalizeErrorTypes(raw: unknown) {
  const values = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
  return Array.from(new Set([...values, ALWAYS_INCLUDED_ERROR_TYPE]));
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
  const rounded = Math.round(value * 100) / 100;
  const display = Number.isInteger(rounded) ? `${rounded}` : `${Math.round(rounded * 10) / 10}`;
  return `${display}점`;
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

type ReviewPhase = 'scoring' | 'waiting_self_check' | 'ai_comment' | 'done';

const REVIEW_PHASE_STEPS: Array<{ key: ReviewPhase; label: string }> = [
  { key: 'scoring', label: '① 채점' },
  { key: 'waiting_self_check', label: '② 학생자가진단' },
  { key: 'ai_comment', label: '③ AI코멘트' },
  { key: 'done', label: '④ 완료' },
];

function ReviewPhaseBar({ phase }: { phase: ReviewPhase }) {
  const currentIndex = REVIEW_PHASE_STEPS.findIndex((step) => step.key === phase);
  return (
    <div className="mb-6 flex items-center gap-0">
      {REVIEW_PHASE_STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex-1 text-center">
              <div className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isDone ? 'bg-success text-success-foreground' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {isDone ? '✓' : index + 1}
              </div>
              <p className={`m-0 text-[10px] ${isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{step.label}</p>
            </div>
            {index < REVIEW_PHASE_STEPS.length - 1 ? (
              <div className={`mb-3.5 h-0.5 flex-[0.5] ${isDone ? 'bg-success' : 'bg-border'}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
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
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<Record<string, string>>({});
  const [templateSetupOpen, setTemplateSetupOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewMeta, setReviewMeta] = useState<ReviewSummary | null>(null);
  const [overallComment, setOverallComment] = useState('');
  const [itemReviews, setItemReviews] = useState<OverlayReviewItem[]>([]);
  const [template, setTemplate] = useState<OverlayTemplateData | null>(null);
  const [answerDisplay, setAnswerDisplay] = useState<OverlayAnswerDisplay | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [selfChecks, setSelfChecks] = useState<SelfCheckRow[]>([]);

  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/student-exam-results`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ action: 'staff_list' }),
        },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || '목록 조회에 실패했습니다.');

      const rawRows = Array.isArray(payload?.results) ? payload.results : [];
      const nextRows: ExamResultRow[] = rawRows.map((row: any) => {
        const photos = Array.isArray(row.photos) ? row.photos : (row.student_exam_result_photos ?? []);
        const normalizedPhotos: OverlayPhoto[] = photos.map((p: any) => ({
          id: p.id,
          storage_path: p.storage_path,
          sort_order: p.sort_order ?? 0,
          signedUrl: p.signedUrl ?? null,
        }));
        return {
          ...row,
          student_exam_result_photos: normalizedPhotos,
        } as ExamResultRow;
      });

      // Pre-populate URL map from edge-function-provided signed URLs
      const urlMap: Record<string, string> = {};
      nextRows.forEach((row) => {
        (row.student_exam_result_photos ?? []).forEach((photo) => {
          if (photo.signedUrl) urlMap[photo.storage_path] = photo.signedUrl;
        });
      });
      setResolvedPhotoUrls((prev) => ({ ...prev, ...urlMap }));

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

  const hasItems = itemReviews.length > 0;

  const wrongItems = useMemo(
    () => itemReviews.filter((item) => item.result === 'wrong' || item.result === 'partial'),
    [itemReviews],
  );

  const selfCheckCount = useMemo(() => {
    const completedNumbers = new Set(selfChecks.map((check) => check.item_number));
    return wrongItems.filter((item) => completedNumbers.has(item.item_number)).length;
  }, [selfChecks, wrongItems]);

  const reviewPhase: ReviewPhase = useMemo(() => {
    if (!reviewMeta?.reviewed_at && selectedRow?.review_status !== 'done') return 'scoring';
    if (reviewMeta?.overall_comment?.trim()) return 'done';
    if (wrongItems.length > 0 && !reviewMeta?.self_check_completed) return 'waiting_self_check';
    return 'ai_comment';
  }, [reviewMeta, selectedRow?.review_status, wrongItems.length]);

  const selfCheckProgress = wrongItems.length > 0 ? Math.round((selfCheckCount / wrongItems.length) * 100) : 100;

  useEffect(() => {
    let active = true;

    const resolveUrls = async () => {
      const missingPhotos = sortedPhotos.filter((photo) => !resolvedPhotoUrls[photo.storage_path]);
      if (missingPhotos.length === 0) return;

      const entries = await Promise.all(
        missingPhotos.map(async (photo) => {
          const url = await resolvePhotoUrl(photo.storage_path);
          return [photo.storage_path, url] as const;
        }),
      );

      if (!active) return;
      setResolvedPhotoUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([storagePath, url]) => {
          if (url) next[storagePath] = url;
        });
        return next;
      });
    };

    void resolveUrls();

    return () => {
      active = false;
    };
  }, [resolvedPhotoUrls, sortedPhotos]);

  const loadReviewDetail = useCallback(async (resultId: string) => {
    try {
      const { data: reviews, error: reviewError } = await supabase
        .from('exam_reviews')
        .select('id, overall_comment, reviewed_at, self_check_completed, created_at, template_id, total_score, earned_score')
        .eq('result_id', resultId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (reviewError) throw reviewError;

      const currentReview = reviews?.[0] ?? null;
      setReviewId(currentReview?.id ?? null);
      setReviewMeta(currentReview ?? null);
      setOverallComment(currentReview?.overall_comment ?? '');
      setAiGenerated(false);

      if (!currentReview) {
        setItemReviews([]);
        setSelfChecks([]);
        setReviewMeta(null);
        return;
      }

      const { data: items, error: itemError } = await supabase
        .from('exam_item_reviews')
        .select('id, item_number, result, error_types, item_comment, score_earned, is_essay, custom_reason, overlay_x, overlay_y, page_number')
        .eq('review_id', currentReview.id)
        .order('item_number', { ascending: true });

      if (itemError) throw itemError;

      const drafts: OverlayReviewItem[] = (items ?? []).map((item) => ({
        id: item.id,
        item_number: item.item_number,
        result: (item.result ?? '') as ItemResult,
        error_types: Array.isArray(item.error_types) ? item.error_types.filter((value): value is string => typeof value === 'string') : [],
        item_comment: item.item_comment ?? '',
        score_earned: item.score_earned ?? 0,
        is_essay: item.is_essay ?? false,
        custom_reason: item.custom_reason ?? '',
        overlay_x: item.overlay_x ?? null,
        overlay_y: item.overlay_y ?? null,
        page_number: item.page_number ?? null,
      }));

      setItemReviews(drafts);

      const { data: checks } = await supabase
        .from('exam_student_self_checks')
        .select('id, item_number, q_remembered, q_concept_confused, q_academy_helped, q_need_more, q_my_mistake, self_error_types, self_custom_reason')
        .eq('review_id', currentReview.id)
        .order('item_number', { ascending: true });
      setSelfChecks((checks ?? []) as SelfCheckRow[]);
    } catch (error: any) {
      toast({ title: '리뷰 조회 실패', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  const loadTemplate = useCallback(async (row: ExamResultRow | null) => {
    const schoolName = normalizeTextValue(row?.school_name);
    const subject = normalizeTextValue(row?.subject);
    const grade = normalizeGrade(row?.students?.grade);
    const examType = normalizeExamType(row?.exam_type);
    const examYear = normalizeExamYearValue(row?.exam_year);
    const examPeriod = normalizeTextValue(row?.exam_period);

    if (!row || !schoolName || !subject || !grade) {
      setTemplate(null);
      setAnswerDisplay(null);
      return;
    }

    setTemplateLoading(true);
    try {
      console.log('템플릿 조회 조건:', {
        school_name: schoolName,
        subject,
        grade,
        exam_type: examType,
        exam_year: examYear,
        exam_period: examPeriod,
      });

      let query = supabase
        .from('exam_score_templates')
        .select('id, total_items, items, error_types, answer_mode, answers, answer_image_paths, answer_pdf_path, created_at')
        .eq('school_name', schoolName)
        .eq('subject', subject)
        .eq('grade', grade);

      if (examType) {
        query = query.eq('exam_type', examType);
      }
      if (examYear != null) {
        query = query.eq('exam_year', examYear);
      }
      if (examPeriod) {
        query = query.eq('exam_period', examPeriod);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (error) throw error;
      const templateRow = (data ?? null) as ScoreTemplateRow | null;
      console.log('조회 결과:', templateRow, '에러:', error);

      if (!templateRow) {
        setTemplate(null);
        setAnswerDisplay(null);
        return;
      }

      const normalizedItems = normalizeTemplateItems(templateRow.items, templateRow.total_items || DEFAULT_TOTAL_ITEMS);
      setTemplate({
        id: templateRow.id,
        total_items: templateRow.total_items,
        items: normalizedItems,
        error_types: normalizeErrorTypes(templateRow.error_types),
      });

      if (templateRow.answer_mode === 'image' && Array.isArray(templateRow.answer_image_paths)) {
        const urls = await Promise.all(templateRow.answer_image_paths.filter((path): path is string => typeof path === 'string').map(async (path) => {
          const { data } = await supabase.storage.from('exam-analysis').createSignedUrl(path, 3600);
          return data?.signedUrl ?? '';
        }));
        setAnswerDisplay({ type: 'image', urls: urls.filter(Boolean) });
      } else if (templateRow.answer_mode === 'pdf' && templateRow.answer_pdf_path) {
        const { data } = await supabase.storage.from('exam-analysis').createSignedUrl(templateRow.answer_pdf_path, 3600);
        setAnswerDisplay(data?.signedUrl ? { type: 'pdf', url: data.signedUrl } : null);
      } else {
        setAnswerDisplay({ type: 'direct', answers: normalizeAnswers(templateRow.answers) });
      }
    } catch (error: any) {
      setTemplate(null);
      setAnswerDisplay(null);
      toast({ title: '템플릿 조회 실패', description: error.message, variant: 'destructive' });
    } finally {
      setTemplateLoading(false);
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
      setReviewMeta(null);
      setOverallComment('');
      setItemReviews([]);
      setSelfChecks([]);
      setTemplate(null);
      setAnswerDisplay(null);
      return;
    }
    void markInReview(selectedId);
    void loadReviewDetail(selectedId);
    void loadTemplate(selectedRow);
  }, [loadReviewDetail, loadTemplate, markInReview, selectedId, selectedRow]);

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
          error_types: item.error_types,
          item_comment: item.item_comment.trim() || null,
          score_earned: item.score_earned ?? 0,
          is_essay: item.is_essay,
          custom_reason: item.custom_reason.trim() || null,
          overlay_x: item.overlay_x,
          overlay_y: item.overlay_y,
          page_number: item.page_number,
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

  const saveOverlayItem = useCallback(async (payload: {
    id?: string;
    item_number: number;
    result: Exclude<ItemResult, ''>;
    score_earned: number;
    is_essay: boolean;
    error_types: string[];
    custom_reason: string;
    overlay_x: number;
    overlay_y: number;
    page_number: number;
  }) => {
    if (!selectedRow || !user || !template) return;

    const nowIso = new Date().toISOString();
    const reviewerName = fullName || user.email || '교직원';

    setSaving(true);
    try {
      // 1) exam_reviews: SELECT → INSERT or UPDATE (avoid onConflict mismatch)
      let currentReviewId = reviewId;
      if (!currentReviewId) {
        const { data: existingReview, error: existingReviewError } = await supabase
          .from('exam_reviews')
          .select('id')
          .eq('result_id', selectedRow.id)
          .maybeSingle();
        if (existingReviewError) throw existingReviewError;
        currentReviewId = existingReview?.id ?? null;
      }

      if (currentReviewId) {
        const { error: updateReviewError } = await supabase
          .from('exam_reviews')
          .update({
            reviewed_by: user.id,
            reviewed_by_name: reviewerName,
            overall_comment: overallComment.trim() || null,
            template_id: template.id,
            updated_at: nowIso,
          })
          .eq('id', currentReviewId);
        if (updateReviewError) throw updateReviewError;
      } else {
        const { data: createdReview, error: createReviewError } = await supabase
          .from('exam_reviews')
          .insert({
            result_id: selectedRow.id,
            reviewed_by: user.id,
            reviewed_by_name: reviewerName,
            overall_comment: overallComment.trim() || null,
            template_id: template.id,
            updated_at: nowIso,
          })
          .select('id')
          .single();
        if (createReviewError) throw createReviewError;
        currentReviewId = createdReview.id;
      }
      setReviewId(currentReviewId);

      // 2) exam_item_reviews: SELECT → INSERT or UPDATE (avoid onConflict mismatch)
      const { data: existingItem, error: existingItemError } = await supabase
        .from('exam_item_reviews')
        .select('id')
        .eq('review_id', currentReviewId)
        .eq('item_number', payload.item_number)
        .maybeSingle();
      if (existingItemError) throw existingItemError;

      const itemPayload = {
        result: payload.result,
        score_earned: payload.score_earned,
        is_essay: payload.is_essay,
        error_types: payload.error_types,
        custom_reason: payload.custom_reason || null,
        overlay_x: payload.overlay_x,
        overlay_y: payload.overlay_y,
        page_number: payload.page_number,
      };

      if (existingItem) {
        const { error: updateItemError } = await supabase
          .from('exam_item_reviews')
          .update(itemPayload)
          .eq('id', existingItem.id);
        if (updateItemError) throw updateItemError;
      } else {
        const { error: insertItemError } = await supabase
          .from('exam_item_reviews')
          .insert({
            review_id: currentReviewId,
            item_number: payload.item_number,
            ...itemPayload,
          });
        if (insertItemError) throw insertItemError;
      }

      const mergedItems = itemReviews.filter((item) => item.item_number !== payload.item_number).concat({
        id: payload.id,
        item_number: payload.item_number,
        result: payload.result,
        error_types: payload.error_types,
        item_comment: '',
        score_earned: payload.score_earned,
        is_essay: payload.is_essay,
        custom_reason: payload.custom_reason,
        overlay_x: payload.overlay_x,
        overlay_y: payload.overlay_y,
        page_number: payload.page_number,
      });

      const earnedScore = Math.round(mergedItems.reduce((sum, item) => sum + (item.score_earned ?? 0), 0) * 100) / 100;
      const totalScore = Math.round(template.items.reduce((sum, item) => sum + (item.points || 0), 0) * 100) / 100;

      const { error: scoreError } = await supabase
        .from('exam_reviews')
        .update({ earned_score: earnedScore, total_score: totalScore, template_id: template.id, updated_at: nowIso })
        .eq('id', currentReviewId);

      if (scoreError) throw scoreError;

      await loadReviewDetail(selectedRow.id);
    } catch (error: any) {
      toast({ title: '문항 저장 실패', description: error.message, variant: 'destructive' });
      throw error;
    } finally {
      setSaving(false);
    }
  }, [fullName, itemReviews, loadReviewDetail, overallComment, selectedRow, template, toast, user]);

  const resetComment = useCallback(() => {
    setOverallComment('');
    setAiGenerated(false);
  }, []);

  useEffect(() => {
    if (!reviewId || !selectedRow) return undefined;

    const channel = supabase
      .channel(`self_check_watch_${reviewId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_student_self_checks', filter: `review_id=eq.${reviewId}` }, () => {
        void loadReviewDetail(selectedRow.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_reviews', filter: `id=eq.${reviewId}` }, () => {
        void loadReviewDetail(selectedRow.id);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadReviewDetail, reviewId, selectedRow]);

  const handleMarkDone = useCallback(async () => {
    const ok = await persistReview(true);
    if (ok) toast({ title: '채점 완료', description: '학생에게 자가진단을 요청했습니다.' });
  }, [persistReview, toast]);

  const handleFinalSave = useCallback(async () => {
    if (!reviewId || !user || !overallComment.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('exam_reviews')
        .update({
          overall_comment: overallComment.trim(),
          reviewed_by: user.id,
          reviewed_by_name: fullName || user.email || '교직원',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reviewId);
      if (error) throw error;
      if (selectedRow) await loadReviewDetail(selectedRow.id);
      toast({ title: '리뷰가 최종 저장됐어요' });
    } catch (error: any) {
      toast({ title: '최종 저장 실패', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [fullName, loadReviewDetail, overallComment, reviewId, selectedRow, toast, user]);

  const handleGenerateAI = useCallback(async () => {
    if (!selectedRow || !template || !hasItems || reviewPhase !== 'ai_comment') return;

    if (overallComment.trim()) {
      const shouldReplace = window.confirm('기존 내용이 대체됩니다. 계속하시겠습니까?');
      if (!shouldReplace) return;
    }

    const wrongItems = itemReviews.filter((item) => item.result === 'wrong' || item.result === 'partial');
    const correctCount = itemReviews.filter((item) => item.result === 'correct').length;
    const totalItems = template.items.length;
    const earnedScore = Math.round(itemReviews.reduce((sum, item) => sum + (item.score_earned || 0), 0) * 100) / 100;
    const totalScore = Math.round(template.items.reduce((sum, item) => sum + (item.points || 0), 0) * 100) / 100;
    const errorTypeCounts: Record<string, number> = {};

    wrongItems.forEach((item) => {
      item.error_types.forEach((type) => {
        errorTypeCounts[type] = (errorTypeCounts[type] || 0) + 1;
      });
    });

    const topErrors = Object.entries(errorTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => ({ type, count }));

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke<GenerateExamReviewCommentResponse>('generate-exam-review-comment', {
        body: {
          studentName: selectedRow.students?.name ?? '학생',
          grade: selectedRow.students?.grade ?? null,
          subject: selectedRow.subject,
          schoolName: selectedRow.school_name,
          examYear: selectedRow.exam_year,
          examPeriod: selectedRow.exam_period,
          examType: selectedRow.exam_type,
          totalItems,
          correctCount,
          wrongCount: wrongItems.filter((item) => item.result === 'wrong').length,
          partialCount: wrongItems.filter((item) => item.result === 'partial').length,
          earnedScore,
          totalScore,
          wrongItems: wrongItems.map((item) => {
            const templateItem = template.items.find((templateEntry) => templateEntry.no === item.item_number);
            return {
              itemNumber: item.item_number,
              type: templateItem?.type ?? (item.is_essay ? '주관식' : '객관식'),
              points: templateItem?.points ?? 0,
              errorTypes: item.error_types,
              customReason: item.custom_reason || null,
            };
          }),
          topErrors,
          selfChecks: selfChecks.map((c) => ({
            itemNumber: c.item_number,
            remembered: c.q_remembered,
            conceptConfused: c.q_concept_confused,
            academyHelped: c.q_academy_helped,
            needMore: c.q_need_more || null,
            myMistake: c.q_my_mistake || null,
          })),
        },
      });

      if (error) throw error;
      if (!data?.comment) {
        throw new Error(data?.error || 'AI 초안 생성에 실패했습니다.');
      }

      setOverallComment(data.comment);
      setAiGenerated(true);
      toast({ title: 'AI 초안이 생성되었습니다' });
    } catch (error: any) {
      toast({
        title: 'AI 초안 생성 실패',
        description: error?.message ?? 'AI 초안 생성에 실패했습니다. 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [hasItems, itemReviews, overallComment, reviewPhase, selectedRow, selfChecks, template, toast]);

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
                      {record.school_name} · {displayExamType(record.exam_type)} · 예상 {formatScoreLabel(record.expected_score)}
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
                    {selectedRow.school_name} · {displayExamType(selectedRow.exam_type)} · 예상 {formatScoreLabel(selectedRow.expected_score)}{selectedRow.actual_score != null ? ` → 실제 ${formatScoreLabel(selectedRow.actual_score)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setTemplateSetupOpen(true)}>
                    이 시험 템플릿 설정
                  </Button>
                </div>
              </div>

              <ReviewPhaseBar phase={reviewPhase} />

              <div className="mb-8">
                <SectionTitle title="오버레이 채점" />
                <OverlayGradingPanel
                  photos={sortedPhotos}
                  photoUrls={resolvedPhotoUrls}
                  template={template}
                  templateLoading={templateLoading}
                  items={itemReviews}
                  saving={saving}
                  onSaveItem={saveOverlayItem}
                  onOpenTemplateSetup={() => setTemplateSetupOpen(true)}
                  answerDisplay={answerDisplay}
                />
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

              {reviewPhase === 'waiting_self_check' ? (
                <div className="mb-6 rounded-[10px] bg-warning/10 p-4 text-center">
                  <p className="mb-1 text-sm font-semibold text-warning">⏳ 학생 자가진단 대기 중</p>
                  <p className="mb-3 text-xs text-warning/80">학생이 자가진단을 완료하면 AI 코멘트를 작성할 수 있어요</p>
                  <p className="text-[11px] text-muted-foreground">틀린 문항 {wrongItems.length}개 중 {selfCheckCount}개 완료</p>
                  <div className="mt-2 h-1.5 rounded-full bg-border">
                    <div className="h-full rounded-full bg-warning transition-all duration-500" style={{ width: `${selfCheckProgress}%` }} />
                  </div>
                </div>
              ) : null}

              {reviewPhase === 'ai_comment' || reviewPhase === 'done' ? (
                <div className="mb-6">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b-2 pb-2" style={{ borderColor: 'hsl(var(--review-correct-surface))' }}>
                    <div className="text-[15px] font-semibold text-foreground">선생님 코멘트</div>
                    {reviewPhase === 'ai_comment' ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleGenerateAI()}
                        disabled={isGenerating || !hasItems || !template}
                        className="gap-2 border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {isGenerating ? 'AI 분석 중...' : 'AI 초안 생성'}
                      </Button>
                    ) : null}
                  </div>
                {selfChecks.length > 0 ? (
                  <div className="mb-3 rounded-[10px] border border-sky-200 bg-sky-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-sky-900">
                      학생 자가진단 결과 ({selfChecks.length}문항)
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {selfChecks.map((check) => (
                        <div key={check.id} className="rounded-md bg-background p-2 text-[11px]">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-semibold text-foreground">{check.item_number}번</span>
                            <span className="text-sky-700">
                              기억 {check.q_remembered ? '✓' : '✗'}
                            </span>
                            <span className="text-amber-700">
                              개념혼동 {check.q_concept_confused ? '✓' : '✗'}
                            </span>
                            <span className="text-emerald-700">
                              학원도움 {check.q_academy_helped ? '✓' : '✗'}
                            </span>
                          </div>
                          {check.q_need_more ? (
                            <p className="mt-1 text-muted-foreground">💬 {check.q_need_more}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {aiGenerated ? (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                    <span>✦ AI가 초안을 작성했어요. 자유롭게 수정해주세요.</span>
                    <button
                      type="button"
                      onClick={resetComment}
                      className="font-medium text-primary/90 underline-offset-4 hover:underline"
                    >
                      초기화
                    </button>
                  </div>
                ) : null}
                <Textarea
                  value={overallComment}
                  onChange={(event) => {
                    setOverallComment(event.target.value);
                    if (aiGenerated) setAiGenerated(false);
                  }}
                  placeholder="전체적인 피드백을 입력하거나 AI 초안을 생성해보세요"
                  rows={8}
                  disabled={reviewPhase === 'done'}
                  className="min-h-[176px] resize-y"
                />
                </div>
              ) : null}

              {reviewPhase === 'scoring' ? (
                <Button onClick={() => void handleMarkDone()} disabled={saving} className="w-full py-3">
                  {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  채점 완료 — 학생에게 자가진단 요청
                </Button>
              ) : null}

              {reviewPhase === 'ai_comment' ? (
                <Button onClick={() => void handleFinalSave()} disabled={saving || !overallComment.trim()} className="w-full py-3">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  최종 저장 및 리뷰 완료
                </Button>
              ) : null}

              {reviewPhase === 'done' ? (
                <div className="rounded-[10px] bg-success/10 p-4 text-center">
                  <p className="mb-1 text-base font-bold text-success">✅ 리뷰 완료</p>
                  <p className="text-xs text-success/80">학생과 학부모에게 공개됐어요</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ExamTemplateSetup
        open={templateSetupOpen}
        onOpenChange={setTemplateSetupOpen}
        record={selectedRow}
        currentUserId={user?.id ?? null}
        onSaved={() => {
          void loadResults();
          void loadTemplate(selectedRow);
        }}
      />
    </>
  );
}