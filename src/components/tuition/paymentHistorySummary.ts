export type PeriodPreset = 'recent' | 'year' | 'previous' | 'all';
export interface MonthRange { from: string; to: string }

export function shiftBillingMonth(month: string, offset: number): string {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function periodMonthRange(preset: PeriodPreset, currentMonth: string): MonthRange {
  const year = Number(currentMonth.slice(0, 4));
  switch (preset) {
    case 'recent': return {from: shiftBillingMonth(currentMonth, -2), to: currentMonth};
    case 'year': return {from: `${year}-01`, to: `${year}-12`};
    case 'previous': return {from: `${year - 1}-01`, to: `${year - 1}-12`};
    case 'all': return {from: '', to: ''};
  }
}

export interface SummaryPayment { billing_month?: string | null; amount: number | string; canceled_at?: string | null }
export interface YearSubtotal { year: string; count: number; amount: number }

/** Per-year count/sum by billing month, newest year first; canceled rows excluded. */
export function paymentYearSubtotals(payments: readonly SummaryPayment[]): YearSubtotal[] {
  const totals = new Map<string, YearSubtotal>();
  for (const p of payments) {
    if (p.canceled_at || !p.billing_month) continue;
    const year = p.billing_month.slice(0, 4);
    const t = totals.get(year) ?? {year, count: 0, amount: 0};
    t.count++;
    t.amount += Number(p.amount);
    totals.set(year, t);
  }
  return [...totals.values()].sort((a, b) => b.year.localeCompare(a.year));
}

/** Historical imports carry no receipt number; receipts are offered only for numbered rows. */
export const hasReceipt = (p: {receipt_number?: unknown}) => p.receipt_number != null && p.receipt_number !== '';
