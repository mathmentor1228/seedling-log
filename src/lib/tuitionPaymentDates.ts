import {dueDate, paymentMonth, type LedgerPayment} from './tuitionLedger';

export interface PaymentSchedule {
  student_id?: string;
  billing_month?: string | null;
  due_date?: string | null;
  status?: string;
}

export interface DatedTuitionPayment extends LedgerPayment {
  id: string;
  paid_date: string;
  needs_review?: boolean;
  billing_schedules?: PaymentSchedule | null;
}

export interface ScheduledPaymentDate {
  date: string | null;
  basis: 'billing' | 'current' | 'unknown';
}

function dateTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

// Saved bill dates are historical snapshots; current student settings are only a labelled fallback.
export function scheduledPaymentDate(studentId: string, month: string | null, schedules: PaymentSchedule[], dueDay?: number | null): ScheduledPaymentDate {
  if (!studentId || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return {date: null, basis: 'unknown'};
  const matching = schedules.filter(schedule => schedule.student_id === studentId && schedule.billing_month === month && schedule.status !== 'cancelled');
  if (matching.length) {
    const dates = [...new Set(matching.map(schedule => schedule.due_date))];
    const date = dates[0];
    return dates.length === 1 && date && dateTimestamp(date) !== null ? {date, basis: 'billing'} : {date: null, basis: 'unknown'};
  }
  if (!dueDay || !Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) return {date: null, basis: 'unknown'};
  return {date: dueDate(month, dueDay), basis: 'current'};
}

export function paymentScheduledDate(payment: DatedTuitionPayment, schedules: PaymentSchedule[] = [], dueDay?: number | null): ScheduledPaymentDate {
  const month = paymentMonth(payment);
  const linked = payment.billing_schedules;
  if (linked && linked.billing_month === month && linked.status !== 'cancelled') {
    return scheduledPaymentDate(payment.student_id, month, [{...linked, student_id: payment.student_id}]);
  }
  return scheduledPaymentDate(payment.student_id, month, schedules, dueDay);
}

export function paymentDayDifference(scheduled: string | null, paid: string): number | null {
  if (!scheduled) return null;
  const scheduledTime = dateTimestamp(scheduled), paidTime = dateTimestamp(paid);
  return scheduledTime === null || paidTime === null ? null : (paidTime - scheduledTime) / 86400000;
}

export function studentMonthPaymentDates<T extends DatedTuitionPayment>(payments: T[], studentId: string, month: string): T[] {
  return payments.filter(payment => payment.student_id === studentId && !payment.canceled_at && paymentMonth(payment) === month)
    .sort((a, b) => a.paid_date.localeCompare(b.paid_date) || a.id.localeCompare(b.id));
}