import { describe, expect, it } from 'vitest';
import { SHINGIL_HIGH_2025, getDataset, listSchools } from '@/data/schoolAchievement';
import {
  CONSULT_GOALS,
  DEFAULT_FILTER,
  FORBIDDEN_PHRASES,
  NOT_PROVIDED_LABEL,
  PARENT_VIEW_NOTICE,
  buildConsultDraft,
  buildFilterQuery,
  buildInterpretation,
  computeSubjectStats,
  findRow,
  listGrades,
  listSemesters,
  listSubjects,
  parseFilterFromQuery,
} from '@/lib/schoolAnalysis';

const ds = SHINGIL_HIGH_2025;

describe('school achievement dataset', () => {
  it('has 118 rows for 2025', () => {
    expect(ds.rows).toHaveLength(118);
    expect(ds.year).toBe(2025);
    expect(ds.source).toContain('학교알리미');
    expect(ds.collectedAt).toBe('2026-08-23');
  });

  it('registry lookup works and supports future schools', () => {
    expect(getDataset('shingil-high', 2025)).toBe(ds);
    expect(getDataset('unknown-school', 2025)).toBeUndefined();
    expect(listSchools()[0]).toMatchObject({ key: 'shingil-high', name: '신길고등학교' });
  });

  it('every row has valid shape and A~E sums within tolerance', () => {
    for (const row of ds.rows) {
      const s = computeSubjectStats(row);
      expect(typeof s.subject).toBe('string');
      expect(s.average).toBeGreaterThan(0);
      expect(s.sum).toBeGreaterThanOrEqual(99);
      expect(s.sum).toBeLessThanOrEqual(101);
      expect(s.sumWithinTolerance).toBe(true);
    }
  });

  it('null bands are preserved (not coerced to 0)', () => {
    const s = computeSubjectStats(findRow(ds, '1학년', '1학기', '과학탐구실험1')!);
    expect(s.d).toBeNull();
    expect(s.e).toBeNull();
    expect(s.lowRatio).toBeNull();
    expect(s.missingBands).toEqual(['D', 'E']);
  });

  it('computes A+B and D+E', () => {
    const s = computeSubjectStats(findRow(ds, '1학년', '1학기', '공통수학1')!);
    expect(s.average).toBe(62.3);
    expect(s.topRatio).toBe(30.6);
    expect(s.lowRatio).toBe(52.2);
  });
});

describe('filters', () => {
  it('lists grades / semesters / subjects', () => {
    expect(listGrades(ds)).toEqual(['1학년', '2학년', '3학년']);
    expect(listSemesters(ds, '1학년')).toEqual(['1학기', '2학기']);
    expect(listSubjects(ds, '1학년', '1학기')).toContain('공통수학1');
  });

  it('parses and builds URL query with explicit defaults', () => {
    expect(parseFilterFromQuery('')).toEqual(DEFAULT_FILTER);
    const f = parseFilterFromQuery('?school=shingil-high&year=2025&grade=2학년&semester=2학기&subject=수학Ⅱ');
    expect(f.grade).toBe('2학년');
    expect(f.subject).toBe('수학Ⅱ');
    const q = buildFilterQuery(f);
    expect(parseFilterFromQuery(q)).toEqual(f);
  });

  it('keeps empty subject as empty (no guessing)', () => {
    const f = parseFilterFromQuery('?subject=');
    expect(f.subject).toBe('');
  });
});

describe('interpretation rules', () => {
  it('never uses judgemental phrases even for high D+E', () => {
    for (const row of ds.rows) {
      const text = JSON.stringify(buildInterpretation(ds, computeSubjectStats(row)));
      for (const bad of FORBIDDEN_PHRASES) expect(text).not.toContain(bad);
    }
  });

  it('separates observed vs needs-check and always includes source basis', () => {
    const s = computeSubjectStats(findRow(ds, '2학년', '1학기', '지구과학Ⅰ')!);
    const r = buildInterpretation(ds, s);
    expect(r.observed.length).toBeGreaterThan(0);
    expect(r.needsCheck.join(' ')).toContain('시험지 분석');
    expect(r.needsCheck.join(' ')).toContain('표준편차');
    expect(r.basis).toContain('학교알리미');
    expect(r.basis).toContain('2025학년도');
  });

  it('labels missing bands as not provided', () => {
    const s = computeSubjectStats(findRow(ds, '1학년', '1학기', '미술')!);
    expect(buildInterpretation(ds, s).observed.join(' ')).toContain(NOT_PROVIDED_LABEL);
  });
});

describe('consult draft', () => {
  const stats = computeSubjectStats(findRow(ds, '1학년', '1학기', '공통수학1')!);

  it('orders sections and excludes personal info by default', () => {
    const r = buildConsultDraft(ds, stats, { goals: [], planSteps: ['', '', ''] });
    expect(r.text.indexOf('[1] 학교 공개 통계 요약')).toBeLessThan(r.text.indexOf('[2] 확인된 학생 정보'));
    expect(r.text.indexOf('[2] 확인된 학생 정보')).toBeLessThan(r.text.indexOf('[3] 제한적 해석'));
    expect(r.text.indexOf('[3] 제한적 해석')).toBeLessThan(r.text.indexOf('[4] 다음 학습 방향'));
    expect(r.text).toContain('(이름 미기재)');
    expect(r.missing).toContain('상담 목표');
    expect(r.text).toContain('※ 미입력 항목');
  });

  it('marks nothing missing when fully filled and includes goals', () => {
    const r = buildConsultDraft(ds, stats, {
      goals: [...CONSULT_GOALS],
      studentScore: '68점',
      observation: '오답 정리 미흡',
      planSteps: ['개념 복습', '유형 반복', '실전 점검'],
      studentNameOptional: '홍길동',
    });
    expect(r.missing).toHaveLength(0);
    expect(r.text).not.toContain('(미입력)');
    expect(r.text).toContain('서술형');
    expect(r.text).toContain('홍길동');
  });

  it('has no forbidden judgement phrases', () => {
    const r = buildConsultDraft(ds, computeSubjectStats(findRow(ds, '3학년', '2학기', '확률과 통계')!), {
      goals: ['개념'],
      planSteps: ['a', 'b', 'c'],
    });
    for (const bad of FORBIDDEN_PHRASES) expect(r.text).not.toContain(bad);
  });
});

describe('parent view notice', () => {
  it('states non-ranking and non-prediction', () => {
    expect(PARENT_VIEW_NOTICE).toContain('서열 비교');
    expect(PARENT_VIEW_NOTICE).toContain('예측');
  });
});
