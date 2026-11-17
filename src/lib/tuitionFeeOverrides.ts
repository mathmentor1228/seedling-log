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
// Client mirror of student_monthly_fee for previews (#34): override first, else course fees with
// multi-subject/sibling discounts only when no course has a directly set fee.
export interface FeePreviewCourse { id: string; is_active: boolean; enrollment_date: string; end_date?: string | null; custom_monthly_fee?: number | string | null; course_policies?: { subject?: string | null; monthly_fee?: number | string | null } | null }
const MULTI_DISCOUNT = (n: number) => n >= 4 ? 100000 : n === 3 ? 80000 : n === 2 ? 50000 : 0;
export function projectedMonthlyFee(input: { month: string; courses: FeePreviewCourse[]; edit?: { courseId: string; fee: number | null }; siblingCount: number; overrides: FeeOverride[]; enrollmentStatus: string }): { total: number; override?: FeeOverride } {
  if (!['재학', '재등원'].includes(input.enrollmentStatus)) return { total: 0 };
  const override = applyingFeeOverride(input.overrides, input.month, input.enrollmentStatus);
  if (override) return { total: override.amount, override };
  const [y, m] = input.month.split('-').map(Number);
  const start = `${input.month}-01`, end = `${input.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const active = input.courses.filter(c => c.is_active && c.enrollment_date <= end && (!c.end_date || c.end_date >= start))
    .map(c => input.edit && c.id === input.edit.courseId ? { ...c, custom_monthly_fee: input.edit.fee } : c);
  const gross = active.reduce((sum, c) => sum + Number(c.custom_monthly_fee ?? c.course_policies?.monthly_fee ?? 0), 0);
  if (gross === 0) return { total: 0 };
  if (active.some(c => c.custom_monthly_fee != null)) return { total: gross };
  const subjects = new Set(active.map(c => c.course_policies?.subject).filter(Boolean)).size;
  return { total: Math.max(0, gross - MULTI_DISCOUNT(subjects) - (input.siblingCount > 1 ? 10000 : 0)) };
}
