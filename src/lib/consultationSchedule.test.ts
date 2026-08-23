import { describe, expect, it } from 'vitest';
import { consultationSlotsForDate, isValidConsultationSlot } from './consultationSchedule';

describe('상담 예약 가능 시간', () => {
  it('월·수는 21:00과 21:30만 허용한다', () => {
    expect(consultationSlotsForDate('2026-08-24')).toEqual(['21:00', '21:30']);
    expect(consultationSlotsForDate('2026-08-26')).toEqual(['21:00', '21:30']);
  });

  it('화·목은 10:00부터 17:30까지 30분 단위로 허용한다', () => {
    const slots = consultationSlotsForDate('2026-08-25');
    expect(slots[0]).toBe('10:00');
    expect(slots.at(-1)).toBe('17:30');
    expect(slots).toHaveLength(16);
  });

  it('금·토·일과 잘못된 시간은 거부한다', () => {
    expect(consultationSlotsForDate('2026-08-28')).toEqual([]);
    expect(isValidConsultationSlot('2026-08-24', '20:30')).toBe(false);
    expect(isValidConsultationSlot('2026-08-25', '18:00')).toBe(false);
  });
});

