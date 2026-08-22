import { describe, expect, it } from 'vitest';
import { buildTimeline, buildTrend, matchesSubject, mondayOf, parsePeriod, summarizeKarte, type KarteHomework, type KarteLesson } from './karteSummary';

const lesson = (over: Partial<KarteLesson>): KarteLesson => ({
  id: Math.random().toString(36).slice(2),
  lesson_date: '2026-08-20',
  subject: '수학',
  submitted: true,
  attendance_status: ['정상등원'],
  lesson_range: '교재 p.10-20',
  understanding_score: 4,
  teacher_display_name: '함유빈',
  homework_status: 'completed',
  ...over,
});

const hw = (over: Partial<KarteHomework>): KarteHomework => ({
  id: Math.random().toString(36).slice(2),
  assigned_date: '2026-08-20',
  subject: '수학',
  content: '워크북 p.5',
  result: null,
  check_status: null,
  submitted_at: null,
  homework_type: 'regular',
  ...over,
});

describe('summarizeKarte', () => {
  const base = { reports: [], checkedInDates: new Set<string>(), since: '2026-08-01' };

  it('기간 밖 데이터는 제외한다', () => {
    const s = summarizeKarte({
      ...base,
      lessons: [lesson({ lesson_date: '2026-07-01', submitted: false, attendance_status: [] })],
      homework: [],
    });
    expect(s.notStarted).toBe(0);
    expect(s.totalIssues).toBe(0);
  });

  it('미작성/작성중/출결 미선택을 구분한다', () => {
    const s = summarizeKarte({
      ...base,
      lessons: [
        lesson({ submitted: false, attendance_status: [], lesson_range: null }),
        lesson({ submitted: false, attendance_status: [], lesson_range: '진도 기록' }),
      ],
      homework: [],
    });
    expect(s.notStarted).toBe(1);
    expect(s.inProgress).toBe(1);
    expect(s.attendanceUnset).toBe(2);
  });

  it('결석은 입실 미기록으로 세지 않는다', () => {
    const s = summarizeKarte({
      ...base,
      lessons: [lesson({ attendance_status: ['결석'] })],
      homework: [],
    });
    expect(s.absent).toBe(1);
    expect(s.checkInGap).toBe(0);
  });

  it('출석인데 입실 태그가 없으면 checkInGap', () => {
    const s = summarizeKarte({
      ...base,
      lessons: [lesson({ lesson_date: '2026-08-20' }), lesson({ lesson_date: '2026-08-21' })],
      homework: [],
      checkedInDates: new Set(['2026-08-21']),
    });
    expect(s.checkInGap).toBe(1);
  });

  it('숙제 미이행/미제출을 집계한다', () => {
    const s = summarizeKarte({
      ...base,
      lessons: [],
      homework: [hw({ result: 'not_done' }), hw({}), hw({ submitted_at: '2026-08-20T10:00:00Z' })],
    });
    expect(s.homeworkNotDone).toBe(1);
    expect(s.homeworkUnsubmitted).toBeGreaterThanOrEqual(1);
    expect(s.totalIssues).toBeGreaterThan(0);
  });
});

describe('buildTimeline', () => {
  it('여러 원천을 날짜 최신순으로 합친다', () => {
    const items = buildTimeline({
      lessons: [lesson({ lesson_date: '2026-08-10' })],
      homework: [hw({ assigned_date: '2026-08-12' })],
      reports: [{ id: 'r1', week_start: '2026-08-03', week_end: '2026-08-09', parent_visible: false, report_quality_tag: null }],
      notes: [{ id: 'n1', created_at: '2026-08-15T02:00:00Z', title: '상담', scope: null, status: null, target_role: null }],
      attendanceDates: [{ date: '2026-08-11', checkedIn: true, checkedOut: false }],
    });
    const dates = items.map((i) => i.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(['lesson', 'homework', 'report', 'note', 'attendance']));
  });

  it('데이터가 없으면 빈 배열', () => {
    expect(buildTimeline({ lessons: [], homework: [], reports: [], notes: [], attendanceDates: [] })).toEqual([]);
  });
});

describe('buildTrend / 기간·과목 필터', () => {
  it('분모 0이면 null(데이터 없음)로 둔다', () => {
    const t = buildTrend({ lessons: [], homework: [], today: '2026-08-22', weeks: 4 });
    expect(t).toHaveLength(4);
    expect(t.every((w) => w.attendanceRate === null && w.homeworkRate === null && w.understandingAvg === null)).toBe(true);
  });

  it('출결·숙제·이해도 분모는 기록된 값만 센다', () => {
    const t = buildTrend({
      lessons: [
        lesson({ lesson_date: '2026-08-18', attendance_status: ['정상등원'], understanding_score: 4 }),
        lesson({ lesson_date: '2026-08-19', attendance_status: ['무단결석'], understanding_score: null }),
        lesson({ lesson_date: '2026-08-20', attendance_status: [], understanding_score: null }),
      ],
      homework: [
        hw({ assigned_date: '2026-08-18', result: 'completed' }),
        hw({ assigned_date: '2026-08-19', result: 'not_done' }),
        hw({ assigned_date: '2026-08-20', result: null }),
      ],
      today: '2026-08-22',
      weeks: 1,
    });
    const w = t[0];
    expect(w.weekStart).toBe('2026-08-17');
    expect(w.lessonCount).toBe(3);
    expect(w.attendanceDenom).toBe(2);
    expect(w.attendanceRate).toBe(50);
    expect(w.homeworkDenom).toBe(2);
    expect(w.homeworkRate).toBe(50);
    expect(w.understandingDenom).toBe(1);
    expect(w.understandingAvg).toBe(4);
  });

  it('기간 경계 밖 주는 buckets에 들어가지 않는다', () => {
    const t = buildTrend({
      lessons: [lesson({ lesson_date: '2026-01-05' })],
      homework: [],
      today: '2026-08-22',
      weeks: 2,
    });
    expect(t.reduce((a, w) => a + w.lessonCount, 0)).toBe(0);
  });

  it('mondayOf / parsePeriod / matchesSubject', () => {
    expect(mondayOf('2026-08-22')).toBe('2026-08-17');
    expect(mondayOf('2026-08-17')).toBe('2026-08-17');
    expect(mondayOf('2026-08-23')).toBe('2026-08-17');
    expect(parsePeriod(null)).toBe('12w');
    expect(parsePeriod('4w')).toBe('4w');
    expect(parsePeriod('bogus')).toBe('12w');
    expect(matchesSubject('수학', 'all')).toBe(true);
    expect(matchesSubject('수학', '영어')).toBe(false);
    expect(matchesSubject(null, '영어')).toBe(false);
  });
});
