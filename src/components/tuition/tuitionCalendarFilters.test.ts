import { describe, expect, it } from 'vitest';
import { filterTuitionStudents, filterTuitionListPayments, filterTuitionStudentsByPayment, sortTuitionStudents } from './tuitionCalendarFilters';

const students = [
  { name: '학생가', school: '신길고', grade: '고1', totalFee: 320000, isPaid: false, paidAmount: 0 },
  { name: '학생나', school: '신길중', grade: '중2', totalFee: 600000, isPaid: false, paidAmount: 100000 },
  { name: '학생다', school: '신길고', grade: '고2', totalFee: 330000, isPaid: true, paidAmount: 330000 },
  { name: '학생라', school: null, grade: null, totalFee: 0, isPaid: false, paidAmount: 0 },
];

describe('수강료 첫 화면 검색과 수납 상태 필터', () => {
  it('이름 일부로 바로 학생을 검색한다', () => {
    expect(filterTuitionStudents(students, '  생나  ', 'all').map(s => s.name)).toEqual(['학생나']);
  });
  it('미납 필터는 부분납도 포함하고 완납과 원비 없는 학생은 제외한다', () => {
    expect(filterTuitionStudents(students, '', 'unpaid').map(s => s.name)).toEqual(['학생가', '학생나']);
  });
  it('검색과 미납 필터를 함께 적용한다', () => {
    expect(filterTuitionStudents(students, '신길고', 'unpaid').map(s => s.name)).toEqual(['학생가']);
  });
  it('완납만 따로 조회한다', () => {
    expect(filterTuitionStudents(students, '', 'paid').map(s => s.name)).toEqual(['학생다']);
  });
  it('검색과 상태를 초기화하면 전체 명단으로 돌아간다', () => {
    expect(filterTuitionStudents(students, '', 'all')).toEqual(students);
  });
  it('학년 검색과 검색 결과 없음도 처리한다', () => {
    expect(filterTuitionStudents(students, '고2', 'all').map(s => s.name)).toEqual(['학생다']);
    expect(filterTuitionStudents(students, '없는학생', 'all')).toEqual([]);
  });
});

const paymentRows = [
  { id: 'old-kiosk', student_id: 'a', amount: 100000, paid_date: '2026-10-10', billing_month: '2026-10', source: '이코딩키오스크' },
  { id: 'new-bank', student_id: 'a', amount: 220000, paid_date: '2026-10-26', billing_month: '2026-10', source: '계좌이체문자' },
  { id: 'recent-kiosk', student_id: 'b', amount: 100000, paid_date: '2026-10-22', billing_month: '2026-10', source: '이코딩키오스크', needs_review: true },
  { id: 'canceled', student_id: 'c', amount: 330000, paid_date: '2026-10-26', billing_month: '2026-10', source: '이코딩키오스크', canceled_at: '2026-10-26T00:00:00Z' },
  { id: 'prior-month', student_id: 'c', amount: 330000, paid_date: '2026-10-25', billing_month: '2026-09', source: '이코딩키오스크' },
];

describe('달력 목록의 출처별·최근 결제 조회', () => {
  it('최근 7일 출처 필터는 같은 결제 건에 적용해 오래된 키오스크 결제로 학생을 포함하지 않는다', () => {
    const rows = filterTuitionListPayments(paymentRows, '2026-10', '이코딩키오스크', '7', '2026-10-26');
    expect(rows.map(row => row.id)).toEqual(['recent-kiosk']);
    expect(filterTuitionStudentsByPayment(sortableStudents, rows, true).map(row => row.id)).toEqual(['b']);
    expect(rows[0]?.needs_review).toBe(true);
  });
  it('최근 7일은 실제 결제일 10월 20일부터 26일까지이며 등록일과 미래 결제는 기준이 아니다', () => {
    const dates = ['2026-10-19', '2026-10-20', '2026-10-26', '2026-10-27'].map((paid_date, index) => ({ ...paymentRows[0], id: String(index), paid_date, created_at: '2026-10-26T00:00:00Z' }));
    expect(filterTuitionListPayments(dates, '2026-10', 'all', '7', '2026-10-26').map(row => row.paid_date)).toEqual(['2026-10-20', '2026-10-26']);
  });
  it('최근 30일은 9월 27일부터이며 해당 청구월의 결제만 표시한다', () => {
    const rows = ['2026-09-26', '2026-09-27', '2026-10-26'].map(paid_date => ({...paymentRows[0], paid_date}));
    expect(filterTuitionListPayments(rows, '2026-10', 'all', '30', '2026-10-26').map(row => row.paid_date)).toEqual(['2026-09-27', '2026-10-26']);
  });
  it('계좌이체는 계좌이체문자 출처와 수기로 기록한 계좌이체를 모두 조회한다', () => {
    const manual = { ...paymentRows[0], id: 'manual-bank', source: '수기', payment_method: '계좌이체' };
    const cash = { ...manual, id: 'cash', payment_method: '현금' };
    expect(filterTuitionListPayments([...paymentRows, manual, cash], '2026-10', 'bank', 'paid', '2026-10-26').map(row => row.id)).toEqual(['new-bank', 'manual-bank']);
  });
  it('출결버스와 결제선생은 확인되지 않은 별칭으로 합치지 않고 정확한 출처를 구분한다', () => {
    const rows = ['출결버스', '결제선생', '이코딩키오스크'].map(source => ({...paymentRows[0], source}));
    expect(filterTuitionListPayments(rows, '2026-10', '출결버스', 'paid', '2026-10-26').map(row => row.source)).toEqual(['출결버스']);
  });
  it('취소 결제는 제외하며 귀속월이 없는 경우 연결된 청구월을 사용하고 원본은 변경하지 않는다', () => {
    const linked = {...paymentRows[0], id: 'linked', billing_month: null, billing_schedules: {billing_month: '2026-10'}};
    const rows = [...paymentRows, linked];
    const original = structuredClone(rows);
    expect(filterTuitionListPayments(rows, '2026-10', 'all', 'paid', '2026-10-26').map(row => row.id)).toEqual(['old-kiosk', 'new-bank', 'recent-kiosk', 'linked']);
    expect(rows).toEqual(original);
  });
  it('결제된 학생만 최근 실제 결제일 순으로 정렬하고 월 납부액은 변경하지 않는다', () => {
    const rows = filterTuitionListPayments(paymentRows, '2026-10', 'all', 'paid', '2026-10-26');
    const qualified = filterTuitionStudentsByPayment(sortableStudents, rows, true);
    expect(sortTuitionStudents(qualified, '2026-10', 'paid_date', 'desc', rows).map(row => row.id)).toEqual(['a', 'b']);
    expect(sortTuitionStudents(qualified, '2026-10', 'paid_date', 'asc', rows).map(row => row.id)).toEqual(['b', 'a']);
    expect(qualified.map(row => row.paidAmount)).toEqual([100000, 0]);
  });
  it('결제 전용 조회를 해제하면 결제 없는 학생도 다시 보인다', () => {
    expect(filterTuitionStudentsByPayment(sortableStudents, [], false)).toEqual(sortableStudents);
    expect(filterTuitionStudentsByPayment(sortableStudents, [], true)).toEqual([]);
  });
});

