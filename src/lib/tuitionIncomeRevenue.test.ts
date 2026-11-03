import { describe, expect, it } from 'vitest';
import { tuitionIncomeRevenue } from './tuitionIncomeRevenue';

describe('income ledger boundary', () => {
  it('uses September collected amounts instead of current-course revenue', () => {
    expect(tuitionIncomeRevenue('2026-09', new Map([['2026-09', 127500]]), 330000)).toEqual({ total: 127500, source: 'payments' });
  });
  it('shows zero for a pre-October month without payments, not current fees or a historical estimate', () => {
    expect(tuitionIncomeRevenue('2026-09', new Map(), 330000, 190000)).toEqual({ total: 0, source: 'payments' });
  });
  it('keeps recorded totals from October onward', () => {
    expect(tuitionIncomeRevenue('2026-10', new Map([['2026-10', 190000]]), 330000)).toEqual({ total: 190000, source: 'payments' });
  });
  it('keeps the existing current-month fallback from October onward', () => {
    expect(tuitionIncomeRevenue('2026-10', new Map(), 330000)).toEqual({ total: 330000, source: 'current' });
  });
});