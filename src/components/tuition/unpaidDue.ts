import { useEffect, useState } from 'react';
import { LEDGER_START, dueDate, effectiveDueDate, inRange, needsWithdrawalMonthCheck, paidForMonth, type LedgerPayment, type WithdrawalInfo } from '@/lib/tuitionLedger';

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

// ---- Date-range 미납 (#32 V2) ----

export type OverdueRangePreset = 'today' | 'week' | 'last7' | 'month' | 'custom';
export const OVERDUE_RANGE_KEY = 'tuition.overdue.range';
export const OVERDUE_PRESETS: { key: OverdueRangePreset; label: string }[] = [
  { key: 'today', label: '오늘까지' }, { key: 'week', label: '이번 주' }, { key: 'last7', label: '지난 7일' }, { key: 'month', label: '이번 달' }, { key: 'custom', label: '직접 선택' },
];

function shiftDate(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10);
}
// All presets end at today except 이번 달 (through month end); 직접 선택 keeps the given dates.
export function overdueRange(preset: OverdueRangePreset, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'week': { const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); return { from: shiftDate(today, -((dow + 6) % 7)), to: today }; }
    case 'last7': return { from: shiftDate(today, -6), to: today };
    case 'month': { const [y, m] = today.split('-').map(Number); return { from: monthStart, to: `${today.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }; }
    case 'custom': return custom && custom.from && custom.to ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }) : { from: monthStart, to: today };
    default: return { from: monthStart, to: today };
  }
}
export function monthsAround(from: string, to: string): { start: string; end: string } {
  const add = (month: string, n: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const start = add(from.slice(0, 7), -1);
  return { start: start < LEDGER_START ? LEDGER_START : start, end: add(to.slice(0, 7), 1) };
}

export interface RangeBill { id: string; student_id: string; billing_month: string; due_date: string | null; status: string; final_amount: number | string; memo?: string | null; students: (WithdrawalInfo & { id: string; name: string; payment_due_day: number; school?: string | null; grade?: string | null; school_level?: string | null; grade_year?: number | null; parent_phone?: string | null; tuition_memo?: string | null }) | null }
export interface RangeUnpaidRow { key: string; student: NonNullable<RangeBill['students']>; billing_month: string; due: string; required: number; paid: number; balance: number; state: '미납' | '부분납'; withdrawalCheck: boolean }

// Bills are grouped per student-month (one required total, earliest due), paid = that month's non-canceled payments.
export function buildDueRangeRows(bills: RangeBill[], payments: LedgerPayment[], from: string, to: string): { due: RangeUnpaidRow[]; upcoming: RangeUnpaidRow[] } {
  const groups = new Map<string, RangeUnpaidRow>();
  for (const b of bills) {
    if (b.status === 'cancelled' || !b.students || b.billing_month < LEDGER_START) continue;
    const key = `${b.student_id}|${b.billing_month}`;
    const due = effectiveDueDate(b, b.students.payment_due_day);
    const row = groups.get(key);
    if (row) { row.required += Number(b.final_amount); if (due < row.due) row.due = due; continue; }
    groups.set(key, { key, student: b.students, billing_month: b.billing_month, due, required: Number(b.final_amount), paid: 0, balance: 0, state: '미납', withdrawalCheck: needsWithdrawalMonthCheck(b.students, b.billing_month) });
  }
  const rows = [...groups.values()].map(r => {
    const paid = paidForMonth(payments, r.student.id, r.billing_month);
    return { ...r, paid, balance: r.required - paid, state: (paid > 0 ? '부분납' : '미납') as RangeUnpaidRow['state'] };
  }).filter(r => r.required > 0 && r.balance > 0)
    .sort((a, b) => a.due.localeCompare(b.due) || koreanOrder.compare(a.student.name, b.student.name) || a.key.localeCompare(b.key));
  const toMonth = to.slice(0, 7);
  return {
    due: rows.filter(r => inRange(r.due, from, to)),
    upcoming: rows.filter(r => r.due > to && r.billing_month <= toMonth),
  };
}
export function rangeSummary(rows: Pick<RangeUnpaidRow, 'state' | 'balance'>[]) {
  return { unpaid: rows.filter(r => r.state === '미납').length, partial: rows.filter(r => r.state === '부분납').length, count: rows.length, balance: rows.reduce((s, r) => s + r.balance, 0) };
}
