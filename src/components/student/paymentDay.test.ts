import { describe, it, expect } from 'vitest';
import { firstLessonPaymentDay } from './paymentDay';

describe('firstLessonPaymentDay', () => {
  it('첫 수업일의 날짜를 결제일로 사용', () => {
    expect(firstLessonPaymentDay('2026-10-17')).toBe(17);
  });
  it('첫 수업일이 없으면 기본값 없음', () => {
    expect(firstLessonPaymentDay(null)).toBeNull();
  });
});
