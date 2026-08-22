// DATA-QUALITY-ACK-V1 — 데이터 점검 '확인 완료' 기준선 비교 (순수 함수)
// 개인정보(이름/전화번호) 저장 금지: 원인 키는 해시 후 저장한다.
import type { DQFinding } from './dataQuality';

export interface DQAckRow {
  finding_id: string;
  acked_keys: string[];
  record_count: number;
  group_count: number;
  acked_by: string | null;
  acked_at: string;
}

/** 안정적이지만 원문을 복원할 수 없는 짧은 서명 (djb2 → base36). */
export function signKey(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  let h2 = 52711;
  for (let i = key.length - 1; i >= 0; i--) h2 = ((h2 << 5) + h2 + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export interface DQFindingStatus {
  finding: DQFinding;
  /** 이번 조회에서 새로 발견된(미확인) 레코드 수 */
  newCount: number;
  /** 미확인 원인 서명 목록 */
  newKeys: string[];
  /** 기준선에 이미 포함된 레코드 수 */
  ackedCount: number;
  ackedAt: string | null;
  ackedBy: string | null;
}

export function diffFindings(findings: DQFinding[], acks: DQAckRow[]): DQFindingStatus[] {
  const byId = new Map(acks.map((a) => [a.finding_id, a]));
  return findings.map((finding) => {
    const ack = byId.get(finding.id);
    const acked = new Set(ack?.acked_keys || []);
    const signed = finding.groupKeys.map(signKey);
    const newKeys = signed.filter((k) => !acked.has(k));
    // 키가 없는 유형(집계형)은 건수 증가분으로 판정
    const countFallback = Math.max(0, finding.recordCount - (ack?.record_count ?? 0));
    const newCount = finding.groupKeys.length > 0 ? newKeys.length : countFallback;
    return {
      finding,
      newCount,
      newKeys,
      ackedCount: Math.max(0, finding.recordCount - newCount),
      ackedAt: ack?.acked_at || null,
      ackedBy: ack?.acked_by || null,
    };
  });
}

/** 현재 조회 결과 전체를 확인 완료로 저장할 upsert payload. */
export function buildAckPayload(findings: DQFinding[], userId: string | null, now: string) {
  return findings.map((f) => ({
    finding_id: f.id,
    acked_keys: f.groupKeys.map(signKey),
    record_count: f.recordCount,
    group_count: f.groupCount,
    acked_by: userId,
    acked_at: now,
  }));
}

export const totalNewCount = (list: DQFindingStatus[]) =>
  list.reduce((s, x) => s + x.newCount, 0);

export const lastCheckedAt = (acks: DQAckRow[]): string | null =>
  acks.reduce<string | null>((max, a) => (!max || a.acked_at > max ? a.acked_at : max), null);

/** KST 표기 (YYYY-MM-DD HH:mm) */
export function kstLabel(iso: string | null): string {
  if (!iso) return '기록 없음';
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} KST`;
}
