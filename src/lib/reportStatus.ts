// REPORT-STATUS-CLARITY-V1
// 주간 리포트의 '작성(생성) 상태'와 '발송 상태'를 분리해 판정하는 순수 함수 모음.
// 저장 구조/저장 로직은 전혀 바꾸지 않고, 표시 판정만 담당한다.

export interface ReportLike {
  id?: string;
  student_id?: string;
  week_start?: string;
  total_lessons?: number | null;
  student_message?: string | null;
  parent_message?: string | null;
  report_quality_tag?: string | null;
  parent_visible?: boolean | null;
  student_sent_status?: string | null;
  parent_sent_status?: string | null;
  student_sent_at?: string | null;
  parent_sent_at?: string | null;
  generated_at?: string | null;
  subject_breakdown?: unknown;
}

/** 작성(생성) 상태 — 발송 여부와 무관하다. */
export type WriteStatus =
  | 'zero_lessons' // 대상 수업 0건 (자동 집계 근거 없음)
  | 'needs_review' // RED 품질 또는 필수 메시지 빈값 → 사람 검수 필요
  | 'ready' // 검수 통과 후보 (비공개 초안)
  | 'published'; // parent_visible = true (학부모 화면 노출됨)

const isBlank = (v?: string | null) => !v || v.trim().length === 0;

export function getWriteStatus(r: ReportLike): WriteStatus {
  if ((r.total_lessons ?? 0) === 0) return 'zero_lessons';
  if (r.report_quality_tag === 'RED') return 'needs_review';
  if (isBlank(r.student_message) || isBlank(r.parent_message)) return 'needs_review';
  if (r.parent_visible) return 'published';
  return 'ready';
}

export const WRITE_STATUS_LABEL: Record<WriteStatus, string> = {
  zero_lessons: '수업 0건',
  needs_review: '검수 필요',
  ready: '검수 완료 대기(비공개 초안)',
  published: '학부모 공개됨',
};

/** 발송 상태 — 스키마에 실제 근거가 있을 때만 '발송됨'으로 본다. */
export type DeliveryStatus = 'sent' | 'partial' | 'failed' | 'unknown';

export interface DeliveryInfo {
  status: DeliveryStatus;
  label: string;
  /** 어떤 컬럼을 근거로 판정했는지 (UI 툴팁용) */
  evidence: string;
}

export function getDeliveryStatus(r: ReportLike): DeliveryInfo {
  const s = r.student_sent_status;
  const p = r.parent_sent_status;
  const hasTimestamp = !!r.student_sent_at || !!r.parent_sent_at;
  const sentCount = [s, p].filter((v) => v === 'sent').length;
  const failed = s === 'failed' || p === 'failed';

  if (sentCount === 2) {
    return { status: 'sent', label: '발송됨', evidence: 'student_sent_status/parent_sent_status = sent' };
  }
  if (sentCount === 1) {
    return { status: 'partial', label: '일부만 발송됨', evidence: 'sent_status 중 1개만 sent' };
  }
  if (failed) {
    return { status: 'failed', label: '발송 실패 기록', evidence: 'sent_status = failed' };
  }
  if (hasTimestamp) {
    return { status: 'partial', label: '발송 시각만 기록됨', evidence: 'sent_at 값 존재 (status는 draft)' };
  }
  return {
    status: 'unknown',
    label: '발송 여부 확인 불가',
    evidence: '발송 상태 컬럼이 모두 draft/빈값 — 작성 완료는 발송 완료가 아님',
  };
}

/** 학부모 공개(parent_visible)는 발송이 아니라 '포털 노출' 근거임을 명시 */
export function getPublishInfo(r: ReportLike): { published: boolean; label: string } {
  return r.parent_visible
    ? { published: true, label: '학부모 포털 공개됨' }
    : { published: false, label: '비공개' };
}

export interface WeekSummary {
  /** 대상 학생 수 (활성 학생) */
  target: number;
  /** 생성된 리포트 수 */
  generated: number;
  /** 미생성 = target - generated (음수 없음) */
  missing: number;
  /** 검수 필요 */
  needsReview: number;
  /** 발송 가능(=공개 가능) 후보: 검수 통과 & 미공개 */
  sendable: number;
  /** 이미 공개됨 */
  published: number;
  /** 주의: 수업 0건 */
  caution: number;
  /** 발송 근거가 확인된 건수 */
  deliveryConfirmed: number;
  /** 최근 생성일 */
  lastGeneratedAt: string | null;
}

export function summarizeWeek(reports: ReportLike[], targetCount: number): WeekSummary {
  let needsReview = 0;
  let sendable = 0;
  let published = 0;
  let caution = 0;
  let deliveryConfirmed = 0;
  let lastGeneratedAt: string | null = null;

  for (const r of reports) {
    switch (getWriteStatus(r)) {
      case 'zero_lessons':
        caution++;
        break;
      case 'needs_review':
        needsReview++;
        break;
      case 'ready':
        sendable++;
        break;
      case 'published':
        published++;
        break;
    }
    if (getDeliveryStatus(r).status !== 'unknown') deliveryConfirmed++;
    if (r.generated_at && (!lastGeneratedAt || r.generated_at > lastGeneratedAt)) {
      lastGeneratedAt = r.generated_at;
    }
  }

  const generated = reports.length;
  return {
    target: targetCount,
    generated,
    missing: Math.max(0, targetCount - generated),
    needsReview,
    sendable,
    published,
    caution,
    deliveryConfirmed,
    lastGeneratedAt,
  };
}

/** 검수 필요 목록에서 현재 항목 다음 대상 반환 (없으면 null) */
export function nextNeedsReview<T extends ReportLike>(reports: T[], currentId?: string | null): T | null {
  const queue = reports.filter((r) => getWriteStatus(r) === 'needs_review');
  if (queue.length === 0) return null;
  if (!currentId) return queue[0];
  const idx = queue.findIndex((r) => r.id === currentId);
  if (idx === -1) return queue[0];
  return queue[(idx + 1) % queue.length] ?? null;
}

/** 부분 실패 집계: 학생별 성공/실패를 분리해 보고 */
export interface BatchOutcome {
  student_id?: string;
  student_name?: string;
  ok: boolean;
  message?: string | null;
}

export function splitBatchOutcome(outcomes: BatchOutcome[]) {
  const success = outcomes.filter((o) => o.ok);
  const failed = outcomes.filter((o) => !o.ok);
  return {
    successCount: success.length,
    failedCount: failed.length,
    successNames: success.map((o) => o.student_name).filter(Boolean) as string[],
    failedNames: failed.map((o) => o.student_name).filter(Boolean) as string[],
    partial: success.length > 0 && failed.length > 0,
  };
}

/** 데이터 출처 구분 (표시 전용) */
export type SourceKind = 'auto' | 'manual' | 'ops';
export const SOURCE_LABEL: Record<SourceKind, string> = {
  auto: '자동 집계',
  manual: '직접 작성',
  ops: '운영 상태',
};
