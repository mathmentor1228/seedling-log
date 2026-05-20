// ── Shared Option Sets ──

/** Option Set 1: Subject (과목) */
export const SUBJECTS = ['수학', '영어', '과학', '국어', '고2탐구'] as const;
export type SubjectOption = (typeof SUBJECTS)[number];

/** Option Set 2: Grade Target (대상학년) */
export const GRADE_TARGETS = ['초', '중', '고1', '고2', '고등', '고등수능'] as const;
export type GradeTarget = (typeof GRADE_TARGETS)[number];

/** Option Set 3: Student Status (재학상태) — maps to enrollment_status column */
export const STUDENT_STATUSES = ['재학', '재등원', '휴학', '퇴원'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** Active student statuses (used for roster filtering — excludes 퇴원/휴학).
 * '재등원' = 퇴원 후 재등원한 학생, 재원생으로 카운팅됨. */
export const ACTIVE_STUDENT_STATUSES: StudentStatus[] = ['재학', '재등원'];

/** Option Set 4: Enrollment Status (수강상태) */
export const ENROLLMENT_STATUSES = ['활성', '중단', '종료'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

// ── Legacy helpers ──

/** School levels for grade selectors (초/중/고) */
export const SCHOOL_LEVELS = ['초', '중', '고'] as const;

/** Grade years per school level */
export const GRADE_YEARS = [1, 2, 3, 4, 5, 6] as const;
export function getGradeYearsForLevel(level: string) {
  return level === '초' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
}

// ── Teachers ──
export const TEACHERS = [
  { name: '최윤기', room: '4층 2강의실' },
  { name: '조준희', room: '4층 4강의실' },
  { name: '김미정', room: '4층 5강의실' },
  { name: '이나연', room: '3층 6강의실' },
  { name: '정선호', room: '3층 7강의실' },
  { name: '김민희', room: '3층 8강의실' },
  { name: '황은지(원장)', room: '3층 9강의실' },
] as const;
