import { describe, expect, it } from 'vitest';
import { filterTuitionStudents } from './tuitionCalendarFilters';

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