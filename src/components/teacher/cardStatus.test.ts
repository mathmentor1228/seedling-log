import { describe, expect, it } from 'vitest';
import { getCardDisplay } from './cardStatus';

describe('getCardDisplay', () => {
  it('학생 0명이면 수업 없음', () => {
    const m = getCardDisplay({ studentCount: 0, recordedCount: 0, submittedCount: 0 });
    expect(m.state).toBe('empty_class');
    expect(m.label).toBe('수업 없음');
  });

  it('기록 전무면 미작성', () => {
    const m = getCardDisplay({ studentCount: 5, recordedCount: 0, submittedCount: 0 });
    expect(m.state).toBe('not_started');
    expect(m.cta).toBe('작성 시작');
  });

  it('일부 기록이면 작성 중', () => {
    const m = getCardDisplay({ studentCount: 5, recordedCount: 2, submittedCount: 0 });
    expect(m.state).toBe('in_progress');
    expect(m.cta).toBe('이어서 작성');
  });

  it('일부만 제출돼도 작성 중', () => {
    const m = getCardDisplay({ studentCount: 5, recordedCount: 5, submittedCount: 4 });
    expect(m.state).toBe('in_progress');
  });

  it('전원 제출이면 마감 완료', () => {
    const m = getCardDisplay({ studentCount: 3, recordedCount: 3, submittedCount: 3 });
    expect(m.state).toBe('done');
    expect(m.cta).toBe('완료 내용 보기');
  });
});
