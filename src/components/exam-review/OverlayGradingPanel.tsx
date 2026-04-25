import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Maximize2, PenSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PhotoThumb } from '@/components/exam-review/PhotoThumb';

type ItemResult = 'correct' | 'wrong' | 'partial' | '';

export interface OverlayTemplateItem {
  no: number;
  type: '객관식' | '주관식';
  points: number;
  is_essay: boolean;
}

export interface OverlayTemplateData {
  id: string;
  total_items: number;
  items: OverlayTemplateItem[];
  error_types: string[];
}

export interface OverlayPhoto {
  id: string;
  storage_path: string;
  sort_order: number;
  signedUrl?: string | null;
}

export interface OverlayReviewItem {
  id?: string;
  item_number: number;
  result: ItemResult;
  error_types: string[];
  item_comment: string;
  score_earned: number | null;
  is_essay: boolean;
  custom_reason: string;
  overlay_x: number | null;
  overlay_y: number | null;
  page_number: number | null;
}

interface ActiveOverlayItem {
  id?: string;
  item_number: number;
  overlay_x: number;
  overlay_y: number;
  page_number: number;
  is_essay: boolean;
  points: number;
}

interface OverlaySavePayload {
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
}

interface QuickGradeItem extends ActiveOverlayItem {
  result: ItemResult;
  score_earned: number | null;
  error_types: string[];
  custom_reason: string;
}

interface OverlayGradingPanelProps {
  photos: OverlayPhoto[];
  photoUrls: Record<string, string>;
  template: OverlayTemplateData | null;
  templateLoading: boolean;
  items: OverlayReviewItem[];
  saving: boolean;
  onSaveItem: (payload: OverlaySavePayload) => Promise<void>;
  onOpenTemplateSetup: () => void;
}

const RESULT_STYLES: Record<Exclude<ItemResult, ''>, { label: string; container: string; button: string }> = {
  correct: {
    label: 'O',
    container: 'bg-[hsl(var(--review-correct-surface))] border-[hsl(var(--review-correct-border))] text-[hsl(var(--review-correct-foreground))]',
    button: 'bg-[hsl(var(--review-correct-surface))] border-[hsl(var(--review-correct-border))] text-[hsl(var(--review-correct-foreground))]',
  },
  wrong: {
    label: 'X',
    container: 'bg-[hsl(var(--review-wrong-surface))] border-[hsl(var(--review-wrong-border))] text-[hsl(var(--review-wrong-foreground))]',
    button: 'bg-[hsl(var(--review-wrong-surface))] border-[hsl(var(--review-wrong-border))] text-[hsl(var(--review-wrong-foreground))]',
  },
  partial: {
    label: '△',
    container: 'bg-[hsl(var(--review-partial-surface))] border-[hsl(var(--review-partial-border))] text-[hsl(var(--review-partial-foreground))]',
    button: 'bg-[hsl(var(--review-partial-surface))] border-[hsl(var(--review-partial-border))] text-[hsl(var(--review-partial-foreground))]',
  },
};

function clampScore(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, max));
}

function calcTotal(items: OverlayTemplateItem[]) {
  return Math.round(items.reduce((sum, item) => sum + (item.points || 0), 0) * 100) / 100;
}

function displayScore(score: number) {
  if (!Number.isFinite(score)) return '0';
  const rounded = Math.round(score * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${Math.round(rounded * 10) / 10}`;
}

function ResultBadge({ result, no, onClick }: { result: Exclude<ItemResult, ''>; no: number; onClick: () => void }) {
  const style = RESULT_STYLES[result];
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 flex-col items-center justify-center rounded-full border-2 text-[8px] font-bold shadow-sm transition hover:scale-105 ${style.container}`}
      aria-label={`${no}번 문항 수정`}
    >
      <span className="text-[14px] leading-none">{style.label}</span>
      <span className="leading-none">{no}</span>
    </button>
  );
}

