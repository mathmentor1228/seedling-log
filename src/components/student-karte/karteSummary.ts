// STUDENT-KARTE-V1 — 순수 계산 유틸 (읽기 전용, 저장/판단 점수 없음)
import { getAttendanceCategory, isUnrecorded } from '@/lib/attendance';

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
    if (cats.some((c) => c === 'absent' || c === 'unauthorized_absent')) absent += 1;
    if (cats.includes('late')) late += 1;
    if (cats.includes('early_leave')) earlyLeave += 1;
    const presentish =
      !cats.some((c) => c === 'absent' || c === 'unauthorized_absent') &&
      cats.some((c) => c === 'present' || c === 'late' || c === 'early_leave');
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
