/** 첫 수업일(YYYY-MM-DD)의 '일'을 원비 결제일 기본값으로 사용 */
export function firstLessonPaymentDay(firstDate: string | null | undefined): number | null {
  if (!firstDate || !/^\d{4}-\d{2}-\d{2}/.test(firstDate)) return null;
  const d = Number(firstDate.slice(8, 10));
  return d >= 1 && d <= 31 ? d : null;
}
