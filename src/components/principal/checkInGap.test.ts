import { describe, it, expect } from 'vitest';
import { classifyCheckInGaps, type CheckInRecordInput } from './checkInGap';

const rec = (o: Partial<CheckInRecordInput>): CheckInRecordInput => ({
  class_id: 'c1',
  student_id: 's1',
  lesson_date: '2026-08-20',
  submitted: true,
  attendance_status: ['정상등원'],
  ...o,
});

describe('classifyCheckInGaps', () => {
  it('반 전체 태그가 없으면 정보성 untagged로 분류하고 부분 누락에 섞지 않는다', () => {
    const r = classifyCheckInGaps(
      [rec({ student_id: 'a' }), rec({ student_id: 'b' })],
      new Set()
    );
    expect(r.partialStudents).toBe(0);
    expect(r.untaggedClassDays).toBe(1);
    expect(r.untaggedStudents).toBe(2);
  });

  it('일부만 태그가 없으면 partial로 분류한다', () => {
    const r = classifyCheckInGaps(
      [rec({ student_id: 'a' }), rec({ student_id: 'b' }), rec({ student_id: 'c' })],
      new Set(['a:2026-08-20'])
    );
    expect(r.partialStudents).toBe(2);
    expect(r.partial[0].taggedCount).toBe(1);
    expect(r.partial[0].target).toBe(3);
    expect(r.untaggedClassDays).toBe(0);
  });

  it('정상 결석·보충불가는 대상에서 제외한다', () => {
    const r = classifyCheckInGaps(
      [
        rec({ student_id: 'a', attendance_status: ['인정결석'] }),
        rec({ student_id: 'b', attendance_status: ['무단결석'] }),
        rec({ student_id: 'c', attendance_status: ['보충불가'] }),
      ],
      new Set()
    );
    expect(r.partialStudents).toBe(0);
    expect(r.untaggedClassDays).toBe(0);
  });

  it('미마감(submitted=false)·출결 미선택 기록은 제외한다', () => {
    const r = classifyCheckInGaps(
      [
        rec({ student_id: 'a', submitted: false }),
        rec({ student_id: 'b', attendance_status: [] }),
      ],
      new Set()
    );
    expect(r.untaggedClassDays).toBe(0);
    expect(r.partialStudents).toBe(0);
  });

  it('지각·조퇴는 출석 취급으로 포함한다', () => {
    const r = classifyCheckInGaps(
      [
        rec({ student_id: 'a', attendance_status: ['지각'] }),
        rec({ student_id: 'b', attendance_status: ['조퇴'] }),
      ],
      new Set(['a:2026-08-20'])
    );
    expect(r.partialStudents).toBe(1);
  });

  it('반·날짜 단위로 각각 판정한다', () => {
    const r = classifyCheckInGaps(
      [
        rec({ student_id: 'a', class_id: 'c1' }),
        rec({ student_id: 'b', class_id: 'c1' }),
        rec({ student_id: 'c', class_id: 'c2', lesson_date: '2026-08-19' }),
        rec({ student_id: 'd', class_id: 'c2', lesson_date: '2026-08-19' }),
      ],
      new Set(['a:2026-08-20'])
    );
    expect(r.partialStudents).toBe(1); // c1
    expect(r.untaggedClassDays).toBe(1); // c2
  });

  it('전부 태그되어 있으면 0건', () => {
    const r = classifyCheckInGaps([rec({ student_id: 'a' })], new Set(['a:2026-08-20']));
    expect(r.partialStudents).toBe(0);
    expect(r.untaggedClassDays).toBe(0);
  });
});
