// 영어과(이재진) 급여 정산 규칙
export const ENGLISH_FEE = { middle: 250000, high: 320000 } as const;
export const SIBLING_DISCOUNT_TOTAL = 10000; // 형제 할인: 수강 과목 수로 나눠 영어 몫만 반영
export const PAY_RATE = 0.4;
export const TAX_RATE = 0.033;

/** 다과목 할인 중 영어과 부담분 */
export function multiSubjectEnglishDiscount(subjectCount: number): number {
  if (subjectCount >= 3) return 30000;
  if (subjectCount === 2) return 25000;
  return 0;
}

export function siblingEnglishDiscount(isSibling: boolean, subjectCount: number): number {
  if (!isSibling) return 0;
  return Math.round(SIBLING_DISCOUNT_TOTAL / Math.max(1, subjectCount));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 해당 월에서 [from, to] 사이 수업 요일(0=일) 횟수 */
export function countClassDays(year: number, month: number, days: number[], from?: string, to?: string): number {
  const last = new Date(year, month, 0).getDate();
  let c = 0;
  for (let d = 1; d <= last; d++) {
    const iso = `${year}-${pad(month)}-${pad(d)}`;
    if (from && iso < from) continue;
    if (to && iso > to) continue;
    if (days.includes(new Date(year, month - 1, d).getDay())) c++;
  }
  return c;
}

export interface PayrollInput {
  schoolLevel: string | null;
  subjectCount: number;
  isSibling: boolean;
  days: number[];
  startDate: string;
  endDate: string | null;
  month: string; // yyyy-MM
}

export function computeEnglishFee(i: PayrollInput) {
  const [y, m] = i.month.split('-').map(Number);
  const base = i.schoolLevel === '고' ? ENGLISH_FEE.high : ENGLISH_FEE.middle;
  const sib = siblingEnglishDiscount(i.isSibling, i.subjectCount);
  const multi = multiSubjectEnglishDiscount(i.subjectCount);
  const monthly = base - sib - multi;
  const total = countClassDays(y, m, i.days);
  const attended = countClassDays(y, m, i.days, i.startDate, i.endDate || undefined);
  const ratio = total > 0 ? attended / total : 0;
  const fee = Math.round(monthly * ratio);
  return { base, sib, multi, monthly, total, attended, fee };
}

export function computePay(fee: number) {
  const gross = Math.round(fee * PAY_RATE);
  const tax = Math.round(gross * TAX_RATE);
  return { gross, tax, net: gross - tax };
}
