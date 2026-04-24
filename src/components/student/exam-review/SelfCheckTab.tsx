import { useEffect, useMemo, useState } from 'react';
import { studentApi } from '@/lib/studentApi';
import { toast } from 'sonner';

interface ItemReview {
  id: string;
  item_number: number;
  result: 'correct' | 'wrong' | 'partial' | null;
  error_types: string[];
  custom_reason?: string | null;
  score_earned?: number | null;
  page_number?: number | null;
}

interface SelfCheck {
  item_number: number;
  q_remembered: boolean | null;
  q_concept_confused: boolean | null;
  q_academy_helped: boolean | null;
  q_need_more: string | null;
  self_error_types: string[];
}

interface Photo {
  id: string;
  signed_url: string | null;
  sort_order: number;
}

interface Props {
  reviewId: string;
  items: ItemReview[];
  selfChecks: SelfCheck[];
  templateErrorTypes: string[];
  templateItems: Array<{ no: number; points: number }>;
  photos: Photo[];
  selfCheckCompleted: boolean;
  onCompleted: () => void;
}

interface Answers {
  remembered: boolean | null;
  conceptConfused: boolean | null;
  academyHelped: boolean | null;
  needMore: string;
  selfErrorTypes: string[];
}

const DEFAULT_ANSWERS: Answers = {
  remembered: null,
  conceptConfused: null,
  academyHelped: null,
  needMore: '',
  selfErrorTypes: [],
};

