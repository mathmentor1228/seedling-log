import { describe, expect, it } from 'vitest';
import { isUpcomingUnpaid, splitUnpaidByDue, unpaidSummary } from './unpaidDue';
import { filterTuitionStudents } from './tuitionCalendarFilters';

const row = (name: string, day: number, paid = 0, extra: Record<string, unknown> = {}) =>
  ({ id: name, name, payment_due_day: day, totalFee: 330000, paidAmount: paid, school: null, grade: null, isPaid: paid >= 330000, ...extra });

describe('미납 명단 기한 규칙', () => {
  it('11월 11일에는 납부일 11일 학생은 미납, 29일 학생은 기한 전이다', () => {
    const { due, upcoming } = splitUnpaidByDue([row('29일', 29), row('11일', 11)], '2026-11', '2026-11-11');
    expect(due.map(s => s.id)).toEqual(['11일']);
    expect(upcoming.map(s => s.id)).toEqual(['29일']);
  });
  it('완납 학생은 어느 쪽에도 넣지 않는다', () => {
    const { due, upcoming } = splitUnpaidByDue([row('완납', 1, 330000), row('완납2', 29, 330000)], '2026-11', '2026-11-11');
    expect(due).toEqual([]);
    expect(upcoming).toEqual([]);
  });
  it('저장된 청구 납부기한이 학생 납부일보다 우선한다', () => {
    expect(isUpcomingUnpaid(row('변경', 29, 0, { dueDate: '2026-11-05' }), '2026-11', '2026-11-11')).toBe(false);
  });
  it('다음 달 미납은 모두 기한 전이다', () => {
    const { due, upcoming } = splitUnpaidByDue([row('a', 1), row('b', 15)], '2026-12', '2026-11-11');
    expect(due).toEqual([]);
    expect(upcoming).toHaveLength(2);
  });
  it('납부기한, 이름 순으로 정렬한다', () => {
    const { due } = splitUnpaidByDue([row('다', 5), row('가', 5), row('나', 1)], '2026-11', '2026-11-11');
    expect(due.map(s => s.id)).toEqual(['나', '가', '다']);
  });
  it('인원과 잔액은 보이는 명단만 센다', () => {
    expect(unpaidSummary([row('a', 1), row('b', 1, 100000)])).toEqual({ unpaid: 1, partial: 1, count: 2, balance: 560000 });
  });
  it('달력의 미납·부분납 필터는 스위치가 꺼지면 기한 전 학생을 뺀다', () => {
    const students = [row('11일', 11), row('29일', 29)];
    const upcoming = (s: typeof students[number]) => isUpcomingUnpaid(s, '2026-11', '2026-11-11');
    expect(filterTuitionStudents(students, '', 'unpaid', upcoming).map(s => s.id)).toEqual(['11일']);
    expect(filterTuitionStudents(students, '', 'unpaid').map(s => s.id)).toEqual(['11일', '29일']);
  });
});
