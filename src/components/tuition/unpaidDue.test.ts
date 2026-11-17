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

import { buildDueRangeRows, overdueRange, rangeSummary, type RangeBill } from './unpaidDue';
describe('기간 선택 미납 (#32 V2)', () => {
  const st = (name: string, day: number, extra: Record<string, unknown> = {}) => ({ id: name, name, payment_due_day: day, enrollment_status: '재학', ...extra });
  const bill = (name: string, month: string, day: number, extra: Partial<RangeBill> = {}, student: Record<string, unknown> = {}): RangeBill =>
    ({ id: `${name}-${month}`, student_id: name, billing_month: month, due_date: null, status: 'pending', final_amount: 320000, students: st(name, day, student), ...extra });
  it('기본 기간은 이번 달 1일부터 오늘까지', () => { expect(overdueRange('today', '2026-11-17')).toEqual({ from: '2026-11-01', to: '2026-11-17' }); });
  it('이번 주는 월요일부터, 지난 7일은 6일 전부터, 이번 달은 말일까지', () => {
    expect(overdueRange('week', '2026-11-17')).toEqual({ from: '2026-11-16', to: '2026-11-17' });
    expect(overdueRange('last7', '2026-11-17')).toEqual({ from: '2026-11-11', to: '2026-11-17' });
    expect(overdueRange('month', '2026-11-17')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
  it('17일 기본 기간에 납부일 29일 학생은 미납 명단에 없고 기한 전으로만 보인다', () => {
    const { due, upcoming } = buildDueRangeRows([bill('29일', '2026-11', 29), bill('6일', '2026-11', 6)], [], '2026-11-01', '2026-11-17');
    expect(due.map(r => r.student.id)).toEqual(['6일']);
    expect(upcoming.map(r => r.student.id)).toEqual(['29일']);
  });
  it('청구월이 아니라 납부기한으로 거른다: 기간을 넓히면 10월분 미납도 보인다', () => {
    const bills = [bill('윤선후', '2026-10', 21), bill('신규', '2026-11', 6)];
    expect(buildDueRangeRows(bills, [], '2026-11-01', '2026-11-17').due.map(r => r.student.id)).toEqual(['신규']);
    expect(buildDueRangeRows(bills, [], '2026-10-01', '2026-11-17').due.map(r => r.student.id)).toEqual(['윤선후', '신규']);
  });
  it('완납·취소 청구는 빼고 부분납은 잔액만 센다', () => {
    const bills = [bill('완납', '2026-11', 3), bill('부분', '2026-11', 4), bill('취소', '2026-11', 5, { status: 'cancelled' })];
    const pays = [{ student_id: '완납', amount: 320000, billing_month: '2026-11' }, { student_id: '부분', amount: 100000, billing_month: '2026-11' }];
    const { due } = buildDueRangeRows(bills, pays, '2026-11-01', '2026-11-17');
    expect(due.map(r => [r.student.id, r.state, r.balance])).toEqual([['부분', '부분납', 220000]]);
    expect(rangeSummary(due)).toEqual({ unpaid: 0, partial: 1, count: 1, balance: 220000 });
  });
  it('퇴원생의 퇴원 당월 청구에는 확인 표시가 붙는다', () => {
    const { due } = buildDueRangeRows([bill('퇴원', '2026-11', 3, {}, { enrollment_status: '퇴원', withdrawal_last_class_date: '2026-11-12' })], [], '2026-11-01', '2026-11-17');
    expect(due[0].withdrawalCheck).toBe(true);
  });
});