const sortableStudents = [
  { id: 'c', name: '다학생', school: '신길고', grade: '고2', payment_due_day: 24, totalFee: 330000, isPaid: true, paidAmount: 330000 },
  { id: 'b', name: '나학생', school: '신길중', grade: '중2', payment_due_day: 6, totalFee: 600000, isPaid: false, paidAmount: 100000 },
  { id: 'a', name: '가학생', school: '신길고', grade: '고1', payment_due_day: 6, totalFee: 320000, isPaid: false, paidAmount: 0 },
];

describe('검색·필터 후 원비 목록 정렬', () => {
  it('표시된 저장 청구기한을 현재 납입일보다 우선해 정렬한다', () => {
    const rows = [{...sortableStudents[0], scheduledDueDate: '2026-10-02'}, {...sortableStudents[1], scheduledDueDate: '2026-10-24'}];
    expect(sortTuitionStudents(rows, '2026-10', 'due_date', 'asc').map(s => s.id)).toEqual(['c', 'b']);
  });
  it('등록된 납부 예정일을 오름차순·내림차순으로 정렬하고 같은 날짜는 이름순으로 표시한다', () => {
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'due_date', 'asc').map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'due_date', 'desc').map(s => s.id)).toEqual(['c', 'a', 'b']);
  });
  it('이름순과 역순을 선택할 수 있다', () => {
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'name', 'asc').map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'name', 'desc').map(s => s.id)).toEqual(['c', 'b', 'a']);
  });
  it('학교 내 학년순으로 정렬한다', () => {
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'school', 'asc').map(s => s.id)).toEqual(['a', 'c', 'b']);
  });
  it('수강료와 미납 잔액은 기존 원비·수납 금액을 그대로 이용한다', () => {
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'fee', 'desc').map(s => s.id)).toEqual(['b', 'c', 'a']);
    expect(sortTuitionStudents(sortableStudents, '2026-10', 'unpaid_amount', 'desc').map(s => s.id)).toEqual(['b', 'a', 'c']);
    const overpaid = { ...sortableStudents[0], paidAmount: 400000 };
    expect(sortTuitionStudents([sortableStudents[1], overpaid], '2026-10', 'unpaid_amount', 'asc').map(s => s.id)).toEqual(['c', 'b']);
  });
  it('미납 필터 뒤에 정렬해도 대상과 원본 명단을 바꾸지 않는다', () => {
    const original = structuredClone(sortableStudents);
    const filtered = filterTuitionStudents(sortableStudents, '신길', 'unpaid');
    expect(sortTuitionStudents(filtered, '2026-10', 'due_date', 'asc').map(s => s.id)).toEqual(['a', 'b']);
    expect(sortableStudents).toEqual(original);
    expect(filtered.map(s => s.id)).toEqual(['b', 'a']);
  });
  it('월말 예정일은 달력과 같은 해당 월의 마지막 날로 정렬한다', () => {
    const endOfMonth = [
      { ...sortableStudents[0], id: '31', name: '가학생', payment_due_day: 31 },
      { ...sortableStudents[1], id: '28', name: '나학생', payment_due_day: 28 },
    ];
    expect(sortTuitionStudents(endOfMonth, '2027-02', 'due_date', 'asc').map(s => s.id)).toEqual(['31', '28']);
    expect(sortTuitionStudents(endOfMonth, '2026-10', 'due_date', 'asc').map(s => s.id)).toEqual(['28', '31']);
  });
});