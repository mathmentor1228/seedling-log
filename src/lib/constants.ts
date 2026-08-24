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
// 강의실 배정 룰 (단일 진실 공급원):
// - 황은지: 4층 2강의실
// - 최윤기: 4층 4강의실 (수학) / 3층 10강의실 (과학)
// - 이재진: 5층 5강의실
// - 이나연: 3층 6강의실
// - 함유빈: 3층 7강의실
// - 조준희: 3층 8강의실
// - 김민희: 3층 9강의실
export const TEACHERS = [
  { name: '황은지(원장)', room: '4층 2강의실' },
  { name: '최윤기', room: '4층 4강의실' },
  { name: '이재진', room: '5층 5강의실' },
  { name: '이나연', room: '3층 6강의실' },
  { name: '함유빈', room: '3층 7강의실' },
  { name: '조준희', room: '3층 8강의실' },
  { name: '김민희', room: '3층 9강의실' },
  { name: '김은수', room: '' }, // 영어(임시 근무) — 고정 강의실 미지정
] as const;

// 주간 핵심 코멘트를 학부모 리포트에 원문 그대로 노출하는 선생님 (원장 방침 2026-07-29).
// 이 명단에 없는 선생님의 주간 코멘트는 AI 생성 본문이 대신하며, 입력 위젯도 표시하지 않는다.
// generate-weekly-reports 함수의 VERBATIM_COMMENT_TEACHER_IDS와 반드시 함께 갱신할 것.
export const VERBATIM_WEEKLY_COMMENT_TEACHER_IDS = [
  '916c5055-2a8c-46d8-b84c-fd280d7f541f', // 이재진(영어)
] as const;

/** 교사별 기본 강의실. 최윤기는 과목별로 다름. */
export function getTeacherRoom(teacherName: string, subject?: string): string {
  if (!teacherName) return '';
  const base = teacherName.replace(/\(.*\)/, '').trim();
  if (base === '최윤기') {
    return subject === '과학' ? '3층 10강의실' : '4층 4강의실';
  }
  const match = TEACHERS.find(t => t.name.replace(/\(.*\)/, '').trim() === base);
  return match?.room ?? '';
}

/** 강의실 이름 → 층 매핑 */
export const CLASSROOM_FLOORS: Record<string, string> = {
  '2강': '4층', '4강': '4층', '5강': '5층',
  '6강': '3층', '7강': '3층', '8강': '3층', '9강': '3층', '10강': '3층',
  '유리문': '3층',
};
