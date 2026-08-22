// REPORT-DELIVERY-CONFIRM-V1
// 주간 리포트 '수동 발송 확인' 추적용 순수 로직.
// 실제 메시지 전송 기능은 여기에 존재하지 않는다. 외부(카카오톡/문자/전화)로 보낸 사실을
// 사람이 기록하는 감사 이력만 다룬다.

export type DeliveryEventStatus = 'confirmed' | 'failed' | 'revoked';
export type DeliveryChannel = 'kakao' | 'sms' | 'call' | 'other';

export interface DeliveryEvent {
  id: string;
  report_id: string;
  status: DeliveryEventStatus;
  channel: DeliveryChannel;
  note?: string | null;
  actor_id: string;
  created_at: string;
}

export const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  kakao: '카카오톡',
  sms: '문자',
  call: '전화 전달',
  other: '기타',
};

export const EVENT_STATUS_LABEL: Record<DeliveryEventStatus, string> = {
  confirmed: '발송 확인됨',
  failed: '발송 실패 기록',
  revoked: '확인 취소·정정됨',
};

/** 카드에 표시할 최종 발송 확인 상태 */
export type ConfirmState = 'unconfirmed' | 'confirmed' | 'failed';

export interface ConfirmSummary {
  state: ConfirmState;
  label: string;
  /** 최종 판정 근거가 된 이벤트 (없으면 null) */
  last: DeliveryEvent | null;
  /** 전체 이력 수 */
  historyCount: number;
}

/** append-only 이력에서 마지막 이벤트로 현재 상태를 판정한다 (덮어쓰기/삭제 없음). */
export function summarizeEvents(events: DeliveryEvent[]): ConfirmSummary {
  const sorted = [...events].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const last = sorted[0] ?? null;
  if (!last) {
    return { state: 'unconfirmed', label: '발송 확인 없음', last: null, historyCount: 0 };
  }
  const state: ConfirmState =
    last.status === 'confirmed' ? 'confirmed' : last.status === 'failed' ? 'failed' : 'unconfirmed';
  const label =
    state === 'confirmed' ? '발송 확인됨' : state === 'failed' ? '발송 실패 기록' : '발송 확인 없음(정정됨)';
  return { state, label, last, historyCount: sorted.length };
}

export interface EligibilityInput {
  parent_visible?: boolean | null;
  parent_message?: string | null;
  student_message?: string | null;
  total_lessons?: number | null;
}

export interface Eligibility {
  /** 발송 확인 기록 가능 여부 */
  allowed: boolean;
  /** 차단 사유 (allowed=false 일 때) */
  blockers: string[];
  /** 기록은 가능하지만 확인 대화상자에서 보여줄 주의 */
  cautions: string[];
}

export function getConfirmEligibility(r: EligibilityInput): Eligibility {
  const blockers: string[] = [];
  const cautions: string[] = [];
  if (!r.parent_visible) blockers.push('학부모 공개 상태가 아닙니다 (공개 후 기록 가능)');
  if (!r.parent_message || !r.parent_message.trim()) blockers.push('학부모 메시지가 비어 있습니다');
  if (!r.student_message || !r.student_message.trim()) blockers.push('학생 메시지가 비어 있습니다');
  if ((r.total_lessons ?? 0) === 0) cautions.push('이 주차 대상 수업이 0건입니다');
  return { allowed: blockers.length === 0, blockers, cautions };
}

/**
 * 중복 클릭·네트워크 재시도로 같은 기록이 두 번 저장되지 않도록 하는 키.
 * 같은 리포트·상태·채널·행위자에 대해 동일 분(minute) 안의 재시도는 같은 키가 된다.
 */
export function buildIdempotencyKey(
  reportId: string,
  status: DeliveryEventStatus,
  channel: DeliveryChannel,
  actorId: string,
  at: Date = new Date()
): string {
  const bucket = at.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
  return `${reportId}:${status}:${channel}:${actorId}:${bucket}`;
}

/** 노트에 개인정보(전화번호/메시지 본문)가 들어갔는지 가벼운 방어 */
export function containsPersonalData(note: string): boolean {
  if (!note) return false;
  return /\d{2,4}[- ]?\d{3,4}[- ]?\d{4}/.test(note) || note.length > 200;
}

/** 주차/그룹 단위 발송 확인 집계 (표시 전용) */
export interface DeliveryCounts {
  target: number;
  confirmed: number;
  failed: number;
  unconfirmed: number;
}

export function countConfirmations(
  reportIds: string[],
  eventsByReport: Record<string, DeliveryEvent[]>
): DeliveryCounts {
  let confirmed = 0;
  let failed = 0;
  for (const id of reportIds) {
    const s = summarizeEvents(eventsByReport[id] || []);
    if (s.state === 'confirmed') confirmed++;
    else if (s.state === 'failed') failed++;
  }
  return {
    target: reportIds.length,
    confirmed,
    failed,
    unconfirmed: reportIds.length - confirmed - failed,
  };
}
