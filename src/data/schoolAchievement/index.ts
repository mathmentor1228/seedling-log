// SCHOOL-ACHV-V1: 학교 공개 통계 데이터셋 레지스트리 (어댑터 구조)
// 새 학교 추가 시: 파일 1개 작성 후 아래 배열에만 등록 (신길중/선부고/원곡고 등)
import { SHINGIL_HIGH_2025 } from './shingil-high-2025';
import type { SchoolAchievementDataset } from './types';

export const SCHOOL_DATASETS: SchoolAchievementDataset[] = [SHINGIL_HIGH_2025];

export function listSchools(): { key: string; name: string; years: number[] }[] {
  const map = new Map<string, { key: string; name: string; years: number[] }>();
  for (const ds of SCHOOL_DATASETS) {
    const cur = map.get(ds.schoolKey) ?? { key: ds.schoolKey, name: ds.schoolName, years: [] };
    if (!cur.years.includes(ds.year)) cur.years.push(ds.year);
    map.set(ds.schoolKey, cur);
  }
  return [...map.values()];
}

export function getDataset(schoolKey: string, year: number): SchoolAchievementDataset | undefined {
  return SCHOOL_DATASETS.find((d) => d.schoolKey === schoolKey && d.year === year);
}

export * from './types';
export { SHINGIL_HIGH_2025 };
