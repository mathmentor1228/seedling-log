import { dueDate } from '@/lib/tuitionLedger';

export type TuitionStatusFilter = 'all' | 'unpaid' | 'paid';
export type TuitionSortKey = 'due_date' | 'name' | 'school' | 'fee' | 'unpaid_amount';
export type TuitionSortDirection = 'asc' | 'desc';

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
  paidAmount: number;
}

const koreanOrder = new Intl.Collator('ko', { numeric: true });

export function sortTuitionStudents<T extends SortableStudent>(
  students: T[],
  month: string,
  key: TuitionSortKey,
  direction: TuitionSortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...students].sort((a, b) => {
    let result = 0;
    switch (key) {
      case 'due_date':
        result = dueDate(month, a.payment_due_day).localeCompare(dueDate(month, b.payment_due_day));
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