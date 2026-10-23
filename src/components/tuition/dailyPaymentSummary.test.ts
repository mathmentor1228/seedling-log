import {describe, expect, it} from 'vitest';
import {filterDailyPayments, groupDailyPayments, paymentRecordDate, paymentRecordState, summarizeDailyPayments, type DailyPayment, type DailyPaymentFilters} from './dailyPaymentSummary';

const payment: DailyPayment = {id: 'a', student_id: 'student-a', amount: 320000, paid_date: '2026-10-22', created_at: '2026-10-23T15:02:00Z', source: '결제선생', billing_month: '2026-09', students: {name: '김민재', school: '신길고'}};
const filters: DailyPaymentFilters = {from: '2026-10-01', to: '2026-10-31', source: 'imported', state: 'all', basis: 'paid'};

describe('날짜별 원비 결제 기록', () => {
  it('결제일로 묶어도 9월 귀속월을 변경하지 않는다', () => {
    const groups = groupDailyPayments([payment], 'paid');
    expect(groups[0].date).toBe('2026-10-22');
    expect(groups[0].payments[0].billing_month).toBe('2026-09');
  });
  it('등록일은 한국 날짜로 계산하고 실제 결제일과 구분한다', () => {
    expect(paymentRecordDate(payment, 'registered')).toBe('2026-10-24');
    expect(paymentRecordDate(payment, 'paid')).toBe('2026-10-22');
  });
  it('취소금액과 확인필요 금액은 기록금액 합계에서 제외하되 각각 보존한다', () => {
    const result = summarizeDailyPayments([payment, {...payment, id: 'b', amount: 600000, needs_review: true}, {...payment, id: 'c', amount: 720000, canceled_at: '2026-10-23', needs_review: true}]);
    expect(result).toEqual({recorded: 1, recordedAmount: 320000, review: 1, reviewAmount: 600000, canceled: 1, canceledAmount: 720000});
  });
  it('청구월이나 학생을 확인할 수 없으면 확인 필요로 구분한다', () => {
    expect(paymentRecordState({...payment, billing_month: null})).toBe('review');
    expect(paymentRecordState({...payment, student_id: ''})).toBe('review');
  });
  it('연결 청구월이 있으면 귀속월 확인에 사용한다', () => {
    expect(paymentRecordState({...payment, billing_month: null, billing_schedules: {billing_month: '2026-10'}})).toBe('recorded');
  });
  it('외부 수납 출처만 기본 포함하고 수기는 전체 선택에서 조회한다', () => {
    const rows = [payment, {...payment, id: 'manual', source: '수기'}, {...payment, id: 'coding', source: '이코딩수기'}];
    expect(filterDailyPayments(rows, filters).map(row => row.id)).toEqual(['a', 'coding']);
    expect(filterDailyPayments(rows, {...filters, source: 'all'})).toHaveLength(3);
  });
  it('날짜·출처·검색·확인필요 조건을 함께 적용한다', () => {
    const rows = [{...payment, needs_review: true}, {...payment, id: 'b', source: '계좌이체문자', needs_review: true}, {...payment, id: 'c', paid_date: '2026-10-21', needs_review: true}, {...payment, id: 'd', students: {name: '김주하'}, needs_review: true}];
    expect(filterDailyPayments(rows, {...filters, from: '2026-10-22', to: '2026-10-22', source: '결제선생', state: 'review', search: '김민재'}).map(row => row.id)).toEqual(['a']);
  });
  it('날짜는 최신순으로 정리하고 입력 배열은 변경하지 않는다', () => {
    const rows = [payment, {...payment, id: 'b', paid_date: '2026-10-23'}];
    expect(groupDailyPayments(rows, 'paid').map(group => group.date)).toEqual(['2026-10-23', '2026-10-22']);
    expect(rows.map(row => row.id)).toEqual(['a', 'b']);
  });
  it('등록일이 없을 때 결제일을 등록일로 추정하지 않는다', () => {
    expect(filterDailyPayments([{...payment, created_at: undefined}], {...filters, basis: 'registered'})).toEqual([]);
  });
});