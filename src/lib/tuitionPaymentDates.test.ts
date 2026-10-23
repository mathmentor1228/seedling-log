import {describe, expect, it} from 'vitest';
import {paymentDayDifference, paymentScheduledDate, scheduledPaymentDate, studentMonthPaymentDates, type DatedTuitionPayment} from './tuitionPaymentDates';

const payment: DatedTuitionPayment = {id: 'a', student_id: 'student', amount: 100000, billing_month: '2026-10', paid_date: '2026-10-08'};

describe('원비 예정일과 실제 납부일 비교', () => {
  it('예정일보다 이틀 늦은 납부는 +2일이다', () => {
    expect(paymentDayDifference('2026-10-06', '2026-10-08')).toBe(2);
  });
  it('예정일보다 사흘 빠른 납부는 -3일이다', () => {
    expect(paymentDayDifference('2026-10-06', '2026-10-03')).toBe(-3);
  });
  it('당일 납부는 0일이다', () => {
    expect(paymentDayDifference('2026-10-06', '2026-10-06')).toBe(0);
  });
  it('9월 귀속 원비를 10월에 내면 9월 예정일과 비교한다', () => {
    const due = paymentScheduledDate({...payment, billing_month: '2026-09', paid_date: '2026-10-06'}, [], 6);
    expect(due.date).toBe('2026-09-06');
    expect(paymentDayDifference(due.date, '2026-10-06')).toBe(30);
  });
  it('저장된 청구기한은 현재 학생 납입일보다 우선한다', () => {
    expect(paymentScheduledDate({...payment, billing_schedules: {billing_month: '2026-10', due_date: '2026-10-24'}}, [], 6)).toEqual({date: '2026-10-24', basis: 'billing'});
  });
  it('미연결 납부도 같은 학생과 귀속월의 저장된 청구기한을 찾는다', () => {
    expect(paymentScheduledDate(payment, [{student_id: 'student', billing_month: '2026-10', due_date: '2026-10-06'}], 24)).toEqual({date: '2026-10-06', basis: 'billing'});
  });
  it('다른 귀속월에 연결된 청구의 날짜를 사용하지 않는다', () => {
    expect(paymentScheduledDate({...payment, billing_schedules: {billing_month: '2026-09', due_date: '2026-09-24'}}, [], 6)).toEqual({date: '2026-10-06', basis: 'current'});
  });
  it('청구기한이 없으면 현재 설정 기준임을 구분하고 월말로 제한한다', () => {
    expect(scheduledPaymentDate('student', '2026-11', [], 31)).toEqual({date: '2026-11-30', basis: 'current'});
  });
  it('여러 청구의 기한이 다르면 임의로 하나를 선택하지 않는다', () => {
    expect(scheduledPaymentDate('student', '2026-10', [{student_id: 'student', billing_month: '2026-10', due_date: '2026-10-06'}, {student_id: 'student', billing_month: '2026-10', due_date: '2026-10-24'}], 6)).toEqual({date: null, basis: 'unknown'});
  });
  it('취소 청구기한은 사용하지 않는다', () => {
    expect(scheduledPaymentDate('student', '2026-10', [{student_id: 'student', billing_month: '2026-10', due_date: '2026-10-24', status: 'cancelled'}], 6)).toEqual({date: '2026-10-06', basis: 'current'});
  });
  it('학생 또는 귀속월이 없으면 비교 날짜를 추정하지 않는다', () => {
    expect(paymentScheduledDate({...payment, student_id: ''}, [], 6).date).toBeNull();
    expect(paymentScheduledDate({...payment, billing_month: null}, [], 6).date).toBeNull();
  });
  it('날짜가 잘못되거나 없으면 차이를 0일로 표시하지 않는다', () => {
    expect(paymentDayDifference('2026-02-30', '2026-03-01')).toBeNull();
    expect(paymentDayDifference('2026-10-06', '')).toBeNull();
    expect(paymentDayDifference(null, '2026-10-06')).toBeNull();
  });
  it('분할납은 각각의 날짜를 보존하고 취소 및 다른 귀속월은 제외한다', () => {
    const rows = [{...payment, id: 'b', paid_date: '2026-10-10', needs_review: true}, payment, {...payment, id: 'c', canceled_at: '2026-10-09'}, {...payment, id: 'd', billing_month: '2026-09'}];
    expect(studentMonthPaymentDates(rows, 'student', '2026-10').map(row => [row.id, row.paid_date])).toEqual([['a', '2026-10-08'], ['b', '2026-10-10']]);
    expect(rows[0].id).toBe('b');
  });
});