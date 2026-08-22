import { describe, it, expect } from 'vitest';
import { buildAckPayload, diffFindings, lastCheckedAt, signKey, totalNewCount, type DQAckRow } from './dqAck';
import type { DQFinding } from './dataQuality';

const f = (id: string, keys: string[], recordCount = keys.length): DQFinding => ({
  id, title: id, severity: 'check', basis: 'test',
  groupCount: keys.length, recordCount, groupUnit: '그룹', recordUnit: '건',
  samples: [], groupKeys: keys,
});

const ack = (finding_id: string, keys: string[], record_count = keys.length): DQAckRow => ({
  finding_id, acked_keys: keys.map(signKey), record_count, group_count: keys.length,
  acked_by: 'u1', acked_at: '2026-08-22T05:00:00Z',
});

describe('dqAck', () => {
  it('서명은 결정적이고 원문을 포함하지 않는다', () => {
    expect(signKey('a-b-c')).toBe(signKey('a-b-c'));
    expect(signKey('a-b-c')).not.toBe(signKey('a-b-d'));
    expect(signKey('홍길동')).not.toContain('홍');
  });

  it('기준선이 없으면 전부 신규', () => {
    const list = diffFindings([f('x', ['1', '2'])], []);
    expect(list[0].newCount).toBe(2);
    expect(totalNewCount(list)).toBe(2);
  });

  it('기준선 저장 후 동일 결과는 신규 0', () => {
    const finding = f('x', ['1', '2']);
    const list = diffFindings([finding], [ack('x', ['1', '2'])]);
    expect(list[0].newCount).toBe(0);
    expect(list[0].ackedCount).toBe(2);
  });

  it('새 레코드가 생기면 증가분만 신규로 잡는다', () => {
    const list = diffFindings([f('x', ['1', '2', '3'])], [ack('x', ['1', '2'])]);
    expect(list[0].newCount).toBe(1);
    expect(list[0].newKeys).toEqual([signKey('3')]);
  });

  it('키가 줄어들어도 신규로 되살아나지 않는다', () => {
    const list = diffFindings([f('x', ['1'])], [ack('x', ['1', '2'])]);
    expect(list[0].newCount).toBe(0);
  });

  it('키 없는 집계형은 건수 증가분으로 판정', () => {
    const finding = f('y', [], 5);
    expect(diffFindings([finding], [ack('y', [], 3)])[0].newCount).toBe(2);
    expect(diffFindings([finding], [ack('y', [], 5)])[0].newCount).toBe(0);
  });

  it('저장 payload는 해시 키만 포함', () => {
    const p = buildAckPayload([f('x', ['s-1'])], 'u1', '2026-08-22T06:00:00Z');
    expect(p[0].acked_keys).toEqual([signKey('s-1')]);
    expect(JSON.stringify(p)).not.toContain('s-1');
  });

  it('마지막 확인 시각은 최대값', () => {
    expect(lastCheckedAt([ack('a', []), { ...ack('b', []), acked_at: '2026-08-23T00:00:00Z' }]))
      .toBe('2026-08-23T00:00:00Z');
    expect(lastCheckedAt([])).toBeNull();
  });
});
