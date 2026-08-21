import { describe, expect, it } from 'vitest';
import { getCardDisplay } from './cardStatus';

describe('getCardDisplay', () => {
  it('학생 0명이면 수업 없음(중립)', () => {
    const d = getCardDisplay({ studentCount: 0, recordedCount: 0, submittedCount: 0 });
    expect(d.state).toBe('empty_class');
    expect(d.label).toBe('수업 없음');
  });

  it('기록 0건이면 미작성 + 작성 시작', () => {
    const d = getCardDisplay({ studentCount: 7, recordedCount: 0, submittedCount: 0 });
    expect(d.state).toBe('not_started');
    expect(d.cta).toBe('작성 시작');
  });

  it('일부 기록이면 작성 중 + 이어서 작성', () => {
    const d = getCardDisplay({ studentCount: 7, recordedCount: 3, submittedCount: 0 });
    expect(d.state).toBe('in_progress');
    expect(d.cta).toBe('이어서 작성');
  });

  it('일부 제출도 작성 중', () => {
    const d = getCardDisplay({ studentCount: 7, recordedCount: 7, submittedCount: 5 });
    expect(d.state).toBe('in_progress');
  });

  it('전원 제출이면 마감 완료 + 완료 내용 보기', () => {
    const d = getCardDisplay({ studentCount: 7, recordedCount: 7, submittedCount: 7 });
    expect(d.state).toBe('done');
    expect(d.cta).toBe('완료 내용 보기');
  });
});
