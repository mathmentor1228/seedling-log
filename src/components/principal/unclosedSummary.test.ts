import { describe, expect, it } from 'vitest';
import {
  buildTeacherNotice, buildUnclosedGroups, groupByTeacher, NO_CLASS, NO_TEACHER,
  type UnclosedRecordRow,
} from './unclosedSummary';

const row = (o: Partial<UnclosedRecordRow>): UnclosedRecordRow => ({
  id: Math.random().toString(36).slice(2),
  class_id: 'c1',
  class_name: '중2 수학A',
  lesson_date: '2026-08-20',
  submitted: false,
  attendance_status: null,
  lesson_range: null,
  teacher_display_name: '함유빈',
  ...o,
});

const RECENT_FROM = '2026-08-15';

describe('buildUnclosedGroups', () => {
  it('마감 완료(submitted) 기록만 있는 그룹은 제외한다', () => {
    const g = buildUnclosedGroups(
      [row({ submitted: true, attendance_status: ['정상등원'] }), row({ submitted: true, attendance_status: ['지각'] })],
      RECENT_FROM
    );
    expect(g).toEqual([]);
  });

  it('8월 이전 출결만으로 정리된 제출 완료 기록을 작성중으로 세지 않는다', () => {
    const g = buildUnclosedGroups(
      [
        row({ lesson_date: '2026-07-10', submitted: true, attendance_status: ['정상등원'], lesson_range: null }),
        row({ lesson_date: '2026-07-10', submitted: true, attendance_status: ['정상등원'], lesson_range: null }),
      ],
      RECENT_FROM
    );
    expect(g).toHaveLength(0);
  });

  it('기록 없음은 not_started, 일부 기록은 in_progress', () => {
    const ns = buildUnclosedGroups([row({}), row({})], RECENT_FROM);
    expect(ns[0].state).toBe('not_started');
    expect(ns[0].openCount).toBe(2);

    const ip = buildUnclosedGroups([row({ attendance_status: ['정상등원'] }), row({})], RECENT_FROM);
    expect(ip[0].state).toBe('in_progress');
    expect(ip[0].recordedCount).toBe(1);
    expect(ip[0].openCount).toBe(2);
  });

  it('일부만 마감된 그룹은 남은 인원만 미마감으로 센다', () => {
    const g = buildUnclosedGroups(
      [row({ submitted: true, attendance_status: ['정상등원'] }), row({ attendance_status: ['정상등원'] })],
      RECENT_FROM
    );
    expect(g[0].openCount).toBe(1);
    expect(g[0].state).toBe('in_progress');
  });

  it('최근 7일 여부를 날짜로 구분한다', () => {
    const g = buildUnclosedGroups([row({ lesson_date: '2026-08-20' }), row({ lesson_date: '2026-08-10' })], RECENT_FROM);
    expect(g.find((x) => x.date === '2026-08-20')!.recent).toBe(true);
    expect(g.find((x) => x.date === '2026-08-10')!.recent).toBe(false);
  });

  it('담당·반 미지정은 안전한 라벨로 대체한다', () => {
    const g = buildUnclosedGroups([row({ teacher_display_name: null, class_id: null, class_name: null })], RECENT_FROM);
    expect(g[0].teacher).toBe(NO_TEACHER);
    expect(g[0].className).toBe(NO_CLASS);
    expect(g[0].classId).toBeNull();
  });
});

describe('groupByTeacher', () => {
  const groups = buildUnclosedGroups(
    [
      row({ teacher_display_name: 'A', lesson_date: '2026-08-20' }),
      row({ teacher_display_name: 'A', lesson_date: '2026-08-20' }),
      row({ teacher_display_name: 'A', class_id: 'c2', class_name: '고2 수학', lesson_date: '2026-08-10' }),
      row({ teacher_display_name: 'B', lesson_date: '2026-08-09' }),
    ],
    RECENT_FROM
  );

  it('미마감 많은 순 → 오래된 순으로 정렬한다', () => {
    const t = groupByTeacher(groups);
    expect(t.map((x) => x.teacher)).toEqual(['A', 'B']);
    expect(t[0].unclosedCount).toBe(3);
    expect(t[0].oldestDate).toBe('2026-08-10');
    expect(t[0].classCount).toBe(2);
    expect(t[0].recentCount).toBe(2);
    expect(t[0].olderCount).toBe(1);
  });

  it('동일 건수면 오래된 강사가 먼저', () => {
    const g = buildUnclosedGroups(
      [row({ teacher_display_name: 'X', lesson_date: '2026-08-20' }), row({ teacher_display_name: 'Y', lesson_date: '2026-08-09' })],
      RECENT_FROM
    );
    expect(groupByTeacher(g).map((t) => t.teacher)).toEqual(['Y', 'X']);
  });
});

describe('buildTeacherNotice', () => {
  const t = groupByTeacher(
    buildUnclosedGroups(
      [
        row({ teacher_display_name: '함유빈', lesson_date: '2026-08-20' }),
        row({ teacher_display_name: '함유빈', class_id: 'c2', class_name: '고2 수학', lesson_date: '2026-08-11' }),
      ],
      RECENT_FROM
    )
  )[0];

  it('강사명·총건수·가장 오래된 날짜·반별 건수·마감 링크 안내를 포함한다', () => {
    const text = buildTeacherNotice(t, '최근 14일(2026-08-08 ~ 2026-08-21)');
    expect(text).toContain('함유빈 선생님');
    expect(text).toContain('미마감 2건');
    expect(text).toContain('2026-08-11');
    expect(text).toContain('중2 수학A: 1건');
    expect(text).toContain('/lessons/close');
  });

  it('학생 실명·UUID를 포함하지 않는다', () => {
    const text = buildTeacherNotice(t, '최근 14일');
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text).not.toContain('c1');
  });
});