function QuickGradeStrip({
  items,
  saving,
  onEdit,
  onQuickGrade,
}: {
  items: QuickGradeItem[];
  saving: boolean;
  onEdit: (item: QuickGradeItem) => void;
  onQuickGrade: (item: QuickGradeItem, result: Exclude<ItemResult, ''>) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
        시험지를 클릭해 문항 위치를 찍으면 아래에서 바로 O / X / △ 채점할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">현재 페이지 문항</p>
        <p className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">O / X / △ 누르면 즉시 저장</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const activeStyle = item.result ? RESULT_STYLES[item.result as Exclude<ItemResult, ''>] : null;
          return (
            <div
              key={`${item.item_number}-${item.page_number}`}
              className={`shrink-0 rounded-lg border p-2 ${activeStyle ? activeStyle.container : 'border-border bg-muted/20 text-foreground'}`}
            >
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="mb-2 flex w-full items-center justify-center gap-1 text-xs font-bold hover:opacity-80"
              >
                <span>{item.item_number}번</span>
                {item.result ? <span className="text-sm">{RESULT_STYLES[item.result as Exclude<ItemResult, ''>].label}</span> : null}
              </button>
              <div className="grid grid-cols-3 gap-1">
                {(Object.entries(RESULT_STYLES) as Array<[Exclude<ItemResult, ''>, (typeof RESULT_STYLES)[Exclude<ItemResult, ''>]]>).map(([value, style]) => {
                  const active = item.result === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onQuickGrade(item, value)}
                      disabled={saving}
                      className={`flex h-11 w-11 items-center justify-center rounded-md border text-lg font-bold transition hover:scale-105 disabled:opacity-50 ${active ? style.button + ' border-2' : 'border-[hsl(var(--review-idle-border))] bg-[hsl(var(--review-idle-surface))] text-[hsl(var(--review-idle-foreground))]'}`}
                      aria-label={`${item.item_number}번 ${style.label}로 채점`}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ScoreSummaryPanel({ items, template }: { items: OverlayReviewItem[]; template: OverlayTemplateData }) {
  const summary = useMemo(() => {
    const scoredItems = items.filter((item) => item.result);
    const correct = scoredItems.filter((item) => item.result === 'correct').length;
    const wrong = scoredItems.filter((item) => item.result === 'wrong').length;
    const partial = scoredItems.filter((item) => item.result === 'partial').length;
    const earned = Math.round(scoredItems.reduce((sum, item) => sum + (item.score_earned ?? 0), 0) * 100) / 100;
    const total = calcTotal(template.items);
    const remaining = template.items.filter((templateItem) => !scoredItems.some((item) => item.item_number === templateItem.no));
    return { correct, wrong, partial, earned, total, remaining };
  }, [items, template]);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-sm font-semibold text-foreground">채점 요약</div>
        <div className="mt-1 text-xs text-muted-foreground">문항을 클릭할 때마다 점수와 위치가 저장됩니다.</div>
      </div>

      <div className="rounded-lg border border-[hsl(var(--review-progress-border))] bg-[hsl(var(--review-progress-surface))] p-4">
        <div className="text-xs text-muted-foreground">획득 점수</div>
        <div className="mt-1 text-2xl font-bold text-foreground">
          {displayScore(summary.earned)}
          <span className="ml-1 text-sm font-medium text-muted-foreground">/ {displayScore(summary.total)}점</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border border-[hsl(var(--review-correct-border))] bg-[hsl(var(--review-correct-surface))] p-3 text-[hsl(var(--review-correct-foreground))]">
          <div className="text-lg font-bold">{summary.correct}</div>
          <div>정답</div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--review-wrong-border))] bg-[hsl(var(--review-wrong-surface))] p-3 text-[hsl(var(--review-wrong-foreground))]">
          <div className="text-lg font-bold">{summary.wrong}</div>
          <div>오답</div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--review-partial-border))] bg-[hsl(var(--review-partial-surface))] p-3 text-[hsl(var(--review-partial-foreground))]">
          <div className="text-lg font-bold">{summary.partial}</div>
          <div>부분</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-foreground">남은 문항</div>
        {summary.remaining.length === 0 ? (
          <div className="rounded-lg border border-[hsl(var(--review-correct-border))] bg-[hsl(var(--review-correct-surface))] px-3 py-2 text-sm text-[hsl(var(--review-correct-foreground))]">
            모든 문항 채점 완료
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {summary.remaining.map((item) => (
              <span key={item.no} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground">
                {item.no}번
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


export function OverlayGradingPanel({
  photos,
  photoUrls,
  template,
  templateLoading,
  items,
  saving,
  onSaveItem,
  onOpenTemplateSetup,
}: OverlayGradingPanelProps) {
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [activeItem, setActiveItem] = useState<ActiveOverlayItem | null>(null);
  const [result, setResult] = useState<Exclude<ItemResult, ''> | ''>('');
  const [earnedScore, setEarnedScore] = useState(0);
  const [errorTypes, setErrorTypes] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState('');
  const [expandedOpen, setExpandedOpen] = useState(false);

  const currentPhoto = photos[page] ?? null;
  const currentPhotoUrl = currentPhoto ? photoUrls[currentPhoto.storage_path] ?? '' : '';

  const pageItems = useMemo(
    () => items.filter((item) => item.result && item.page_number === page + 1 && item.overlay_x != null && item.overlay_y != null),
    [items, page],
  );

  const quickGradeItems = useMemo<QuickGradeItem[]>(() => {
    if (!template) return [];
    const positionedItems = items
      .filter((item) => item.page_number === page + 1 && item.overlay_x != null && item.overlay_y != null)
      .map((item) => {
        const templateItem = template.items.find((source) => source.no === item.item_number);
        return {
          id: item.id,
          item_number: item.item_number,
          overlay_x: item.overlay_x ?? 0,
          overlay_y: item.overlay_y ?? 0,
          page_number: item.page_number ?? page + 1,
          is_essay: item.is_essay,
          points: templateItem?.points ?? 0,
          result: item.result,
          score_earned: item.score_earned,
          error_types: item.error_types,
          custom_reason: item.custom_reason,
        } satisfies QuickGradeItem;
      });

    return positionedItems.sort((a, b) => a.item_number - b.item_number);
  }, [items, page, template]);

  const openEditor = (item: OverlayReviewItem | QuickGradeItem) => {
    if (item.overlay_x == null || item.overlay_y == null || item.page_number == null || !item.result) return;
    const points = template?.items.find((templateItem) => templateItem.no === item.item_number)?.points ?? 0;
    setActiveItem({
      id: item.id,
      item_number: item.item_number,
      overlay_x: item.overlay_x,
      overlay_y: item.overlay_y,
      page_number: item.page_number,
      is_essay: item.is_essay,
      points,
    });
    setResult(item.result);
    setEarnedScore(clampScore(item.score_earned ?? points, points));
    setErrorTypes(item.error_types);
    setCustomReason(item.custom_reason);
  };

  const resetEditor = () => {
    setActiveItem(null);
    setResult('');
    setEarnedScore(0);
    setErrorTypes([]);
    setCustomReason('');
  };

  const handleImageClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!template) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const nextUnscored = template.items.find((templateItem) => !items.some((item) => item.item_number === templateItem.no && item.result));
    if (!nextUnscored) return;

    setActiveItem({
      item_number: nextUnscored.no,
      overlay_x: x,
      overlay_y: y,
      page_number: page + 1,
      is_essay: nextUnscored.is_essay,
      points: nextUnscored.points,
    });
    setResult('');
    setEarnedScore(nextUnscored.is_essay ? nextUnscored.points : 0);
    setErrorTypes([]);
    setCustomReason('');
  };

  const handleToggleError = (value: string) => {
    setErrorTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const handleSave = async () => {
    if (!activeItem || !result) return;
    const nextScore = activeItem.is_essay
      ? clampScore(earnedScore, activeItem.points)
      : result === 'correct'
        ? activeItem.points
        : 0;

    await onSaveItem({
      id: activeItem.id,
      item_number: activeItem.item_number,
      result,
      score_earned: nextScore,
      is_essay: activeItem.is_essay,
      error_types: result === 'correct' ? [] : errorTypes,
      custom_reason: result === 'correct' ? '' : customReason.trim(),
      overlay_x: activeItem.overlay_x,
      overlay_y: activeItem.overlay_y,
      page_number: activeItem.page_number,
    });

    resetEditor();
  };

  const handleQuickGrade = async (item: QuickGradeItem, nextResult: Exclude<ItemResult, ''>) => {
    const nextScore = item.is_essay
      ? nextResult === 'correct'
        ? item.points
        : nextResult === 'partial'
          ? clampScore(item.score_earned ?? Math.round((item.points / 2) * 100) / 100, item.points)
          : 0
      : nextResult === 'correct'
        ? item.points
        : 0;

    await onSaveItem({
      id: item.id,
      item_number: item.item_number,
      result: nextResult,
      score_earned: nextScore,
      is_essay: item.is_essay,
      error_types: nextResult === 'correct' ? [] : item.error_types,
      custom_reason: nextResult === 'correct' ? '' : item.custom_reason,
      overlay_x: item.overlay_x,
      overlay_y: item.overlay_y,
      page_number: item.page_number,
    });
  };

  const popupStyle = useMemo<React.CSSProperties | null>(() => {
    if (!activeItem) return null;
    const fromRight = activeItem.overlay_x > 60;
    const fromBottom = activeItem.overlay_y > 60;
    return {
      left: fromRight ? 'auto' : `${activeItem.overlay_x}%`,
      right: fromRight ? `${100 - activeItem.overlay_x}%` : 'auto',
      top: fromBottom ? 'auto' : `${activeItem.overlay_y}%`,
      bottom: fromBottom ? `${100 - activeItem.overlay_y}%` : 'auto',
      maxWidth: 'min(280px, calc(100% - 16px))',
    };
  }, [activeItem]);

  const renderActiveEditor = () => activeItem ? (
    <div
      className="absolute z-20 min-w-[220px] rounded-[10px] border border-border bg-card p-3 shadow-lg"
      style={popupStyle ?? undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-foreground">
          {activeItem.item_number}번 ({displayScore(activeItem.points)}점)
        </p>
        <PenSquare className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="mb-3 flex gap-1.5">
        {(Object.entries(RESULT_STYLES) as Array<[Exclude<ItemResult, ''>, (typeof RESULT_STYLES)[Exclude<ItemResult, ''>]]>).map(([value, style]) => {
          const active = result === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setResult(value)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-lg font-bold transition ${active ? style.button + ' border-2' : 'border-[hsl(var(--review-idle-border))] bg-[hsl(var(--review-idle-surface))] text-[hsl(var(--review-idle-foreground))]'}`}
            >
              {style.label}
            </button>
          );
        })}
      </div>

      {activeItem.is_essay ? (
        <div className="mb-3">
          <label className="mb-1 block text-[11px] text-muted-foreground">획득 점수</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={activeItem.points}
              value={earnedScore}
              onChange={(event) => setEarnedScore(clampScore(Number(event.target.value), activeItem.points))}
              className="h-8 w-20 px-2 text-sm"
            />
            <span className="text-[11px] text-muted-foreground">/ {displayScore(activeItem.points)}점</span>
          </div>
        </div>
      ) : null}

      {result === 'wrong' || result === 'partial' ? (
        <div className="mb-3 space-y-1.5 rounded-md bg-muted/40 p-2">
          {template.error_types.map((type) => (
            type === '기타(직접입력)' ? (
              <Input
                key={type}
                placeholder="직접 입력..."
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                className="h-8 text-xs"
              />
            ) : (
              <label key={type} className="flex items-center gap-2 text-[11px] text-foreground">
                <Checkbox checked={errorTypes.includes(type)} onCheckedChange={() => handleToggleError(type)} />
                <span>{type}</span>
              </label>
            )
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={resetEditor} disabled={saving}>
          취소
        </Button>
        <Button type="button" size="sm" className="flex-1" onClick={() => void handleSave()} disabled={!result || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '확인'}
        </Button>
      </div>
    </div>
  ) : null;


  if (templateLoading) {
    return (
      <div className="flex min-h-[32rem] items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-foreground">템플릿을 먼저 설정해주세요</div>
              <div className="mt-1 text-sm text-muted-foreground">문항 수와 배점이 있어야 시험지 사진 위에 직접 채점할 수 있습니다.</div>
            </div>
            <Button type="button" variant="outline" onClick={onOpenTemplateSetup}>
              템플릿 설정 열기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col gap-5 xl:flex-row">
      <div className="min-w-0 flex-[2]">
        <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
          <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0}>
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          <span className="min-w-[88px] text-center text-sm font-medium">
            {photos.length === 0 ? '0 / 0페이지' : `${page + 1} / ${photos.length}페이지`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.min(photos.length - 1, prev + 1))}
            disabled={photos.length === 0 || page === photos.length - 1}
          >
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div ref={imageContainerRef} className="relative overflow-hidden rounded-lg border border-border bg-card">
          {currentPhotoUrl ? (
            <>
              <img src={currentPhotoUrl} alt={`시험지 ${page + 1}`} className="block w-full rounded-lg" />
              <Button type="button" variant="secondary" size="sm" className="absolute right-3 top-3 z-30 shadow-sm" onClick={() => setExpandedOpen(true)}>
                <Maximize2 className="h-4 w-4" /> 크게 채점
              </Button>

              {pageItems.map((item) => (
                <div
                  key={`${item.item_number}-${item.page_number}`}
                  className="absolute z-10"
                  style={{ left: `${item.overlay_x}%`, top: `${item.overlay_y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <ResultBadge result={item.result as Exclude<ItemResult, ''>} no={item.item_number} onClick={() => openEditor(item)} />
                </div>
              ))}

              <button type="button" className="absolute inset-0 cursor-crosshair" onClick={handleImageClick} aria-label="시험지 위치에 채점 마커 추가" />

              {renderActiveEditor()}
            </>
          ) : currentPhoto ? (
            <>
              <PhotoThumb
                storagePath={currentPhoto.storage_path}
                signedUrl={currentPhoto.signedUrl ?? null}
                alt={`시험지 ${page + 1}`}
                fit="contain"
                className="min-h-[28rem]"
                imageClassName="block w-full rounded-lg"
              />
              <Button type="button" variant="secondary" size="sm" className="absolute right-3 top-3 z-30 shadow-sm" onClick={() => setExpandedOpen(true)}>
                <Maximize2 className="h-4 w-4" /> 크게 채점
              </Button>

              {pageItems.map((item) => (
                <div
                  key={`${item.item_number}-${item.page_number}`}
                  className="absolute z-10"
                  style={{ left: `${item.overlay_x}%`, top: `${item.overlay_y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <ResultBadge result={item.result as Exclude<ItemResult, ''>} no={item.item_number} onClick={() => openEditor(item)} />
                </div>
              ))}

              <button type="button" className="absolute inset-0 cursor-crosshair" onClick={handleImageClick} aria-label="시험지 위치에 채점 마커 추가" />

              {renderActiveEditor()}
            </>
          ) : photos.length === 0 ? (
            <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">등록된 시험지 사진이 없습니다.</div>
          ) : (
            <div className="flex min-h-[28rem] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              시험지 이미지를 불러오는 중입니다.
            </div>
          )}
        </div>

        <QuickGradeStrip
          items={quickGradeItems}
          saving={saving}
          onEdit={openEditor}
          onQuickGrade={(item, nextResult) => void handleQuickGrade(item, nextResult)}
        />
      </div>

      <div className="w-full xl:max-w-[320px] xl:flex-1">
        <ScoreSummaryPanel items={items} template={template} />
        <div className="mt-3 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-[hsl(var(--review-done-badge))]" />
            <p>사진을 클릭하면 다음 미채점 문항이 자동 배정되고, 기존 마커를 누르면 해당 문항을 다시 수정할 수 있습니다.</p>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={expandedOpen} onOpenChange={setExpandedOpen}>
      <DialogContent className="max-h-[96vh] max-w-[96vw] overflow-y-auto p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pr-8">
          <div className="text-sm font-semibold text-foreground">큰 시험지 채점 · {photos.length === 0 ? '0 / 0페이지' : `${page + 1} / ${photos.length}페이지`}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" /> 이전
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.min(photos.length - 1, prev + 1))} disabled={photos.length === 0 || page === photos.length - 1}>
              다음 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-lg border border-border bg-card">
          {currentPhotoUrl ? (
            <img src={currentPhotoUrl} alt={`시험지 ${page + 1}`} className="block max-h-[74vh] w-full object-contain" />
          ) : currentPhoto ? (
            <PhotoThumb storagePath={currentPhoto.storage_path} signedUrl={currentPhoto.signedUrl ?? null} alt={`시험지 ${page + 1}`} fit="contain" className="min-h-[70vh]" imageClassName="block max-h-[74vh] w-full object-contain" />
          ) : (
            <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted-foreground">등록된 시험지 사진이 없습니다.</div>
          )}
          {pageItems.map((item) => (
            <div key={`expanded-${item.item_number}-${item.page_number}`} className="absolute z-10" style={{ left: `${item.overlay_x}%`, top: `${item.overlay_y}%`, transform: 'translate(-50%, -50%)' }}>
              <ResultBadge result={item.result as Exclude<ItemResult, ''>} no={item.item_number} onClick={() => openEditor(item)} />
            </div>
          ))}
          {currentPhoto ? <button type="button" className="absolute inset-0 cursor-crosshair" onClick={handleImageClick} aria-label="큰 시험지 위치에 채점 마커 추가" /> : null}
          {renderActiveEditor()}
        </div>
        <QuickGradeStrip items={quickGradeItems} saving={saving} onEdit={openEditor} onQuickGrade={(item, nextResult) => void handleQuickGrade(item, nextResult)} />
      </DialogContent>
    </Dialog>
    </>
  );
}
