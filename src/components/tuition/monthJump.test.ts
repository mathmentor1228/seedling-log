import { describe, expect, it } from 'vitest';
import { MONTH_JUMP_EARLIEST_YEAR, monthJumpTarget, monthJumpYears } from './monthJump';

describe('수강료 달력 연·월 이동', () => {
  it('이동 가능한 연도는 다음 해부터 출결버스 시작 해까지 내림차순이다', () => {
    const years = monthJumpYears(2026);
    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(MONTH_JUMP_EARLIEST_YEAR);
    expect(years).toContain(2026);
    expect(years).toContain(2022);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
  it('연도와 월을 청구월 형식으로 만든다', () => {
    expect(monthJumpTarget(2026, 11)).toBe('2026-11');
    expect(monthJumpTarget('2026', '3')).toBe('2026-03');
    expect(monthJumpTarget('2022', '12')).toBe('2022-12');
  });
  it('1~12월이 아니고 시작 연도보다 이전이면 이동하지 않는다', () => {
    expect(monthJumpTarget(2026, 13)).toBeNull();
    expect(monthJumpTarget(2026, 0)).toBeNull();
    expect(monthJumpTarget(2026, '')).toBeNull();
    expect(monthJumpTarget(MONTH_JUMP_EARLIEST_YEAR - 1, 5)).toBeNull();
    expect(monthJumpTarget('', '5')).toBeNull();
  });
});
