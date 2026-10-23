import { describe, expect, it } from 'vitest';
import { filterTuitionStudents, sortTuitionStudents } from './tuitionCalendarFilters';

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

const sortableStudents = [
  { id: 'c', name: '다학생', school: '신길고', grade: '고2', payment_due_day: 24, totalFee: 330000, isPaid: true, paidAmount: 330000 },
  { id: 'b', name: '나학생', school: '신길중', grade: '중2', payment_due_day: 6, totalFee: 600000, isPaid: false, paidAmount: 100000 },
  { id: 'a', name: '가학생', school: '신길고', grade: '고1', payment_due_day: 6, totalFee: 320000, isPaid: false, paidAmount: 0 },
];

describe('검색·필터 후 원비 목록 정렬', () => {
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