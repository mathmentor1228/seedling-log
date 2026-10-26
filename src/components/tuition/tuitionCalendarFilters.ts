import { dueDate, paymentMonth, type LedgerPayment } from '@/lib/tuitionLedger';

export type TuitionStatusFilter = 'all' | 'unpaid' | 'paid';
export type TuitionSortKey = 'due_date' | 'name' | 'school' | 'fee' | 'unpaid_amount' | 'paid_date';
export type TuitionSortDirection = 'asc' | 'desc';
export type TuitionPaymentView = 'all' | 'paid' | '7' | '30';

export interface TuitionListPayment extends LedgerPayment {
  id: string;
  paid_date: string;
  source?: string | null;
  payment_method?: string | null;
  needs_review?: boolean;
}

export function matchesTuitionPaymentSource(payment: TuitionListPayment, source: string): boolean {
  if (source === 'all') return true;
  if (source === 'bank') return payment.source === '계좌이체문자' || payment.payment_method === '계좌이체';
  if (source === '수기') return !payment.source || payment.source === '수기';
  return payment.source === source;
}

// Filter individual records first: a student's older payment from another source must not qualify.
export function filterTuitionListPayments<T extends TuitionListPayment>(
  payments: T[], month: string, source: string, view: TuitionPaymentView, today: string,
): T[] {
  const days = view === '7' ? 7 : view === '30' ? 30 : null;
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const from = days === null ? null : new Date(todayTime - (days - 1) * 86400000).toISOString().slice(0, 10);
  return payments.filter(payment => {
    if (payment.canceled_at || paymentMonth(payment) !== month || !matchesTuitionPaymentSource(payment, source)) return false;
    if (!from) return true;
    return payment.paid_date >= from && payment.paid_date <= today;
  });
}

export function filterTuitionStudentsByPayment<T extends {id: string}>(
  students: T[], payments: TuitionListPayment[], onlyPayments: boolean,
): T[] {
  if (!onlyPayments) return students;
  const studentIds = new Set(payments.map(payment => payment.student_id));
  return students.filter(student => studentIds.has(student.id));
}

export function latestTuitionPaymentDate(payments: TuitionListPayment[], studentId: string): string {
  return payments.filter(payment => payment.student_id === studentId && !payment.canceled_at)
    .reduce((latest, payment) => payment.paid_date > latest ? payment.paid_date : latest, '');
}

interface FilterableStudent {
  name: string;
  school: string | null;
  grade: string | null;
  totalFee: number;
  isPaid: boolean;
}

export function filterTuitionStudents<T extends FilterableStudent>(
  students: T[],
  search: string,
  status: TuitionStatusFilter,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  return students.filter(student => {
    const matchesSearch = !query || [student.name, student.school, student.grade]
      .some(value => value?.toLocaleLowerCase().includes(query));
    const matchesStatus = status === 'all'
      || (status === 'unpaid' && student.totalFee > 0 && !student.isPaid)
      || (status === 'paid' && student.isPaid);
    return matchesSearch && matchesStatus;
  });
}

interface SortableStudent extends FilterableStudent {
  id: string;
  payment_due_day: number;
  scheduledDueDate?: string | null;
  paidAmount: number;
}

const koreanOrder = new Intl.Collator('ko', { numeric: true });

export function sortTuitionStudents<T extends SortableStudent>(
  students: T[],
  month: string,
  key: TuitionSortKey,
  direction: TuitionSortDirection,
  payments: TuitionListPayment[] = [],
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...students].sort((a, b) => {
    let result = 0;
    switch (key) {
      case 'paid_date':
        result = latestTuitionPaymentDate(payments, a.id).localeCompare(latestTuitionPaymentDate(payments, b.id));
        break;
      case 'due_date':
        result = (a.scheduledDueDate === undefined ? dueDate(month, a.payment_due_day) : a.scheduledDueDate || '9999-12-31')
          .localeCompare(b.scheduledDueDate === undefined ? dueDate(month, b.payment_due_day) : b.scheduledDueDate || '9999-12-31');
        break;
      case 'name':
        result = koreanOrder.compare(a.name, b.name);
        break;
      case 'school':
        result = koreanOrder.compare(a.school || '', b.school || '')
          || koreanOrder.compare(a.grade || '', b.grade || '');
        break;
      case 'fee':
        result = a.totalFee - b.totalFee;
        break;
      case 'unpaid_amount':
        result = Math.max(0, a.totalFee - a.paidAmount) - Math.max(0, b.totalFee - b.paidAmount);
        break;
    }
    return result * sign || koreanOrder.compare(a.name, b.name) || a.id.localeCompare(b.id);
  });
}