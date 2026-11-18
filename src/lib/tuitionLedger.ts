import { getTodayKST } from './utils';
export const LEDGER_START = '2026-10';
export interface LedgerPayment { student_id: string; amount: number; billing_month?: string | null; canceled_at?: string | null; billing_schedules?: { billing_month?: string | null } | null }
export function paymentMonth(p: LedgerPayment): string | null { return p.billing_month || p.billing_schedules?.billing_month || null; }
// Unknown months still require review; only known pre-ledger months are excluded.
export function isLedgerReviewPayment(p: LedgerPayment): boolean { const month = paymentMonth(p); return month === null || month >= LEDGER_START; }
export function paidForMonth(payments: LedgerPayment[], studentId: string, month: string): number {
  return payments.filter(p => p.student_id === studentId && !p.canceled_at && paymentMonth(p) === month).reduce((sum,p) => sum + Number(p.amount),0);
}
export function paymentStatus(fee: number, paid: number) { return fee <= 0 ? 'none' : paid >= fee ? 'paid' : paid > 0 ? 'partial' : 'unpaid'; }
export function dueDate(month: string, day: number) {
  const [y,m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(Math.max(1,day || 1),new Date(y,m,0).getDate())).padStart(2,'0')}`;
}
// Today inclusive: a student whose due date is today already belongs on the unpaid list.
export function isDueByToday(month: string, dueDay: number, today = getTodayKST()) { return dueDate(month, dueDay) <= today; }
export function ledgerMonths(end: string): string[] {
  const list: string[] = [];
  let [y,m] = LEDGER_START.split('-').map(Number);
  while (`${y}-${String(m).padStart(2,'0')}` <= end) { list.push(`${y}-${String(m).padStart(2,'0')}`); if (++m > 12) { m=1; y++; } }
  return list;
}
export function billingDisplayStatus(row: { status: string; due_date: string }, today: string) { return row.status === 'pending' && row.due_date < today ? 'overdue' : row.status; }
export function paymentReference(p: { raw_text?: string | null; memo?: string | null; external_id?: string | null }) {
  const text = `${p.raw_text || ''}\n${p.memo || ''}`;
  const approval = text.match(/승인(?:번호)?\s*[:：]?\s*([A-Za-z0-9-]+)/);
  const depositor = text.match(/(?:입금자(?:명)?|보낸분|보낸사람)\s*[:：]?\s*([^\n,|·]+)/);
  if (approval) return `승인번호 ${approval[1]}`;
  if (depositor) return `입금자 ${depositor[1].trim()}`;
  return p.external_id ? `외부번호 ${p.external_id}` : '';
}
export function receiptCourseNames(courses: {is_active:boolean;enrollment_date:string;end_date?:string|null;course_policies?:{subject:string;course_name:string}|null}[], month:string): string {
  const lastDate=dueDate(month,31);
  const names=courses.filter(c=>c.is_active && c.enrollment_date<=lastDate && (!c.end_date||c.end_date>=`${month}-01`)).map(c=>c.course_policies?`${c.course_policies.subject} · ${c.course_policies.course_name}`:'').filter(Boolean);
  return [...new Set(names)].join(', ');
}
export function buildStudentBillings(students: {id:string;payment_due_day:number}[], fees: Record<string,number>, existingStudentIds: Set<string>, month: string, intensive: Record<string,{fee:number;memo:string}> = {}) {
  if (month < LEDGER_START) throw new Error('2026년 10월부터 청구를 생성할 수 있습니다');
  return students.filter(s => (fees[s.id] || 0) > 0 && !existingStudentIds.has(s.id)).map(s => {
    const fee=fees[s.id]; const extra=intensive[s.id]?.fee || 0;
    return {student_id:s.id,student_course_id:null,billing_month:month,base_amount:fee,discount_amount:0,extra_amount:extra,extra_memo:intensive[s.id]?.memo || null,final_amount:fee+extra,due_date:dueDate(month,s.payment_due_day),status:'pending'};
  });
}
export interface PaymentExcess { required: number; alreadyPaid: number; after: number; excess: number }
// Fixed monthly fees: any entry that would push a month's total above the fee needs explicit confirmation.
export function paymentExcess(required: number, alreadyPaid: number, amount: number): PaymentExcess | null {
  const after = alreadyPaid + amount;
  const excess = after - Math.max(0, required);
  return excess > 0 ? { required: Math.max(0, required), alreadyPaid, after, excess } : null;
}

// ---- Due-date ranges (#32 V2) ----
// A saved bill due date wins; otherwise the student's due day in the bill's month (clamped to month end).
export function effectiveDueDate(bill: { billing_month: string; due_date: string | null }, paymentDueDay: number) { return bill.due_date ?? dueDate(bill.billing_month, paymentDueDay); }
// Inclusive on both ends ('YYYY-MM-DD' strings compare lexically).
export function inRange(d: string, from: string, to: string) { return d >= from && d <= to; }

// ---- Withdrawal base month (#33, mirrors cancel_bills_after_withdrawal) ----
export function kstDate(timestamp: string): string { return new Date(new Date(timestamp).getTime() + 9 * 3600_000).toISOString().slice(0, 10); }
export interface WithdrawalInfo { enrollment_status?: string | null; withdrawal_last_class_date?: string | null; withdrawn_at?: string | null }
// 퇴원: month of the last class, else month of the withdrawal date (KST). 휴학 has no stored change date.
export function withdrawalBaseMonth(s: WithdrawalInfo): string | null {
  if (s.enrollment_status !== '퇴원') return null;
  const date = s.withdrawal_last_class_date || (s.withdrawn_at ? kstDate(s.withdrawn_at) : null);
  return date ? date.slice(0, 7) : null;
}
// Bills in the base month are kept for the owner to decide; later months are auto-cancelled by the trigger.
export function needsWithdrawalMonthCheck(s: WithdrawalInfo, billingMonth: string): boolean {
  if (s.enrollment_status === '휴학') return true;
  const base = withdrawalBaseMonth(s);
  return base !== null && base === billingMonth;
}
export function autoCancelInfo(memo: string | null | undefined): { kind: '퇴원' | '휴학'; date: string } | null {
  const m = memo?.match(/자동취소:\s*(퇴원|휴학|기존 퇴원생 정리)\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return { kind: m[1] === '휴학' ? '휴학' : '퇴원', date: m[2] };
}

// #35: owner decisions on a bill are appended to the system memo (never replacing collector/auto-cancel lines).
export function appendMemoLine(memo: string | null | undefined, line: string): string { return memo && memo.trim() ? `${memo}\n${line}` : line; }
export function manualWithdrawalCancelDate(memo: string | null | undefined): string | null {
  const m = memo?.match(/퇴원 당월 취소:\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ---- Fee change sync (#34, mirrors apply_fee_change) ----
export interface FeeSyncBill { id: string; billing_month: string; status: string; final_amount: number | string; discount_amount?: number | string | null; extra_amount?: number | string | null; memo?: string | null }
export interface FeeSyncPayment { billing_schedule_id?: string | null; billing_month?: string | null; canceled_at?: string | null }
export function billAmountFor(bill: FeeSyncBill, newTotal: number) { return newTotal - Number(bill.discount_amount || 0) + Number(bill.extra_amount || 0); }
export function feeSyncTargets(bills: FeeSyncBill[], payments: FeeSyncPayment[], fromMonth: string, newTotal: number) {
  return bills.filter(b => {
    if (b.billing_month < fromMonth || b.billing_month < LEDGER_START) return false;
    if (b.status !== 'pending' && b.status !== 'overdue') return false;
    if (b.memo && b.memo.includes('원장')) return false;
    if (Number(b.final_amount) === billAmountFor(b, newTotal)) return false;
    if (payments.some(p => p.billing_schedule_id === b.id)) return false;
    if (payments.some(p => !p.canceled_at && p.billing_month === b.billing_month)) return false;
    // One bill row per student-month; legacy split months are left to manual review.
    if (bills.some(o => o.id !== b.id && o.billing_month === b.billing_month && o.status !== 'cancelled')) return false;
    return true;
  }).map(b => ({ bill: b, from: Number(b.final_amount), to: billAmountFor(b, newTotal) })).sort((a, b) => a.bill.billing_month.localeCompare(b.bill.billing_month));
}
// Default start month: this month, unless this month already has money (paid/partial or any payment) — then next month.
export function defaultFeeSyncMonth(bills: FeeSyncBill[], payments: FeeSyncPayment[], current: string): string {
  const touched = bills.some(b => b.billing_month === current && (b.status === 'paid' || b.status === 'partial'))
    || payments.some(p => !p.canceled_at && p.billing_month === current);
  if (!touched) return current;
  const [y, m] = current.split('-').map(Number);
  return `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
}
