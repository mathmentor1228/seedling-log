import { LEDGER_START } from '@/lib/tuitionLedger';

// 출결버스 과거 수납이 2022년부터 들어오므로 그 해까지 달력으로 이동할 수 있다.
export const MONTH_JUMP_EARLIEST_YEAR = Number(LEDGER_START.slice(0, 4)) - 4;

export function monthJumpYears(currentYear: number): number[] {
  const years: number[] = [];
  for (let year = currentYear + 1; year >= MONTH_JUMP_EARLIEST_YEAR; year -= 1) years.push(year);
  return years;
}

export function monthJumpTarget(year: string | number, month: string | number): string | null {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m)) return null;
  if (y < MONTH_JUMP_EARLIEST_YEAR || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
}
