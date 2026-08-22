// STUDENT-KARTE-V1 — 순수 계산 유틸 (읽기 전용, 저장/판단 점수 없음)
import { getAttendanceCategory, isAbsent, isUnrecorded } from '@/lib/attendance';

export interface KarteLesson {
  id: string;
  lesson_date: string;
  subject: string | null;
  submitted: boolean | null;
  attendance_status: string[] | null;
  lesson_range: string | null;
  understanding_score: number | null;
  teacher_display_name: string | null;
  homework_status: string | null;
}

export interface KarteHomework {
  id: string;
  assigned_date: string;
  subject: string | null;
  content: string | null;
  result: string | null;
  check_status: string | null;
  submitted_at: string | null;
  homework_type: string | null;
}

export interface KarteReport {
  id: string;
  week_start: string;
  week_end: string;
  parent_visible: boolean | null;
  report_quality_tag: string | null;
}

export interface KarteNote {
  id: string;
  created_at: string;
  title: string | null;
  scope: string | null;
  status: string | null;
  target_role: string | null;
}

export interface KarteSummary {
  /** 최근 30일 수업일지 중 기록 없음 */
  notStarted: number;
  /** 최근 30일 수업일지 중 작성 중(미마감) */
  inProgress: number;
  absent: number;
  late: number;
  earlyLeave: number;
  attendanceUnset: number;
  /** 수업출결은 출석인데 출입 태그 입실 로그 없음 */
  checkInGap: number;
  /** 숙제 미이행 (result = not_done / low_effort 계열) */
  homeworkNotDone: number;
  /** 제출 필요 숙제 중 미제출 */
  homeworkUnsubmitted: number;
  /** 최근 30일 내 주간리포트 존재 여부 */
  hasRecentReport: boolean;
  totalIssues: number;
}

const NOT_DONE_RESULTS = ['not_done', 'low_effort', 'lost', 'unable_to_verify'];

export function summarizeKarte(params: {
  lessons: KarteLesson[];
  homework: KarteHomework[];
  reports: KarteReport[];
  /** `${date}` 형태의 입실(체크인) 기록 날짜 집합 */
  checkedInDates: Set<string>;
  /** 최근 30일 시작일 (YYYY-MM-DD, 포함) */
  since: string;
}): KarteSummary {
  const { checkedInDates, since } = params;
  const lessons = params.lessons.filter((l) => l.lesson_date >= since);
  const homework = params.homework.filter((h) => h.assigned_date >= since);
  const reports = params.reports.filter((r) => r.week_start >= since);

  let notStarted = 0, inProgress = 0, absent = 0, late = 0, earlyLeave = 0, attendanceUnset = 0, checkInGap = 0;

  for (const l of lessons) {
    const statuses = l.attendance_status || [];
    const unrecorded = isUnrecorded(statuses);
    const hasContent = !unrecorded || !!(l.lesson_range && l.lesson_range.trim());
    if (!l.submitted) {
      if (hasContent) inProgress += 1;
      else notStarted += 1;
      if (unrecorded) attendanceUnset += 1;
    }
    const cats = statuses.map(getAttendanceCategory);
    const absentHere = isAbsent(statuses);
    if (absentHere) absent += 1;
    if (cats.includes('late')) late += 1;
    if (cats.includes('early_leave')) earlyLeave += 1;
    const presentish =
      !absentHere && cats.some((c) => c === 'present' || c === 'late' || c === 'early_leave');
    if (presentish && !checkedInDates.has(l.lesson_date)) checkInGap += 1;
  }

  let homeworkNotDone = 0, homeworkUnsubmitted = 0;
  for (const h of homework) {
    if (h.result && NOT_DONE_RESULTS.includes(h.result)) homeworkNotDone += 1;
    if (!h.submitted_at && h.check_status !== 'checked' && !h.result) homeworkUnsubmitted += 1;
  }

  const totalIssues =
    notStarted + inProgress + absent + late + earlyLeave + attendanceUnset + checkInGap +
    homeworkNotDone + homeworkUnsubmitted;

  return {
    notStarted, inProgress, absent, late, earlyLeave, attendanceUnset, checkInGap,
    homeworkNotDone, homeworkUnsubmitted,
    hasRecentReport: reports.length > 0,
    totalIssues,
  };
}

export type TimelineKind = 'lesson' | 'attendance' | 'homework' | 'report' | 'note';

export interface TimelineItem {
  id: string;
  date: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  authorRole: string;
  href?: string;
}

