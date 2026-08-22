import { describe, expect, it } from 'vitest';
import { computeCloseoutProgress, type CloseoutStudentSnapshot } from './closeoutProgress';

const s = (o: Partial<CloseoutStudentSnapshot> = {}): CloseoutStudentSnapshot => ({
  hasAttendance: true,
  recordExempt: false,
  hasProgress: true,
  submitted: false,
  ...o,
});

describe('computeCloseoutProgress', () => {
  it('학생이 없으면 마감 불가', () => {
    const p = computeCloseoutProgress([]);
    expect(p.canFinalize).toBe(false);
    expect(p.blockReason).toContain('재원 학생');
  });

  it('출결 미선택이 있으면 1단계이며 마감 차단', () => {
    const p = computeCloseoutProgress([s(), s({ hasAttendance: false })]);
    expect(p.currentStep).toBe('attendance');
    expect(p.attendanceRemaining).toBe(1);
    expect(p.requiredRemaining).toBe(1);
    expect(p.canFinalize).toBe(false);
    expect(p.blockReason).toBe('수업출결 미선택 1명');
  });

  it('출결 완료 + 진도 미기록이면 2단계이지만 마감은 가능', () => {
    const p = computeCloseoutProgress([s(), s({ hasProgress: false })]);
    expect(p.currentStep).toBe('record');
    expect(p.progressRemaining).toBe(1);
    expect(p.requiredRemaining).toBe(0);
    expect(p.canFinalize).toBe(true);
    expect(p.blockReason).toBeNull();
  });

  it('결석 학생은 진도 미기록으로 세지 않는다', () => {
    const p = computeCloseoutProgress([s({ recordExempt: true, hasProgress: false })]);
    expect(p.progressRemaining).toBe(0);
    expect(p.currentStep).toBe('finalize');
  });

  it('전원 제출이면 마감 완료 상태', () => {
    const p = computeCloseoutProgress([s({ submitted: true }), s({ submitted: true })]);
    expect(p.allFinalized).toBe(true);
    expect(p.currentStep).toBe('finalize');
    expect(p.submittedCount).toBe(2);
  });
});
