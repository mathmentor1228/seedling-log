export const LEDGER_START = '2026-10';
export interface LedgerPayment { student_id: string; amount: number; billing_month?: string | null; canceled_at?: string | null; billing_schedules?: { billing_month?: string | null } | null }
export function paymentMonth(p: LedgerPayment): string | null { return p.billing_month || p.billing_schedules?.billing_month || null; }
export function paidForMonth(payments: LedgerPayment[], studentId: string, month: string): number {
  return payments.filter(p => p.student_id === studentId && !p.canceled_at && paymentMonth(p) === month).reduce((sum,p) => sum + Number(p.amount),0);
}
export function paymentStatus(fee: number, paid: number) { return fee <= 0 ? 'none' : paid >= fee ? 'paid' : paid > 0 ? 'partial' : 'unpaid'; }
export function dueDate(month: string, day: number) {
  const [y,m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(Math.max(1,day || 1),new Date(y,m,0).getDate())).padStart(2,'0')}`;
}
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
  const depositor = text.match(/(?:입금자(?:명)?|보낸분|보낸사람)\s*[:：]?\s*([^\n,|]+)/);
  if (approval) return `승인번호 ${approval[1]}`;
  if (depositor) return `입금자 ${depositor[1].trim()}`;
  return p.external_id ? `외부번호 ${p.external_id}` : '';
}
export function buildStudentBillings(students: {id:string;payment_due_day:number}[], fees: Record<string,number>, existingStudentIds: Set<string>, month: string, intensive: Record<string,{fee:number;memo:string}> = {}) {
  if (month < LEDGER_START) throw new Error('2026년 10월부터 청구를 생성할 수 있습니다');
  return students.filter(s => (fees[s.id] || 0) > 0 && !existingStudentIds.has(s.id)).map(s => {
    const fee=fees[s.id]; const extra=intensive[s.id]?.fee || 0;
    return {student_id:s.id,student_course_id:null,billing_month:month,base_amount:fee,discount_amount:0,extra_amount:extra,extra_memo:intensive[s.id]?.memo || null,final_amount:fee+extra,due_date:dueDate(month,s.payment_due_day),status:'pending'};
  });
}
