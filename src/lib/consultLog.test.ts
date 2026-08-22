import { describe, expect, it } from 'vitest';
import {
  buildConsultInsert, consultDate, detectSensitive, emptyConsultDraft, followUpState,
  isConsultDraftDirty, localKstToIso, summarizeConsults, validateConsultDraft,
  type ConsultDraft, type ConsultNote,
} from './consultLog';

const base = (o: Partial<ConsultDraft> = {}): ConsultDraft => ({
  studentId: 's1',
  consultedAt: '2026-08-20T15:30',
  target: '학부모',
  method: '전화',
  summary: '수학 진도와 숙제 이행 상황을 공유함.',
  followUp: false,
  followUpDate: '',
  ...o,
});

const note = (o: Partial<ConsultNote> = {}): ConsultNote => ({
  id: 'n1',
  created_at: '2026-08-20T09:00:00Z',
  consulted_at: '2026-08-20T06:30:00Z',
  consult_target: '학부모',
  consult_method: '전화',
  title: '[상담] 학부모·전화 08-20',
  body: '요지',
  status: 'done',
  due_date: null,
  created_by: 'u1',
  ...o,
});

describe('validateConsultDraft', () => {
  it('정상 입력은 오류 없음', () => {
    expect(validateConsultDraft(base(), '2026-08-22')).toEqual({});
  });
  it('필수값 누락을 항목별로 보고', () => {
    const e = validateConsultDraft(base({ studentId: '', target: '', method: '', summary: '짧' }), '2026-08-22');
    expect(Object.keys(e).sort()).toEqual(['method', 'studentId', 'summary', 'target']);
  });
  it('미래 상담일시 거부', () => {
    expect(validateConsultDraft(base({ consultedAt: '2026-09-01T10:00' }), '2026-08-22').consultedAt).toBeTruthy();
  });
  it('후속조치 예정일 필수 및 상담일 이후', () => {
    expect(validateConsultDraft(base({ followUp: true }), '2026-08-22').followUpDate).toBeTruthy();
    expect(validateConsultDraft(base({ followUp: true, followUpDate: '2026-08-01' }), '2026-08-22').followUpDate).toBeTruthy();
    expect(validateConsultDraft(base({ followUp: true, followUpDate: '2026-08-25' }), '2026-08-22')).toEqual({});
  });
  it('1000자 초과 거부', () => {
    expect(validateConsultDraft(base({ summary: 'a'.repeat(1001) }), '2026-08-22').summary).toBeTruthy();
  });
});

describe('detectSensitive', () => {
  it('전화번호/이메일 감지', () => {
    expect(detectSensitive('010-1234-5678 로 연락')).toHaveLength(1);
    expect(detectSensitive('a@b.com')).toHaveLength(1);
    expect(detectSensitive('숙제 이행 상황 공유')).toHaveLength(0);
  });
});

describe('buildConsultInsert', () => {
  it('기존 team_notes 구조로 매핑하고 KST 시각을 UTC로 변환', () => {
    const p = buildConsultInsert(base(), 'u1');
    expect(p.scope).toBe('student');
    expect(p.target_role).toBe('teacher');
    expect(p.status).toBe('done');
    expect(p.due_date).toBeNull();
    expect(p.consulted_at).toBe('2026-08-20T06:30:00.000Z');
    expect(p.title).toContain('학부모');
  });
  it('후속조치가 있으면 open + due_date', () => {
    const p = buildConsultInsert(base({ followUp: true, followUpDate: '2026-08-25' }), 'u1');
    expect(p.status).toBe('open');
    expect(p.due_date).toBe('2026-08-25');
  });
  it('localKstToIso 는 KST 기준', () => {
    expect(localKstToIso('2026-01-01T00:00')).toBe('2025-12-31T15:00:00.000Z');
  });
});

describe('followUpState / summarizeConsults', () => {
  it('상태 구분', () => {
    expect(followUpState(note(), '2026-08-22')).toBe('none');
    expect(followUpState(note({ due_date: '2026-08-25', status: 'open' }), '2026-08-22')).toBe('due');
    expect(followUpState(note({ due_date: '2026-08-01', status: 'open' }), '2026-08-22')).toBe('overdue');
    expect(followUpState(note({ due_date: '2026-08-01', status: 'done' }), '2026-08-22')).toBe('done');
  });
  it('요약: 최근 상담일과 미완료 후속', () => {
    const s = summarizeConsults(
      [
        note({ id: 'a', consulted_at: '2026-08-10T01:00:00Z' }),
        note({ id: 'b', consulted_at: '2026-08-20T01:00:00Z', due_date: '2026-08-01', status: 'open' }),
      ],
      '2026-08-22'
    );
    expect(s.total).toBe(2);
    expect(s.lastDate).toBe('2026-08-20');
    expect(s.openFollowUps).toBe(1);
    expect(s.overdue).toBe(1);
  });
  it('0건이면 lastDate null', () => {
    expect(summarizeConsults([], '2026-08-22').lastDate).toBeNull();
  });
  it('consulted_at 없으면 created_at 사용', () => {
    expect(consultDate(note({ consulted_at: null }))).toBe('2026-08-20');
  });
});

describe('draft helpers', () => {
  it('빈 초안은 dirty 아님', () => {
    expect(isConsultDraftDirty(emptyConsultDraft('s1', '2026-08-22T10:00'))).toBe(false);
  });
  it('입력하면 dirty', () => {
    expect(isConsultDraftDirty(base())).toBe(true);
  });
});
