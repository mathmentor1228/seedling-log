// 서버(Deno)용 사본 — src/lib/attendance.ts와 규칙이 반드시 동일해야 한다 (동일 fixture 테스트로 검증).
// ATTENDANCE-NORMALIZE-V1
// 출결 상태값 단일 진실 공급원.
// - 대상: lesson_records.attendance_status (문자열 배열)
// - attendance_logs(입·퇴실 로그)는 별개 도메인이며 이 모듈을 쓰지 않는다.
//
// 원칙
// - 저장은 항상 표준값(ATTENDANCE_CANONICAL)으로만 한다.
// - 과거 레거시 값('출석', '결석', '등원', '미등원')은 DB를 고치지 않고 조회 시 정규화한다.
// - 의미가 다른 상태를 임의로 합치지 않는다. 레거시 '결석'은 인정/무단 구분이 없으므로
//   'legacy_absent'로 보수적으로 판정하되 결석 범주에는 포함한다.

/** 저장 가능한 표준값 (LessonRecordForm 기준) */
export const ATTENDANCE_CANONICAL = [
  '정상등원',
  '지각',
  '조퇴',
  '인정결석',
  '무단결석',
  '보충불가',
] as const;

export type AttendanceCanonical = (typeof ATTENDANCE_CANONICAL)[number];

/** 조회 시 나올 수 있는 정규화 결과. 'legacy_absent'는 절대 저장하지 않는다. */
export type AttendanceNormalized = AttendanceCanonical | 'legacy_absent';

export type AttendanceCategory =
  | 'present' // 정상 출석
  | 'late' // 지각 (출석 인원에 포함)
  | 'early_leave' // 조퇴 (출석 인원에 포함)
  | 'excused_absent'
  | 'unexcused_absent'
  | 'legacy_absent' // 레거시 '결석' — 인정/무단 판별 불가
  | 'no_makeup' // 보충불가
  | 'unknown'; // NULL/미기록/수업 전 — 결석으로 세지 않는다

/** 레거시 → 표준 매핑. 여기 없는 값은 정규화 불가(unknown)로 둔다. */
const LEGACY_MAP: Record<string, AttendanceNormalized> = {
  출석: '정상등원',
  등원: '정상등원',
  정상출석: '정상등원',
  결석: 'legacy_absent',
  미등원: 'legacy_absent',
};

/**
 * 단일 출결 문자열을 정규화한다.
 * 알 수 없는 값/빈 값은 null (= 미기록, 결석으로 세지 않음).
 */
export function normalizeAttendanceStatus(
  raw: string | null | undefined
): AttendanceNormalized | null {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  if ((ATTENDANCE_CANONICAL as readonly string[]).includes(v)) {
    return v as AttendanceCanonical;
  }
  return LEGACY_MAP[v] ?? null;
}

/** 배열 정규화 (중복 제거, 미기록 제거) */
export function normalizeAttendanceStatuses(
  raw: readonly (string | null | undefined)[] | null | undefined
): AttendanceNormalized[] {
  if (!Array.isArray(raw)) return [];
  const out: AttendanceNormalized[] = [];
  for (const item of raw) {
    const n = normalizeAttendanceStatus(item);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function getAttendanceCategory(
  status: string | null | undefined
): AttendanceCategory {
  switch (normalizeAttendanceStatus(status)) {
    case '정상등원':
      return 'present';
    case '지각':
      return 'late';
    case '조퇴':
      return 'early_leave';
    case '인정결석':
      return 'excused_absent';
    case '무단결석':
      return 'unexcused_absent';
    case 'legacy_absent':
      return 'legacy_absent';
    case '보충불가':
      return 'no_makeup';
    default:
      return 'unknown';
  }
}

const ABSENT_CATEGORIES: AttendanceCategory[] = [
  'excused_absent',
  'unexcused_absent',
  'legacy_absent',
  'no_makeup',
];

/** 결석 범주(인정/무단/legacy/보충불가) 여부 */
export function isAbsent(
  status: string | null | undefined | readonly (string | null | undefined)[]
): boolean {
  const arr = Array.isArray(status) ? status : [status as string | null | undefined];
  return arr.some((s) => ABSENT_CATEGORIES.includes(getAttendanceCategory(s)));
}

/**
 * 출석 인원 판정. 지각·조퇴도 출석 인원에 포함한다.
 * 결석 범주가 하나라도 있으면 출석으로 보지 않는다.
 * 미기록(수업 전 포함)은 출석도 결석도 아니다 → false.
 */
export function isPresent(
  status: string | null | undefined | readonly (string | null | undefined)[]
): boolean {
  const arr = Array.isArray(status) ? status : [status as string | null | undefined];
  if (isAbsent(arr)) return false;
  return arr.some((s) => {
    const c = getAttendanceCategory(s);
    return c === 'present' || c === 'late' || c === 'early_leave';
  });
}

/** 지각 별도 집계용 */
export function isLate(
  status: string | null | undefined | readonly (string | null | undefined)[]
): boolean {
  const arr = Array.isArray(status) ? status : [status as string | null | undefined];
  return arr.some((s) => getAttendanceCategory(s) === 'late');
}

/** 미기록(NULL/빈배열/알 수 없는 값)인지 — 수업 전 학생을 결석으로 세지 않기 위한 판정 */
export function isUnrecorded(
  status: string | null | undefined | readonly (string | null | undefined)[]
): boolean {
  const arr = Array.isArray(status) ? status : [status as string | null | undefined];
  return normalizeAttendanceStatuses(arr).length === 0;
}

/** '정상등원' 이외의 특이사항만 (뱃지 표시용) */
export function getAttendanceIssues(
  status: readonly (string | null | undefined)[] | null | undefined
): AttendanceNormalized[] {
  return normalizeAttendanceStatuses(status).filter((s) => s !== '정상등원');
}

const LABELS: Record<AttendanceNormalized, string> = {
  정상등원: '정상등원',
  지각: '지각',
  조퇴: '조퇴',
  인정결석: '인정결석',
  무단결석: '무단결석',
  보충불가: '보충불가',
  legacy_absent: '결석(구분 없음)',
};

/** 화면 표시용 라벨. 미기록은 빈 문자열. */
export function getAttendanceLabel(status: string | null | undefined): string {
  const n = normalizeAttendanceStatus(status);
  return n ? LABELS[n] : '';
}

/** 대표 상태 1개 (특이사항 우선, 없으면 정상등원) */
export function getPrimaryAttendanceStatus(
  status: readonly (string | null | undefined)[] | null | undefined
): AttendanceNormalized | null {
  const arr = normalizeAttendanceStatuses(status);
  return arr.find((s) => s !== '정상등원') ?? arr[0] ?? null;
}

/**
 * 저장 직전 정규화. 표준값만 남긴다.
 * 정규화 불가하거나 legacy_absent인 값은 저장 대상에서 제외하고,
 * 남는 값이 없으면 fallback(기본 '정상등원')을 쓴다.
 */
export function toStorageAttendanceStatuses(
  raw: readonly (string | null | undefined)[] | null | undefined,
  fallback: AttendanceCanonical = '정상등원'
): AttendanceCanonical[] {
  const out = normalizeAttendanceStatuses(raw).filter(
    (s): s is AttendanceCanonical => s !== 'legacy_absent'
  );
  return out.length > 0 ? out : [fallback];
}
