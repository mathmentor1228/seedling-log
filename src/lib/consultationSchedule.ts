export const CONSULTATION_SCHEDULE_LABEL =
  '월·수 오후 9시~10시 · 화·목 오전 10시~오후 6시';

const WEEKDAY_SLOTS: Record<number, string[]> = {
  1: ['21:00', '21:30'],
  2: Array.from({ length: 16 }, (_, index) => {
    const totalMinutes = 10 * 60 + index * 30;
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }),
  3: ['21:00', '21:30'],
  4: Array.from({ length: 16 }, (_, index) => {
    const totalMinutes = 10 * 60 + index * 30;
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }),
};

export function consultationSlotsForDate(date: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) return [];
  return WEEKDAY_SLOTS[parsed.getDay()] || [];
}

export function isValidConsultationSlot(date: string, time: string): boolean {
  return consultationSlotsForDate(date).includes(time);
}

