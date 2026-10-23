import { LEDGER_START } from './tuitionLedger';

export interface FeeOverride { id: string; from_month: string; amount: number; note: string | null }
export function nextTuitionMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return `${year + (number === 12 ? 1 : 0)}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}`;
}
export function validOverrideInput(month: string, amount: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= LEDGER_START && amount.trim() !== '' && Number.isSafeInteger(Number(amount)) && Number(amount) >= 0 && Number(amount) <= 2147483647;
}
export function applyingFeeOverride(rows: FeeOverride[], month: string, enrollmentStatus: string): FeeOverride | undefined {
  if (!['재학', '재등원'].includes(enrollmentStatus)) return undefined;
  return rows.filter(row => row.from_month <= month).sort((a, b) => b.from_month.localeCompare(a.from_month))[0];
}
export interface RepriceBilling { id: string; student_id: string; status: string; base_amount: number; final_amount: number; discount_amount: number; extra_amount?: number | null }
export function pendingRepriceChanges(rows: RepriceBilling[], fees: Record<string, number>, month: string) {
  if (month < LEDGER_START) throw new Error('2026년 10월부터 다시 계산할 수 있습니다');
  return rows.filter(row => row.status === 'pending').flatMap(row => {
    const base = fees[row.student_id];
    if (!Number.isSafeInteger(base) || base < 0) throw new Error('월 원비 조회 실패');
    const final = base - Number(row.discount_amount || 0) + Number(row.extra_amount || 0);
    return Number(row.base_amount) === base && Number(row.final_amount) === final ? [] : [{ row, base_amount: base, final_amount: final }];
  });
}