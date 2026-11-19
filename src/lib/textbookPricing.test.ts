import { describe, expect, it } from 'vitest';
import { textbookChargePerCopy } from './textbookPricing';

describe('교재비 청구 단가', () => {
  it('시중 교재는 정가의 10%를 할인해 청구한다', () => {
    expect(textbookChargePerCopy({ unit_price: 20000, is_inhouse: false })).toBe(18000);
  });
  it('자체제작 교재는 입력된 금액 그대로 청구한다', () => {
    expect(textbookChargePerCopy({ unit_price: 20000, is_inhouse: true })).toBe(20000);
  });
  it('자체제작 표시가 없으면 시중 교재로 본다', () => {
    expect(textbookChargePerCopy({ unit_price: 15000 })).toBe(13500);
  });
});
