import { describe, expect, it } from 'vitest';
import {
  classifyLessonDay, filterFinishedRecords, safePercent, toMinutes, dowKST,
  type ScopeContext,
} from './unclosedScope';

const TODAY = '2026-08-22'; // 토요일
const DOW = dowKST(TODAY);

const ctx = (nowMinutes: number, schedules: ScopeContext['schedules'] = []): ScopeContext => ({
  today: TODAY, nowMinutes, schedules,
});

const sched = (o: Partial<ScopeContext['schedules'][number]> = {}) => ({
  class_id: 'c1', day_of_week: DOW, end_time: '18:00:00', is_active: true, inactive_until: null, ...o,
});

describe('classifyLessonDay', () => {
  it('과거 수업일은 항상 포함', () => {
    expect(classifyLessonDay('c1', '2026-08-20', ctx(0))).toBe('included');
  });
  it('미래 수업일은 제외', () => {
    expect(classifyLessonDay('c1', '2026-08-25', ctx(1439, [sched()]))).toBe('future');
  });
  it('오늘 종료시간 전이면 제외', () => {
    expect(classifyLessonDay('c1', TODAY, ctx(17 * 60, [sched()]))).toBe('today_not_finished');
  });
  it('오늘 종료시간 이후면 포함', () => {
    expect(classifyLessonDay('c1', TODAY, ctx(18 * 60, [sched()]))).toBe('included');
  });
  it('오늘 스케줄 근거가 없으면 시간 추정 없이 제외', () => {
    expect(classifyLessonDay('c1', TODAY, ctx(23 * 60))).toBe('today_no_schedule');
    expect(classifyLessonDay('c1', TODAY, ctx(23 * 60, [sched({ end_time: null })]))).toBe('today_no_schedule');
  });
  it('오늘 휴강 근거가 있으면 제외', () => {
    expect(classifyLessonDay('c1', TODAY, ctx(23 * 60, [sched({ is_active: false })]))).toBe('today_cancelled');
    expect(classifyLessonDay('c1', TODAY, ctx(23 * 60, [sched({ inactive_until: '2026-08-31' })]))).toBe('today_cancelled');
  });
  it('여러 교시가 있으면 가장 늦은 종료시간 기준', () => {
    const s = [sched({ end_time: '16:00:00' }), sched({ end_time: '21:00:00' })];
    expect(classifyLessonDay('c1', TODAY, ctx(20 * 60, s))).toBe('today_not_finished');
    expect(classifyLessonDay('c1', TODAY, ctx(21 * 60, s))).toBe('included');
  });
});

describe('filterFinishedRecords', () => {
  it('오늘 진행 중 수업 기록만 걸러낸다', () => {
    const rows = [
      { class_id: 'c1', lesson_date: '2026-08-20' },
      { class_id: 'c1', lesson_date: TODAY },
      { class_id: 'c2', lesson_date: TODAY },
    ];
    const out = filterFinishedRecords(rows, ctx(17 * 60, [sched(), sched({ class_id: 'c2', end_time: '15:00:00' })]));
    expect(out).toEqual([
      { class_id: 'c1', lesson_date: '2026-08-20' },
      { class_id: 'c2', lesson_date: TODAY },
    ]);
  });
});

describe('safePercent / toMinutes', () => {
  it('분모 0이면 0%', () => {
    expect(safePercent(0, 0)).toBe(0);
    expect(safePercent(5, 0)).toBe(0);
  });
  it('정상 백분율', () => {
    expect(safePercent(1, 1)).toBe(100);
    expect(safePercent(1, 3)).toBe(33);
  });
  it('시간 파싱', () => {
    expect(toMinutes('09:30:00')).toBe(570);
    expect(toMinutes(null)).toBeNull();
  });
});
