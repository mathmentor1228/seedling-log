// SCHOOL-ANALYSIS-V1: 학교 공개 통계 기반 계산·문구 순수 함수
// 규칙: 학교 수준/시험 난도/학생 능력 단정 금지. 공개 분포 서술과 추가 확인 필요 사항을 분리.
import type { AchievementRow, SchoolAchievementDataset, SubjectAchievement } from '@/data/schoolAchievement/types';
import { toSubjectAchievement } from '@/data/schoolAchievement/types';

export const NOT_PROVIDED_LABEL = '해당 성취도 구간 미제공';

/** 해석 문구에 절대 등장하면 안 되는 단정 표현 */
export const FORBIDDEN_PHRASES = [
  '수준이 낮',
  '수준이 높',
  '학교가 좋',
  '학교가 나쁘',
  '시험이 쉽',
  '시험이 어렵',
  '난이도가 높',
  '난이도가 낮',
  '학생들이 못',
  '학생들이 잘하',
  '등급 보장',
  '점수를 보장',
  '예상 등급',
];

export interface SubjectStats extends SubjectAchievement {
  /** A+B (둘 다 null이면 null) */
  topRatio: number | null;
  /** D+E (둘 다 null이면 null) */
  lowRatio: number | null;
  /** A~E 합계 (제공된 값만 합산) */
  sum: number;
  /** 합계가 99~101 범위인지 (반올림 허용) */
  sumWithinTolerance: boolean;
  /** null인 구간 라벨 목록 */
  missingBands: string[];
}

