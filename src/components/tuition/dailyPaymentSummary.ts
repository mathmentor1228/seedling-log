import {paymentMonth, type LedgerPayment} from '@/lib/tuitionLedger';

export const IMPORTED_PAYMENT_SOURCES = ['결제선생', '이코딩키오스크', '이코딩수기', '계좌이체문자'] as const;
export type PaymentRecordState = 'recorded' | 'review' | 'canceled';
export type PaymentDateBasis = 'paid' | 'registered';
export interface DailyPayment extends LedgerPayment {
  id: string;
  paid_date: string;
  created_at?: string;
  source?: string | null;
  needs_review?: boolean;
  matched_by?: string | null;
  review_note?: string | null;
  raw_text?: string | null;
  memo?: string | null;
  external_id?: string | null;
  payment_method?: string;
  students?: {name?: string; school?: string | null; grade?: string | null} | null;
}
export interface DailyPaymentFilters {
  from: string;
  to: string;
  source: string;
  state: 'all' | PaymentRecordState;
  basis: PaymentDateBasis;
  search?: string;
}

export function paymentRecordState(payment: DailyPayment): PaymentRecordState {
  if (payment.canceled_at) return 'canceled';
  if (payment.needs_review || !payment.student_id || !paymentMonth(payment)) return 'review';
  return 'recorded';
}

export function paymentRecordDate(payment: DailyPayment, basis: PaymentDateBasis): string {
  if (basis === 'paid') return payment.paid_date;
  if (!payment.created_at) return '';
  const timestamp = Date.parse(payment.created_at);
  if (!Number.isFinite(timestamp)) return '';
  // Date-only output in Seoul, independent of the device timezone.
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function filterDailyPayments(payments: DailyPayment[], filters: DailyPaymentFilters): DailyPayment[] {
  const search = (filters.search || '').trim().toLocaleLowerCase();
  return payments.filter(payment => {
    const date = paymentRecordDate(payment, filters.basis);
    if (!date || (filters.from && date < filters.from) || (filters.to && date > filters.to)) return false;
    if (filters.source === 'imported' && !IMPORTED_PAYMENT_SOURCES.some(source => source === payment.source)) return false;
    if (filters.source !== 'all' && filters.source !== 'imported' && payment.source !== filters.source) return false;
    if (filters.state !== 'all' && paymentRecordState(payment) !== filters.state) return false;
    const text = `${payment.students?.name || '미지정'} ${payment.students?.school || ''} ${payment.students?.grade || ''} ${paymentMonth(payment) || ''} ${payment.source || ''} ${payment.memo || ''} ${payment.raw_text || ''}`;
    return !search || text.toLocaleLowerCase().includes(search);
  });
}

export function summarizeDailyPayments(payments: DailyPayment[]) {
  const result = {recorded: 0, recordedAmount: 0, review: 0, reviewAmount: 0, canceled: 0, canceledAmount: 0};
  for (const payment of payments) {
    const state = paymentRecordState(payment);
    result[state]++;
    result[`${state}Amount`] += Number(payment.amount);
  }
  return result;
}

export function groupDailyPayments(payments: DailyPayment[], basis: PaymentDateBasis) {
  const groups = new Map<string, DailyPayment[]>();
  for (const payment of payments) {
    const date = paymentRecordDate(payment, basis);
    const rows = groups.get(date) || [];
    rows.push(payment);
    groups.set(date, rows);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, rows]) => ({
    date,
    payments: [...rows].sort((a, b) => a.paid_date.localeCompare(b.paid_date) || (a.students?.name || '').localeCompare(b.students?.name || '', 'ko') || a.id.localeCompare(b.id)),
    ...summarizeDailyPayments(rows),
  }));
}