import { describe, it, expect } from 'vitest';
import {
  getWriteStatus,
  getDeliveryStatus,
  summarizeWeek,
  nextNeedsReview,
  splitBatchOutcome,
  getPublishInfo,
} from './reportStatus';

const base = {
  id: 'r1',
  total_lessons: 3,
  student_message: '학생 메시지',
  parent_message: '학부모 메시지',
  report_quality_tag: 'GREEN',
  parent_visible: false,
  student_sent_status: 'draft',
  parent_sent_status: 'draft',
};

describe('getWriteStatus', () => {
  it('수업 0건은 zero_lessons', () => {
    expect(getWriteStatus({ ...base, total_lessons: 0 })).toBe('zero_lessons');
  });
  it('RED는 검수 필요', () => {
    expect(getWriteStatus({ ...base, report_quality_tag: 'RED' })).toBe('needs_review');
  });
  it('필수 메시지 빈값은 검수 필요', () => {
    expect(getWriteStatus({ ...base, parent_message: '   ' })).toBe('needs_review');
    expect(getWriteStatus({ ...base, student_message: null })).toBe('needs_review');
  });
  it('정상 초안은 ready', () => {
    expect(getWriteStatus(base)).toBe('ready');
  });
  it('공개된 건은 published', () => {
    expect(getWriteStatus({ ...base, parent_visible: true })).toBe('published');
  });
  it('수업 0건이 공개보다 우선', () => {
    expect(getWriteStatus({ ...base, total_lessons: 0, parent_visible: true })).toBe('zero_lessons');
  });
});

describe('getDeliveryStatus', () => {
  it('draft만 있으면 확인 불가', () => {
    const d = getDeliveryStatus(base);
    expect(d.status).toBe('unknown');
    expect(d.label).toBe('발송 여부 확인 불가');
  });
  it('작성 완료/공개를 발송으로 간주하지 않는다', () => {
    expect(getDeliveryStatus({ ...base, parent_visible: true }).status).toBe('unknown');
  });
  it('둘 다 sent면 발송됨', () => {
    expect(getDeliveryStatus({ ...base, student_sent_status: 'sent', parent_sent_status: 'sent' }).status).toBe('sent');
  });
  it('하나만 sent면 partial', () => {
    expect(getDeliveryStatus({ ...base, parent_sent_status: 'sent' }).status).toBe('partial');
  });
  it('failed 기록', () => {
    expect(getDeliveryStatus({ ...base, parent_sent_status: 'failed' }).status).toBe('failed');
  });
  it('sent_at만 있으면 partial', () => {
    expect(getDeliveryStatus({ ...base, parent_sent_at: '2026-08-01' }).status).toBe('partial');
  });
});

describe('getPublishInfo', () => {
  it('공개 여부는 발송과 별개', () => {
    expect(getPublishInfo({ parent_visible: true }).published).toBe(true);
    expect(getPublishInfo({ parent_visible: false }).published).toBe(false);
  });
});

describe('summarizeWeek', () => {
  const rows = [
    { ...base, id: 'a' },
    { ...base, id: 'b', parent_visible: true },
    { ...base, id: 'c', report_quality_tag: 'RED' },
    { ...base, id: 'd', total_lessons: 0 },
    { ...base, id: 'e', student_sent_status: 'sent', parent_sent_status: 'sent', generated_at: '2026-08-20T00:00:00Z' },
  ];
  it('상태별 집계', () => {
    const s = summarizeWeek(rows, 10);
    expect(s.target).toBe(10);
    expect(s.generated).toBe(5);
    expect(s.missing).toBe(5);
    expect(s.needsReview).toBe(1);
    expect(s.caution).toBe(1);
    expect(s.published).toBe(1);
    expect(s.sendable).toBe(2);
    expect(s.deliveryConfirmed).toBe(1);
    expect(s.lastGeneratedAt).toBe('2026-08-20T00:00:00Z');
  });
  it('생성이 대상보다 많아도 미생성은 0', () => {
    expect(summarizeWeek(rows, 2).missing).toBe(0);
  });
  it('빈 목록', () => {
    const s = summarizeWeek([], 7);
    expect(s.generated).toBe(0);
    expect(s.missing).toBe(7);
    expect(s.lastGeneratedAt).toBeNull();
  });
});

describe('nextNeedsReview', () => {
  const rows = [
    { ...base, id: 'a' },
    { ...base, id: 'b', report_quality_tag: 'RED' },
    { ...base, id: 'c', parent_message: '' },
  ];
  it('첫 검수 대상', () => {
    expect(nextNeedsReview(rows)?.id).toBe('b');
  });
  it('현재 다음 대상으로 순환', () => {
    expect(nextNeedsReview(rows, 'b')?.id).toBe('c');
    expect(nextNeedsReview(rows, 'c')?.id).toBe('b');
  });
  it('검수 대상 없으면 null', () => {
    expect(nextNeedsReview([{ ...base }])).toBeNull();
  });
});

describe('splitBatchOutcome', () => {
  it('성공/실패 분리', () => {
    const r = splitBatchOutcome([
      { ok: true, student_name: '가' },
      { ok: false, student_name: '나', message: 'timeout' },
    ]);
    expect(r.successCount).toBe(1);
    expect(r.failedCount).toBe(1);
    expect(r.partial).toBe(true);
    expect(r.failedNames).toEqual(['나']);
  });
  it('전체 성공은 partial 아님', () => {
    expect(splitBatchOutcome([{ ok: true }]).partial).toBe(false);
  });
});
