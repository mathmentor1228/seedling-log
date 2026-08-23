// SCHOOL-ACHV-V1: 학교알리미 공개 통계(교과별 학업성취 사항) 정적 데이터 스키마
// 개인정보 없음. 학교 공개 통계만 포함하며 운영 DB와 결합 저장하지 않는다.

/** [학년, 학기, 과목, 평균, A, B, C, D, E] — null은 실제 미제공(0이 아님) */
export type AchievementRow = [
  string,
  string,
  string,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export interface SchoolAchievementDataset {
  /** 확장 키 (예: 'shingil-high') */
  schoolKey: string;
  schoolName: string;
  schoolLevel: 'high' | 'middle';
  /** 학년도 */
  year: number;
  /** 출처 표기 */
  source: string;
  /** 수집일 (YYYY-MM-DD) */
  collectedAt: string;
  rows: AchievementRow[];
}

export interface SubjectAchievement {
  grade: string;
  semester: string;
  subject: string;
  average: number;
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  e: number | null;
}

export function toSubjectAchievement(row: AchievementRow): SubjectAchievement {
  const [grade, semester, subject, average, a, b, c, d, e] = row;
  return { grade, semester, subject, average, a, b, c, d, e };
}
