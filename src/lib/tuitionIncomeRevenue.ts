import { LEDGER_START } from './tuitionLedger';

/** Historical collection totals must never fall back to today's course prices. */
export function tuitionIncomeRevenue(month: string, paymentTotals: ReadonlyMap<string, number>, currentTotal: number, historicalTotal?: number): { total: number; source: 'payments' | 'historical' | 'current' } {
  const paid = paymentTotals.get(month);
  if (month < LEDGER_START || paid !== undefined) return { total: paid ?? 0, source: 'payments' };
  if (historicalTotal !== undefined) return { total: historicalTotal, source: 'historical' };
  return { total: currentTotal, source: 'current' };
}