function WrongItemCard({
  item, pagePhoto, selfCheck, errorTypes, points, locked, onSave,
}: {
  item: ItemReview;
  pagePhoto: Photo | null;
  selfCheck: SelfCheck | null;
  errorTypes: string[];
  points: number;
  locked: boolean;
  onSave: (a: Answers) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<Answers>(() =>
    selfCheck
      ? {
          remembered: selfCheck.q_remembered,
          conceptConfused: selfCheck.q_concept_confused,
          academyHelped: selfCheck.q_academy_helped,
          needMore: selfCheck.q_need_more || '',
          selfErrorTypes: selfCheck.self_error_types || [],
        }
      : DEFAULT_ANSWERS
  );

  const isDone = !!selfCheck;
  const canSave =
    answers.remembered !== null &&
    answers.conceptConfused !== null &&
    answers.academyHelped !== null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(answers);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between px-4 py-3 text-left ${isDone ? 'bg-success/10' : 'bg-card'}`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full text-base font-bold ${
              item.result === 'wrong'
                ? 'border-2 border-destructive bg-destructive/10 text-destructive'
                : 'border-2 border-warning bg-warning/10 text-warning'
            }`}
          >
            {item.result === 'wrong' ? 'X' : '△'}
          </div>
          <div>
            <p className="text-sm font-semibold">{item.item_number}번</p>
            <p className="text-[11px] text-muted-foreground">
              {item.score_earned ?? 0} / {points}점
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDone && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">완료 ✓</span>
          )}
          <span className="text-base text-muted-foreground">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-4">
          {pagePhoto?.signed_url && (
            <div className="mb-4">
              <p className="mb-1.5 text-xs text-muted-foreground">
                {item.page_number ?? 1}페이지 시험지
              </p>
              <img
                src={pagePhoto.signed_url}
                alt="시험지"
                className="w-full rounded-md border border-border"
                loading="lazy"
              />
            </div>
          )}

          {item.error_types?.length > 0 && (
            <div className="mb-4 rounded-md bg-primary/10 p-2.5">
              <p className="mb-1 text-[11px] font-semibold text-primary">선생님 분석</p>
              <div className="flex flex-wrap gap-1">
                {item.error_types.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-primary/30 bg-card px-2 py-0.5 text-[11px] text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
              {item.custom_reason && (
                <p className="mt-1.5 text-[11px] text-primary">💬 {item.custom_reason}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3.5">
            <YesNoQuestion
              label="이 문제, 배운 내용인데 기억이 났나요?"
              value={answers.remembered}
              disabled={locked}
              options={[
                { v: true, l: '네, 기억났어요', emoji: '🙆' },
                { v: false, l: '기억 안 났어요', emoji: '🙅' },
              ]}
              activeClass="border-success bg-success/10"
              onChange={(v) => setAnswers((a) => ({ ...a, remembered: v }))}
            />
            <YesNoQuestion
              label="개념이 헷갈렸나요?"
              value={answers.conceptConfused}
              disabled={locked}
              options={[
                { v: true, l: '헷갈렸어요', emoji: '😵' },
                { v: false, l: '알고있었어요', emoji: '😊' },
              ]}
              activeClass="border-warning bg-warning/10"
              onChange={(v) => setAnswers((a) => ({ ...a, conceptConfused: v }))}
            />
            <YesNoQuestion
              label="학원 수업에서 이 내용을 배웠나요?"
              value={answers.academyHelped}
              disabled={locked}
              options={[
                { v: true, l: '도움됐어요', emoji: '✅' },
                { v: false, l: '잘 모르겠어요', emoji: '❓' },
              ]}
              activeClass="border-primary bg-primary/10"
              onChange={(v) => setAnswers((a) => ({ ...a, academyHelped: v }))}
            />

            <div>
              <p className="mb-2 text-[13px] font-medium">내가 생각하는 실수 이유는?</p>
              <div className="flex flex-wrap gap-1.5">
                {errorTypes.map((type) => {
                  const active = answers.selfErrorTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        setAnswers((a) => ({
                          ...a,
                          selfErrorTypes: active
                            ? a.selfErrorTypes.filter((t) => t !== type)
                            : [...a.selfErrorTypes, type],
                        }))
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                        active
                          ? 'border-2 border-destructive bg-destructive/10 text-destructive'
                          : 'border border-border bg-card text-foreground'
                      } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">앞으로 더 공부하고 싶은 부분을 적어봐요</p>
              <textarea
                value={answers.needMore}
                onChange={(e) => setAnswers((a) => ({ ...a, needMore: e.target.value }))}
                placeholder="예) 인수분해 공식을 더 연습해야 할 것 같아요"
                rows={2}
                disabled={locked}
                className="w-full resize-none rounded-md border border-border bg-card p-2.5 text-xs"
              />
            </div>
          </div>

          {!locked && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="mt-3.5 w-full rounded-md bg-success px-3 py-2.5 text-[13px] font-semibold text-success-foreground transition disabled:opacity-50"
            >
              {saving ? '저장 중...' : '이 문항 저장'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function YesNoQuestion({
  label, value, options, activeClass, onChange, disabled,
}: {
  label: string;
  value: boolean | null;
  options: Array<{ v: boolean; l: string; emoji: string }>;
  activeClass: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">{label}</p>
      <div className="flex gap-2">
        {options.map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={String(opt.v)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.v)}
              className={`flex-1 rounded-md px-1 py-2 text-xs transition ${
                active ? `border-2 ${activeClass}` : 'border border-border bg-card'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {opt.emoji} {opt.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SelfCheckTab({
  reviewId, items, selfChecks: initialSelfChecks, templateErrorTypes,
  templateItems, photos, selfCheckCompleted: initialCompleted, onCompleted,
}: Props) {
  const [selfChecks, setSelfChecks] = useState<Record<number, SelfCheck>>(() => {
    const map: Record<number, SelfCheck> = {};
    for (const sc of initialSelfChecks) map[sc.item_number] = sc;
    return map;
  });
  const [completed, setCompleted] = useState(initialCompleted);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const map: Record<number, SelfCheck> = {};
    for (const sc of initialSelfChecks) map[sc.item_number] = sc;
    setSelfChecks(map);
    setCompleted(initialCompleted);
  }, [initialSelfChecks, initialCompleted, reviewId]);

  const wrongItems = useMemo(
    () => items.filter((i) => i.result === 'wrong' || i.result === 'partial'),
    [items]
  );

  const allChecked = wrongItems.length > 0 && wrongItems.every((i) => selfChecks[i.item_number]);

  const photoByPage = useMemo(() => {
    const map = new Map<number, Photo>();
    const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
    sorted.forEach((p, idx) => map.set(idx + 1, p));
    return map;
  }, [photos]);

  const pointsByItem = useMemo(() => {
    const map = new Map<number, number>();
    for (const i of templateItems || []) map.set(i.no, i.points || 0);
    return map;
  }, [templateItems]);

  const handleSaveItem = async (itemNumber: number, answers: Answers) => {
    const { error } = await studentApi.saveExamSelfCheck(reviewId, itemNumber, answers);
    if (error) {
      toast.error(error);
      return;
    }
    setSelfChecks((prev) => ({
      ...prev,
      [itemNumber]: {
        item_number: itemNumber,
        q_remembered: answers.remembered,
        q_concept_confused: answers.conceptConfused,
        q_academy_helped: answers.academyHelped,
        q_need_more: answers.needMore || null,
        self_error_types: answers.selfErrorTypes,
      },
    }));
    toast.success('저장됐어요');
  };

  const handleSubmitAll = async () => {
    if (!allChecked || completed) return;
    setSubmitting(true);
    const { data, error } = await studentApi.completeExamSelfCheck(reviewId);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    setCompleted(true);
    toast.success(`자가진단 완료! +${data?.points_awarded ?? 0}P 지급됐어요 🎉`);
    onCompleted();
  };

  if (wrongItems.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        틀린 문항이 없어요! 🎉
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 rounded-lg bg-primary/10 p-4">
        <p className="mb-1 text-sm font-semibold text-primary">
          틀린 문항을 하나씩 돌아봐요
        </p>
        <p className="text-xs text-primary/80">
          {completed
            ? '자가진단을 완료했어요. 답변은 수정할 수 없어요.'
            : '솔직하게 답할수록 더 도움이 돼요. 완료하면 포인트도 받을 수 있어요! 🎯'}
        </p>
      </div>

      {wrongItems.map((item) => (
        <WrongItemCard
          key={item.item_number}
          item={item}
          pagePhoto={photoByPage.get(item.page_number || 1) || null}
          selfCheck={selfChecks[item.item_number] || null}
          errorTypes={templateErrorTypes}
          points={pointsByItem.get(item.item_number) || 0}
          locked={completed}
          onSave={(a) => handleSaveItem(item.item_number, a)}
        />
      ))}

      {!completed && (
        <button
          type="button"
          onClick={handleSubmitAll}
          disabled={!allChecked || submitting}
          className={`mt-5 w-full rounded-lg px-4 py-3.5 text-[15px] font-bold text-white transition ${
            allChecked && !submitting
              ? 'cursor-pointer bg-success'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          }`}
        >
          {submitting ? '제출 중...' : '자가진단 완료 (+15P) 🎯'}
        </button>
      )}

      {completed && (
        <div className="mt-5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-center text-sm font-semibold text-success">
          ✓ 자가진단 완료
        </div>
      )}
    </div>
  );
}
