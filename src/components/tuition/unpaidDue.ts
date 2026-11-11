import { useEffect, useState } from 'react';
import { dueDate } from '@/lib/tuitionLedger';

export const SHOW_UPCOMING_KEY = 'tuition.overdue.showUpcoming';

export interface DueJudgedStudent {
  id: string;
  name: string;
  payment_due_day: number;
  dueDate?: string | null;
  totalFee: number;
  paidAmount: number;
}

const koreanOrder = new Intl.Collator('ko', { numeric: true });

export function studentDueDate(student: Pick<DueJudgedStudent, 'payment_due_day' | 'dueDate'>, month: string): string {
  return student.dueDate || dueDate(month, student.payment_due_day);
}

export function isUnpaid(student: Pick<DueJudgedStudent, 'totalFee' | 'paidAmount'>): boolean {
  return student.totalFee > 0 && student.paidAmount < student.totalFee;
}

// Upcoming = still owes money but the due date is after today (today itself counts as due).
export function isUpcomingUnpaid(student: DueJudgedStudent, month: string, today: string): boolean {
  return isUnpaid(student) && studentDueDate(student, month) > today;
}

export function splitUnpaidByDue<T extends DueJudgedStudent>(students: T[], month: string, today: string): { due: T[]; upcoming: T[] } {
  const sorted = students.filter(isUnpaid).sort((a, b) =>
    studentDueDate(a, month).localeCompare(studentDueDate(b, month)) || koreanOrder.compare(a.name, b.name) || a.id.localeCompare(b.id));
  return {
    due: sorted.filter(s => studentDueDate(s, month) <= today),
    upcoming: sorted.filter(s => studentDueDate(s, month) > today),
  };
}

export function unpaidSummary(rows: Pick<DueJudgedStudent, 'totalFee' | 'paidAmount'>[]) {
  return {
    unpaid: rows.filter(s => s.paidAmount <= 0).length,
    partial: rows.filter(s => s.paidAmount > 0).length,
    count: rows.length,
    balance: rows.reduce((sum, s) => sum + Math.max(0, s.totalFee - s.paidAmount), 0),
  };
}

function readShowUpcoming(): boolean {
  try { return localStorage.getItem(SHOW_UPCOMING_KEY) === '1'; } catch { return false; }
}

// Shared by the 미납 tab and the calendar tab so both always count the same students.
export function useShowUpcomingUnpaid(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(readShowUpcoming);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === SHOW_UPCOMING_KEY) setValue(readShowUpcoming()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = (next: boolean) => {
    setValue(next);
    try { localStorage.setItem(SHOW_UPCOMING_KEY, next ? '1' : '0'); } catch { /* storage unavailable: keep in memory */ }
  };
  return [value, update];
}
