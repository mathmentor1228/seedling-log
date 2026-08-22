// UNCLOSED-SCOPE-V1 — 미마감 판정의 공통 기준 (순수 함수, 조회/저장 없음)
// Action Center와 /admin/unclosed가 동일한 숫자를 내도록 이 모듈만 사용한다.
//
// 판정 기준
// - 과거 날짜(수업일 < KST 오늘): 항상 미마감 후보에 포함한다.
// - 미래 날짜: 제외한다.
// - KST 오늘: classes 요일·종료시간(class_schedules) 근거가 있고 현재시각이 종료시간을 지난 경우에만 포함한다.
//   근거가 없으면(시간 추정 금지) 제외하고, 해당 요일 스케줄이 휴강(is_active=false 또는 inactive_until 이후)으로
//   표시된 경우에도 제외한다.

export interface ClassScheduleRow {
  class_id: string | null;
  day_of_week: number | null;
  end_time: string | null;
  is_active: boolean | null;
  inactive_until: string | null;
}

export interface ScopeContext {
  /** KST 오늘 (YYYY-MM-DD) */
  today: string;
  /** KST 현재 시각 (자정부터의 분) */
  nowMinutes: number;
  schedules: ClassScheduleRow[];
}

export function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** KST 현재 시각을 자정부터의 분으로 반환 */
export function getNowMinutesKST(now: Date = new Date()): number {
  const hhmm = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return toMinutes(hhmm) ?? 0;
}

/** YYYY-MM-DD의 KST 요일 (0=일) */
export function dowKST(date: string): number {
  return new Date(`${date}T12:00:00+09:00`).getUTCDay();
}

export type ScopeVerdict = 'included' | 'future' | 'today_not_finished' | 'today_no_schedule' | 'today_cancelled';

/**
 * 특정 반·수업일이 '수업이 종료된 뒤'인지 판정한다.
 */
export function classifyLessonDay(
  classId: string | null,
  lessonDate: string,
  ctx: ScopeContext
): ScopeVerdict {
  if (lessonDate < ctx.today) return 'included';
  if (lessonDate > ctx.today) return 'future';

  const dow = dowKST(lessonDate);
  const rows = ctx.schedules.filter((s) => s.class_id && s.class_id === classId && s.day_of_week === dow);
  if (rows.length === 0) return 'today_no_schedule';

  const active = rows.filter(
    (s) => s.is_active !== false && !(s.inactive_until && lessonDate <= s.inactive_until)
  );
  if (active.length === 0) return 'today_cancelled';

  const ends = active.map((s) => toMinutes(s.end_time)).filter((n): n is number => n !== null);
  if (ends.length === 0) return 'today_no_schedule';

  return ctx.nowMinutes >= Math.max(...ends) ? 'included' : 'today_not_finished';
}

/** 미마감 집계 대상인지 여부 */
export function isFinishedLesson(classId: string | null, lessonDate: string, ctx: ScopeContext): boolean {
  return classifyLessonDay(classId, lessonDate, ctx) === 'included';
}

/** 공통 필터: 종료된 수업 기록만 남긴다 */
export function filterFinishedRecords<T extends { class_id: string | null; lesson_date: string }>(
  rows: T[],
  ctx: ScopeContext
): T[] {
  return rows.filter((r) => isFinishedLesson(r.class_id, r.lesson_date, ctx));
}

/** 백분율 표시용 안전 계산 (분모 0이면 0%) */
export function safePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}