function addNullable(...vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return null;
  return round1(nums.reduce((a, b) => a + b, 0));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeSubjectStats(row: AchievementRow | SubjectAchievement): SubjectStats {
  const s: SubjectAchievement = Array.isArray(row) ? toSubjectAchievement(row) : row;
  const topRatio = addNullable(s.a, s.b);
  const lowRatio = addNullable(s.d, s.e);
  const sum = round1(
    [s.a, s.b, s.c, s.d, s.e].filter((v): v is number => v !== null).reduce((a, b) => a + b, 0),
  );
  const missingBands = (['A', 'B', 'C', 'D', 'E'] as const).filter(
    (band) => s[band.toLowerCase() as 'a' | 'b' | 'c' | 'd' | 'e'] === null,
  );
  return {
    ...s,
    topRatio,
    lowRatio,
    sum,
    sumWithinTolerance: sum >= 99 && sum <= 101,
    missingBands,
  };
}

export interface FilterState {
  schoolKey: string;
  year: number;
  grade: string;
  semester: string;
  subject: string;
}

export const DEFAULT_FILTER: FilterState = {
  schoolKey: 'shingil-high',
  year: 2025,
  grade: '1학년',
  semester: '1학기',
  subject: '공통수학1',
};

export function parseFilterFromQuery(search: string): FilterState {
  const q = new URLSearchParams(search);
  const yearRaw = Number(q.get('year'));
  return {
    schoolKey: q.get('school') || DEFAULT_FILTER.schoolKey,
    year: Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : DEFAULT_FILTER.year,
    grade: q.get('grade') || DEFAULT_FILTER.grade,
    semester: q.get('semester') || DEFAULT_FILTER.semester,
    subject: q.get('subject') ?? DEFAULT_FILTER.subject,
  };
}

export function buildFilterQuery(f: FilterState): string {
  const q = new URLSearchParams({
    school: f.schoolKey,
    year: String(f.year),
    grade: f.grade,
    semester: f.semester,
  });
  if (f.subject) q.set('subject', f.subject);
  return q.toString();
}

export function listGrades(ds: SchoolAchievementDataset): string[] {
  return [...new Set(ds.rows.map((r) => r[0]))];
}

export function listSemesters(ds: SchoolAchievementDataset, grade: string): string[] {
  return [...new Set(ds.rows.filter((r) => r[0] === grade).map((r) => r[1]))];
}

export function listSubjects(ds: SchoolAchievementDataset, grade: string, semester: string): string[] {
  return ds.rows.filter((r) => r[0] === grade && r[1] === semester).map((r) => r[2]);
}

export function findRow(
  ds: SchoolAchievementDataset,
  grade: string,
  semester: string,
  subject: string,
): AchievementRow | undefined {
  return ds.rows.find((r) => r[0] === grade && r[1] === semester && r[2] === subject);
}

export interface Interpretation {
  /** 공개 통계에서 그대로 확인되는 사실 */
  observed: string[];
  /** 추가 확인이 필요한 항목 (단정 금지) */
  needsCheck: string[];
  /** 기준 표기 */
  basis: string;
}

export function buildInterpretation(
  ds: SchoolAchievementDataset,
  stats: SubjectStats,
): Interpretation {
  const observed: string[] = [];
  const needsCheck: string[] = [];

  observed.push(`공개 통계상 ${stats.subject} 평균은 ${stats.average}점으로 기록되어 있습니다.`);

  if (stats.topRatio !== null) {
    observed.push(`A+B 구간 비율은 ${stats.topRatio}%로 확인됩니다.`);
  } else {
    observed.push(`A+B 구간은 ${NOT_PROVIDED_LABEL} 상태입니다.`);
  }

  if (stats.lowRatio !== null) {
    observed.push(`D+E 구간 비율은 ${stats.lowRatio}%로 확인됩니다.`);
  } else {
    observed.push(`D+E 구간은 ${NOT_PROVIDED_LABEL} 상태입니다.`);
  }

  if (stats.missingBands.length > 0) {
    observed.push(`${stats.missingBands.join('/')} 구간은 공개 자료에 값이 없어 ${NOT_PROVIDED_LABEL}으로 표기합니다.`);
    needsCheck.push('미제공 구간은 0%가 아니라 자료 미공개이므로 비율 합계 해석 시 유의해야 합니다.');
  }

  if (stats.lowRatio !== null && stats.lowRatio >= 40) {
    needsCheck.push('D+E 구간 비율이 상대적으로 큽니다. 원인은 공개 통계만으로 확인되지 않으므로 실제 시험지 분석과 학생 진단이 필요합니다.');
  }
  if (stats.topRatio !== null && stats.topRatio >= 60) {
    needsCheck.push('A+B 구간 비율이 상대적으로 큽니다. 배점·평가 방식은 공개 통계에 포함되지 않아 시험지 확인이 필요합니다.');
  }
  needsCheck.push('표준편차와 이수학생수는 공개 자료에 포함되지 않아 표시하지 않으며 추정하지 않습니다.');
  needsCheck.push('개별 학생의 결과는 이 통계로 예측할 수 없고 학생별 진단이 별도로 필요합니다.');

  return {
    observed,
    needsCheck,
    basis: `${ds.schoolName} ${ds.year}학년도 ${stats.grade} ${stats.semester} · 출처: ${ds.source} (수집일 ${ds.collectedAt})`,
  };
}

export type ConsultGoal = '개념' | '유형' | '서술형' | '시간관리' | '학습습관';
export const CONSULT_GOALS: ConsultGoal[] = ['개념', '유형', '서술형', '시간관리', '학습습관'];

export interface ConsultInput {
  goals: ConsultGoal[];
  studentScore?: string;
  observation?: string;
  planSteps: [string, string, string];
  studentNameOptional?: string;
}

export interface ConsultDraftResult {
  text: string;
  /** 미입력 항목 안내 */
  missing: string[];
}

const NOT_ENTERED = '(미입력)';

/**
 * 상담문 초안: 학교 통계 요약 → 확인된 학생 정보 → 제한적 해석 → 다음 학습 방향
 * 개인정보를 자동 포함하지 않는다(이름은 사용자가 직접 입력한 경우에만).
 */
export function buildConsultDraft(
  ds: SchoolAchievementDataset,
  stats: SubjectStats,
  input: ConsultInput,
): ConsultDraftResult {
  const missing: string[] = [];
  if (input.goals.length === 0) missing.push('상담 목표');
  if (!input.studentScore?.trim()) missing.push('학생 현재 점수');
  if (!input.observation?.trim()) missing.push('관찰 메모');
  input.planSteps.forEach((s, i) => {
    if (!s.trim()) missing.push(`다음 시험 계획 ${i + 1}단계`);
  });

  const top = stats.topRatio === null ? NOT_PROVIDED_LABEL : `${stats.topRatio}%`;
  const low = stats.lowRatio === null ? NOT_PROVIDED_LABEL : `${stats.lowRatio}%`;

  const lines: string[] = [];
  lines.push('[1] 학교 공개 통계 요약');
  lines.push(`- ${ds.schoolName} ${ds.year}학년도 ${stats.grade} ${stats.semester} ${stats.subject}`);
  lines.push(`- 평균 ${stats.average}점 / A+B ${top} / D+E ${low}`);
  lines.push(`- 출처: ${ds.source} (수집일 ${ds.collectedAt})`);
  lines.push('');
  lines.push('[2] 확인된 학생 정보 (상담 중 확인한 내용만)');
  lines.push(`- 대상: ${input.studentNameOptional?.trim() || '(이름 미기재)'}`);
  lines.push(`- 현재 점수: ${input.studentScore?.trim() || NOT_ENTERED}`);
  lines.push(`- 관찰 메모: ${input.observation?.trim() || NOT_ENTERED}`);
  lines.push('');
  lines.push('[3] 제한적 해석 (공개 통계 범위 내)');
  lines.push('- 아래는 공개된 분포에서 확인되는 사실이며, 학교나 시험, 학생 능력에 대한 판단이 아닙니다.');
  for (const o of buildInterpretation(ds, stats).observed) lines.push(`- ${o}`);
  lines.push('- 정확한 원인 파악에는 실제 시험지 분석과 학생 진단이 추가로 필요합니다.');
  lines.push('');
  lines.push('[4] 다음 학습 방향');
  lines.push(`- 상담 목표: ${input.goals.length ? input.goals.join(', ') : NOT_ENTERED}`);
  input.planSteps.forEach((s, i) => {
    lines.push(`- ${i + 1}단계: ${s.trim() || NOT_ENTERED}`);
  });
  if (missing.length > 0) {
    lines.push('');
    lines.push(`※ 미입력 항목: ${missing.join(', ')} — 추정해서 채우지 않았습니다.`);
  }

  return { text: lines.join('\n'), missing };
}

export const PARENT_VIEW_NOTICE =
  '본 자료는 학교 간 서열 비교 자료가 아니며, 개인 성적 예측에 사용할 수 없습니다.';

export function buildSourceLabel(ds: SchoolAchievementDataset): string {
  return `출처: ${ds.source} · 수집일 ${ds.collectedAt}`;
}
