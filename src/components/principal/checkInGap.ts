// CHECKIN-GAP-V1 — '수업출결·입실 태그 차이' 판정 (순수 함수, 조회/저장 없음)
//
// 대상(모두 만족해야 함)
// - 수업이 종료된 뒤의 기록만 (unclosedScope.filterFinishedRecords로 사전 필터)
// - lesson_records.submitted = true (마감 완료)
// - 수업출결이 출석 취급(정상등원/지각/조퇴 및 레거시 출석값) — 결석·보충불가는 제외
//
// 분류 (반·수업일 단위)
// - untagged: 그 반·그날 대상 학생 중 입실 태그가 단 한 명도 없음 → '입실 태그 미사용 수업'(정보성)
// - partial : 일부는 태그가 있는데 대상 학생 일부만 없음 → '입실 태그 부분 누락'(행동 필요)
// 단위: untagged는 '수업(반·날짜)' 수, partial은 '명' 수.

import { isPresent } from '@/lib/attendance';

export interface CheckInRecordInput {
  class_id: string | null;
  student_id: string | null;
  lesson_date: string;
  submitted: boolean | null;
  attendance_status: string[] | null;
}

export interface CheckInGapGroup {
  key: string;
  classId: string;
  date: string;
  /** 판정 대상(출석 처리 + 마감 완료) 인원 */
  target: number;
  /** 그중 입실 태그가 있는 인원 */
  taggedCount: number;
  /** 태그 누락 인원 */
  missing: number;
}

export interface CheckInGapResult {
  /** 부분 누락 반·날짜 (행동 카드) */
  partial: CheckInGapGroup[];
  /** 반 전체 태그 미사용 반·날짜 (정보성) */
  untagged: CheckInGapGroup[];
  /** 부분 누락 인원 합계 */
  partialStudents: number;
  /** 태그 미사용 수업 수 */
  untaggedClassDays: number;
  /** 태그 미사용 수업에 포함된 학생 수 (참고용) */
  untaggedStudents: number;
}

/**
 * @param records 이미 '종료된 수업'으로 필터된 lesson_records
 * @param checkedIn `${studentId}:${date}` 형태의 입실 태그 존재 집합
 */
export function classifyCheckInGaps(
  records: CheckInRecordInput[],
  checkedIn: Set<string>
): CheckInGapResult {
  const map = new Map<string, CheckInGapGroup>();

  for (const r of records) {
    if (!r.submitted) continue;
    if (!r.student_id) continue;
    const statuses = Array.isArray(r.attendance_status) ? r.attendance_status : [];
    if (statuses.length === 0) continue;
    if (!isPresent(statuses)) continue; // 정상 결석·보충불가 제외

    const classId = r.class_id || '';
    const key = `${classId || 'noclass'}|${r.lesson_date}`;
    const g =
      map.get(key) || { key, classId, date: r.lesson_date, target: 0, taggedCount: 0, missing: 0 };
    g.target += 1;
    if (checkedIn.has(`${r.student_id}:${r.lesson_date}`)) g.taggedCount += 1;
    map.set(key, g);
  }

  const partial: CheckInGapGroup[] = [];
  const untagged: CheckInGapGroup[] = [];

  for (const g of map.values()) {
    g.missing = g.target - g.taggedCount;
    if (g.target === 0 || g.missing === 0) continue;
    if (g.taggedCount === 0) untagged.push(g);
    else partial.push(g);
  }

  const byDateDesc = (a: CheckInGapGroup, b: CheckInGapGroup) => b.date.localeCompare(a.date);
  partial.sort(byDateDesc);
  untagged.sort(byDateDesc);

  return {
    partial,
    untagged,
    partialStudents: partial.reduce((n, g) => n + g.missing, 0),
    untaggedClassDays: untagged.length,
    untaggedStudents: untagged.reduce((n, g) => n + g.target, 0),
  };
}
