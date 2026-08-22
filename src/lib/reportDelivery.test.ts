import { describe, it, expect } from 'vitest';
import {
  summarizeEvents,
  getConfirmEligibility,
  buildIdempotencyKey,
  containsPersonalData,
  countConfirmations,
  type DeliveryEvent,
} from './reportDelivery';

const ev = (o: Partial<DeliveryEvent>): DeliveryEvent => ({
  id: o.id || crypto.randomUUID(),
  report_id: o.report_id || 'r1',
  status: o.status || 'confirmed',
  channel: o.channel || 'kakao',
  note: o.note ?? null,
  actor_id: o.actor_id || 'u1',
  created_at: o.created_at || '2026-08-22T01:00:00Z',
});

describe('summarizeEvents', () => {
  it('이력이 없으면 미확인', () => {
    const s = summarizeEvents([]);
    expect(s.state).toBe('unconfirmed');
    expect(s.historyCount).toBe(0);
  });

  it('마지막 confirmed 이벤트로 확인됨 판정', () => {
    const s = summarizeEvents([ev({ created_at: '2026-08-22T01:00:00Z' })]);
    expect(s.state).toBe('confirmed');
  });

  it('정정(revoked) 이벤트가 마지막이면 미확인으로 되돌아가되 이력은 보존', () => {
    const s = summarizeEvents([
      ev({ status: 'confirmed', created_at: '2026-08-22T01:00:00Z' }),
      ev({ status: 'revoked', created_at: '2026-08-22T02:00:00Z' }),
    ]);
    expect(s.state).toBe('unconfirmed');
    expect(s.historyCount).toBe(2);
    expect(s.last?.status).toBe('revoked');
  });

  it('실패 기록이 마지막이면 failed', () => {
    const s = summarizeEvents([
      ev({ status: 'confirmed', created_at: '2026-08-22T01:00:00Z' }),
      ev({ status: 'failed', created_at: '2026-08-22T03:00:00Z' }),
    ]);
    expect(s.state).toBe('failed');
  });

  it('입력 순서와 무관하게 최신 이벤트를 사용', () => {
    const s = summarizeEvents([
      ev({ status: 'revoked', created_at: '2026-08-22T05:00:00Z' }),
      ev({ status: 'confirmed', created_at: '2026-08-22T04:00:00Z' }),
    ]);
    expect(s.state).toBe('unconfirmed');
  });
});

describe('getConfirmEligibility', () => {
  it('공개 + 메시지 있으면 허용', () => {
    const e = getConfirmEligibility({ parent_visible: true, parent_message: 'a', student_message: 'b', total_lessons: 2 });
    expect(e.allowed).toBe(true);
    expect(e.cautions).toHaveLength(0);
  });

  it('비공개면 차단', () => {
    const e = getConfirmEligibility({ parent_visible: false, parent_message: 'a', student_message: 'b', total_lessons: 1 });
    expect(e.allowed).toBe(false);
    expect(e.blockers[0]).toContain('공개');
  });

  it('메시지 빈값이면 차단', () => {
    const e = getConfirmEligibility({ parent_visible: true, parent_message: '  ', student_message: '', total_lessons: 1 });
    expect(e.allowed).toBe(false);
    expect(e.blockers).toHaveLength(2);
  });

  it('수업 0건은 차단이 아니라 주의', () => {
    const e = getConfirmEligibility({ parent_visible: true, parent_message: 'a', student_message: 'b', total_lessons: 0 });
    expect(e.allowed).toBe(true);
    expect(e.cautions).toHaveLength(1);
  });
});

describe('buildIdempotencyKey', () => {
  it('같은 분 안의 중복 클릭은 동일 키', () => {
    const a = buildIdempotencyKey('r1', 'confirmed', 'kakao', 'u1', new Date('2026-08-22T01:00:10Z'));
    const b = buildIdempotencyKey('r1', 'confirmed', 'kakao', 'u1', new Date('2026-08-22T01:00:59Z'));
    expect(a).toBe(b);
  });

  it('상태가 다르면 다른 키 (정정 이벤트는 별도 저장)', () => {
    const a = buildIdempotencyKey('r1', 'confirmed', 'kakao', 'u1', new Date('2026-08-22T01:00:10Z'));
    const b = buildIdempotencyKey('r1', 'revoked', 'kakao', 'u1', new Date('2026-08-22T01:00:10Z'));
    expect(a).not.toBe(b);
  });

  it('다른 분이면 다른 키', () => {
    const a = buildIdempotencyKey('r1', 'confirmed', 'kakao', 'u1', new Date('2026-08-22T01:00:10Z'));
    const b = buildIdempotencyKey('r1', 'confirmed', 'kakao', 'u1', new Date('2026-08-22T01:02:10Z'));
    expect(a).not.toBe(b);
  });
});

describe('containsPersonalData', () => {
  it('전화번호 패턴 감지', () => {
    expect(containsPersonalData('010-1234-5678 로 보냄')).toBe(true);
    expect(containsPersonalData('카톡으로 전달 완료')).toBe(false);
  });
});

describe('countConfirmations', () => {
  it('확인/실패/미확인을 분리 집계', () => {
    const c = countConfirmations(['a', 'b', 'c'], {
      a: [ev({ report_id: 'a', status: 'confirmed' })],
      b: [ev({ report_id: 'b', status: 'failed' })],
    });
    expect(c).toEqual({ target: 3, confirmed: 1, failed: 1, unconfirmed: 1 });
  });
});
