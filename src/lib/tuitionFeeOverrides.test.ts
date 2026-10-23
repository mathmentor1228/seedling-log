import { describe, expect, it } from 'vitest';
import { applyingFeeOverride, nextTuitionMonth, pendingRepriceChanges, validOverrideInput } from './tuitionFeeOverrides';

const november = { id: 'n', from_month: '2026-11', amount: 600000, note: null };
const billing = { id: 'b', student_id: 'a', status: 'pending', base_amount: 525000, final_amount: 525000, discount_amount: 0, extra_amount: 0 };
describe('월 원비 고정과 대기 청구 재계산', () => {
  it('11월 고정은 10월에는 적용하지 않는다', () => {
    expect(applyingFeeOverride([november], '2026-10', '재학')).toBeUndefined();
    expect(applyingFeeOverride([november], '2026-11', '재학')?.amount).toBe(600000);
  });
  it('적용 시작월 이후 가장 최근 고정을 사용한다', () => {
    expect(applyingFeeOverride([november, { ...november, id: 'd', from_month: '2026-12', amount: 700000 }], '2027-01', '재등원')?.amount).toBe(700000);
  });
  it.each(['휴학', '퇴원'])('%s이면 고정이 적용되지 않는다', status => {
    expect(applyingFeeOverride([november], '2026-11', status)).toBeUndefined();
  });
  it('입력 기본값은 다음 달이다', () => {
    expect(nextTuitionMonth('2026-10')).toBe('2026-11');
    expect(nextTuitionMonth('2026-12')).toBe('2027-01');
  });
  it('2026년 10월 이전의 고정 입력은 허용하지 않는다', () => {
    expect(validOverrideInput('2026-09', '600000')).toBe(false);
    expect(validOverrideInput('2026-10', '0')).toBe(true);
    expect(validOverrideInput('2026-13', '600000')).toBe(false);
    expect(validOverrideInput('2026-11', '')).toBe(false);
  });
  it('대기 청구의 원비만 재계산하고 할인과 추가금을 보존한다', () => {
    expect(pendingRepriceChanges([{ ...billing, discount_amount: 10000, extra_amount: 30000 }], { a: 600000 }, '2026-11')[0]).toMatchObject({ base_amount: 600000, final_amount: 620000 });
  });
  it.each(['paid', 'cancelled', 'overdue', 'overdue-paid'])('%s 청구는 변경하지 않는다', status => {
    expect(pendingRepriceChanges([{ ...billing, status }], { a: 600000 }, '2026-11')).toEqual([]);
  });
  it('이미 600000원인 11월 청구는 변경 건수가 0이다', () => {
    expect(pendingRepriceChanges([{ ...billing, base_amount: 600000, final_amount: 600000 }], { a: 600000 }, '2026-11')).toHaveLength(0);
  });
  it('2026년 10월 이전 청구는 재계산하지 않는다', () => {
    expect(() => pendingRepriceChanges([billing], { a: 600000 }, '2026-09')).toThrow();
  });
});