function shorten(text: string | null | undefined, n = 40): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function buildTimeline(params: {
  lessons: KarteLesson[];
  homework: KarteHomework[];
  reports: KarteReport[];
  notes: KarteNote[];
  attendanceDates: { date: string; checkedIn: boolean; checkedOut: boolean }[];
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const l of params.lessons) {
    items.push({
      id: `lesson-${l.id}`,
      date: l.lesson_date,
      kind: 'lesson',
      title: `수업일지 · ${l.subject || '-'}`,
      detail: [
        l.submitted ? '마감 완료' : '미마감',
        (l.attendance_status || []).join('/') || '수업출결 미선택',
        shorten(l.lesson_range, 24),
      ].filter(Boolean).join(' · '),
      authorRole: l.teacher_display_name ? `강사 ${l.teacher_display_name}` : '강사',
      href: `/lessons/record/${l.id}`,
    });
  }

  for (const h of params.homework) {
    items.push({
      id: `hw-${h.id}`,
      date: h.assigned_date,
      kind: 'homework',
      title: `숙제 · ${h.subject || '-'}`,
      detail: [shorten(h.content, 28), h.result ? `결과 ${h.result}` : h.submitted_at ? '제출됨' : '미확인']
        .filter(Boolean).join(' · '),
      authorRole: '강사',
    });
  }

  for (const r of params.reports) {
    items.push({
      id: `rep-${r.id}`,
      date: r.week_start,
      kind: 'report',
      title: '주간 리포트',
      detail: `${r.week_start} ~ ${r.week_end} · ${r.parent_visible ? '학부모 공개' : '비공개 초안'}`,
      authorRole: '시스템',
      href: '/reports',
    });
  }

  for (const n of params.notes) {
    items.push({
      id: `note-${n.id}`,
      date: n.created_at.slice(0, 10),
      kind: 'note',
      title: `상담·메모 · ${shorten(n.title, 20) || '제목 없음'}`,
      detail: [n.scope, n.status].filter(Boolean).join(' · '),
      authorRole: n.target_role ? `대상 ${n.target_role}` : '원내',
    });
  }

  for (const a of params.attendanceDates) {
    items.push({
      id: `att-${a.date}`,
      date: a.date,
      kind: 'attendance',
      title: '출입 태그',
      detail: [a.checkedIn ? '입실' : '입실 없음', a.checkedOut ? '퇴실' : ''].filter(Boolean).join(' · '),
      authorRole: '출입 시스템',
    });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
}

// ── STUDENT-KARTE-V2: 기간·과목 필터와 12주 변화 추이 (순수 함수) ─────────────

export type KartePeriod = '4w' | '12w' | 'term';

export const PERIOD_DAYS: Record<KartePeriod, number> = {
  '4w': 28,
  '12w': 84,
  term: 182,
};

export const PERIOD_LABEL: Record<KartePeriod, string> = {
  '4w': '최근 4주',
  '12w': '최근 12주',
  term: '이번 학기(최근 26주)',
};

export function parsePeriod(raw: string | null | undefined): KartePeriod {
  return raw === '4w' || raw === '12w' || raw === 'term' ? raw : '12w';
}

/** 'YYYY-MM-DD' 기준 n일 이동 (KST 고정, 시간대 흔들림 없음) */
export function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 해당 날짜가 속한 주의 월요일 (ISO) */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=일
  const back = dow === 0 ? 6 : dow - 1;
  return shiftIsoDate(date, -back);
}

export function matchesSubject(subject: string | null | undefined, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  return (subject || '') === filter;
}

export interface TrendWeek {
  weekStart: string;
  lessonCount: number;
  /** 출결이 기록된 수업만 분모. 분모 0이면 null (= 데이터 없음) */
  attendanceRate: number | null;
  attendanceDenom: number;
  /** 결과가 기록된 숙제만 분모. 분모 0이면 null */
  homeworkRate: number | null;
  homeworkDenom: number;
  /** 이해도 평균. 입력 0건이면 null */
  understandingAvg: number | null;
  understandingDenom: number;
}

const DONE_RESULTS = ['completed', 'low_effort_completed'];

/** 주 단위 변화 추이. 데이터가 없는 주도 buckets에 포함하고 값은 null로 둔다. */
export function buildTrend(params: {
  lessons: KarteLesson[];
  homework: KarteHomework[];
  /** 마지막 주(오늘 기준) */
  today: string;
  weeks: number;
}): TrendWeek[] {
  const { lessons, homework, today, weeks } = params;
  const lastMonday = mondayOf(today);
  const buckets = new Map<string, TrendWeek>();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const ws = shiftIsoDate(lastMonday, -7 * i);
    buckets.set(ws, {
      weekStart: ws, lessonCount: 0,
      attendanceRate: null, attendanceDenom: 0,
      homeworkRate: null, homeworkDenom: 0,
      understandingAvg: null, understandingDenom: 0,
    });
  }
  const attHit = new Map<string, number>();
  const hwHit = new Map<string, number>();
  const undSum = new Map<string, number>();

  for (const l of lessons) {
    const ws = mondayOf(l.lesson_date);
    const b = buckets.get(ws);
    if (!b) continue;
    b.lessonCount += 1;
    const statuses = l.attendance_status || [];
    if (!isUnrecorded(statuses)) {
      b.attendanceDenom += 1;
      if (!isAbsent(statuses)) attHit.set(ws, (attHit.get(ws) || 0) + 1);
    }
    if (typeof l.understanding_score === 'number') {
      b.understandingDenom += 1;
      undSum.set(ws, (undSum.get(ws) || 0) + l.understanding_score);
    }
  }

  for (const h of homework) {
    const ws = mondayOf(h.assigned_date);
    const b = buckets.get(ws);
    if (!b || !h.result) continue;
    b.homeworkDenom += 1;
    if (DONE_RESULTS.includes(h.result)) hwHit.set(ws, (hwHit.get(ws) || 0) + 1);
  }

  for (const b of buckets.values()) {
    if (b.attendanceDenom > 0) b.attendanceRate = Math.round(((attHit.get(b.weekStart) || 0) / b.attendanceDenom) * 100);
    if (b.homeworkDenom > 0) b.homeworkRate = Math.round(((hwHit.get(b.weekStart) || 0) / b.homeworkDenom) * 100);
    if (b.understandingDenom > 0) b.understandingAvg = Math.round(((undSum.get(b.weekStart) || 0) / b.understandingDenom) * 10) / 10;
  }

  return [...buckets.values()];
}
