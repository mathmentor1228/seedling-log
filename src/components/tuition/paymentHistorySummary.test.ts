import {describe, expect, it} from 'vitest';
import {hasReceipt, paymentYearSubtotals, periodMonthRange, shiftBillingMonth} from './paymentHistorySummary';

describe('payment history summaries', () => {
  it('최근 3개월 crosses year boundary', () => {
    expect(periodMonthRange('recent', '2026-01')).toEqual({from: '2025-11', to: '2026-01'});
  });
  it('올해 / 작년 / 전체', () => {
    expect(periodMonthRange('year', '2026-05')).toEqual({from: '2026-01', to: '2026-12'});
    expect(periodMonthRange('previous', '2026-05')).toEqual({from: '2025-01', to: '2025-12'});
    expect(periodMonthRange('all', '2026-05')).toEqual({from: '', to: ''});
  });
  it('shifts months', () => {
    expect(shiftBillingMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftBillingMonth('2026-01', -1)).toBe('2025-12');
  });
  it('per-year subtotals exclude canceled', () => {
    expect(paymentYearSubtotals([
      {billing_month: '2025-12', amount: '100'},
      {billing_month: '2026-01', amount: 200},
      {billing_month: '2026-02', amount: 300},
      {billing_month: '2026-03', amount: 999, canceled_at: '2026-03-01'},
    ])).toEqual([{year: '2026', count: 2, amount: 500}, {year: '2025', count: 1, amount: 100}]);
  });
  it('출결버스 rows without receipt number get no receipt', () => {
    expect(hasReceipt({receipt_number: null})).toBe(false);
    expect(hasReceipt({receipt_number: '2026-0097'})).toBe(true);
  });
});
