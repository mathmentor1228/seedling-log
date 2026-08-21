// UNCLOSED-BY-TEACHER-V1 — 순수 계산 유틸 (읽기 전용, 저장/발송 없음)
// 판정 근거는 lesson_records의 submitted / attendance_status / lesson_range 뿐이다.
import { getCardDisplay } from '@/components/teacher/cardStatus';

export interface UnclosedRecordRow {
  id: string;
  class_id: string | null;
  class_name: string | null;
  lesson_date: string;
  submitted: boolean | null;
  attendance_status: string[] | null;
  lesson_range: string | null;
  teacher_display_name: string | null;
}

export type GroupState = 'not_started' | 'in_progress';

export interface UnclosedGroup {
  key: string;
  teacher: string;
  classId: string | null;
  className: string;
  date: string;
  /** 그룹(반·수업일)의 전체 학생 기록 수 */
  studentCount: number;
  /** 내용(출결 또는 진도)이 하나라도 기록된 학생 수 */
  recordedCount: number;
  /** 마감(submitted=true) 처리된 학생 수 */
  submittedCount: number;
  /** 아직 마감되지 않은 학생 수 */
  openCount: number;
  state: GroupState;
  /** 최근 7일(오늘 포함) 이내 수업인지 */
  recent: boolean;
}

export interface TeacherUnclosed {
  teacher: string;
  unclosedCount: number;
  oldestDate: string;
  classCount: number;
  recentCount: number;
  olderCount: number;
  notStartedCount: number;
  inProgressCount: number;
  groups: UnclosedGroup[];
}

export function addDaysKST(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const NO_TEACHER = '(담당 미지정)';
export const NO_CLASS = '(반 미지정)';

/**
 * 반·수업일·담당강사 단위로 묶어 미마감 그룹을 만든다.
 * - submitted=true 기록은 마감 완료로 보고 미마감/작성중으로 세지 않는다.
 *   (8월 이전 출결만으로 정리 완료된 기록도 submitted=true 이므로 여기서 제외된다.)
 * - 그룹 안 모든 학생이 마감되었으면 그룹 자체를 제외한다.
 */
export function buildUnclosedGroups(rows: UnclosedRecordRow[], recentFrom: string): UnclosedGroup[] {
  const map = new Map<string, UnclosedGroup>();

  for (const r of rows) {
    const teacher = (r.teacher_display_name || '').trim() || NO_TEACHER;
    const className = (r.class_name || '').trim() || NO_CLASS;
    const key = `${teacher}|${r.class_id || 'noclass'}|${r.lesson_date}`;
    const g =
      map.get(key) ||
      ({
        key,
        teacher,
        classId: r.class_id,
        className,
        date: r.lesson_date,
        studentCount: 0,
        recordedCount: 0,
        submittedCount: 0,
        openCount: 0,
        state: 'not_started' as GroupState,
        recent: r.lesson_date >= recentFrom,
      } satisfies UnclosedGroup);

    const statuses = Array.isArray(r.attendance_status) ? r.attendance_status : [];
    const hasContent = statuses.length > 0 || !!(r.lesson_range && r.lesson_range.trim());
    g.studentCount += 1;
    if (hasContent) g.recordedCount += 1;
    if (r.submitted) g.submittedCount += 1;
    map.set(key, g);
  }

  const out: UnclosedGroup[] = [];
  for (const g of map.values()) {
    g.openCount = g.studentCount - g.submittedCount;
    if (g.openCount <= 0) continue;
    const state = getCardDisplay({
      studentCount: g.studentCount,
      recordedCount: g.recordedCount,
      submittedCount: g.submittedCount,
    }).state;
    if (state !== 'not_started' && state !== 'in_progress') continue;
    g.state = state;
    out.push(g);
  }
  return out;
}

/** 강사별 집계: 미마감 많은 순 → 가장 오래된 수업일 순 */
export function groupByTeacher(groups: UnclosedGroup[]): TeacherUnclosed[] {
  const map = new Map<string, TeacherUnclosed>();
  for (const g of groups) {
    const t =
      map.get(g.teacher) ||
      {
        teacher: g.teacher,
        unclosedCount: 0,
        oldestDate: g.date,
        classCount: 0,
        recentCount: 0,
        olderCount: 0,
        notStartedCount: 0,
        inProgressCount: 0,
        groups: [],
      };
    t.unclosedCount += g.openCount;
    if (g.date < t.oldestDate) t.oldestDate = g.date;
    if (g.recent) t.recentCount += g.openCount;
    else t.olderCount += g.openCount;
    if (g.state === 'not_started') t.notStartedCount += g.openCount;
    else t.inProgressCount += g.openCount;
    t.groups.push(g);
    map.set(g.teacher, t);
  }
  const list = [...map.values()];
  for (const t of list) {
    t.classCount = new Set(t.groups.map((g) => g.classId || g.className)).size;
    t.groups.sort((a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className, 'ko'));
  }
  list.sort((a, b) => b.unclosedCount - a.unclosedCount || a.oldestDate.localeCompare(b.oldestDate));
  return list;
}

export function groupStateLabel(g: Pick<UnclosedGroup, 'state' | 'recordedCount' | 'studentCount'>): string {
  return g.state === 'not_started'
    ? '전체 미작성 — 이 반·수업일의 수업일지가 아직 없습니다'
    : `일부 작성 — 학생 ${g.recordedCount}/${g.studentCount}명만 기록됨`;
}

/**
 * 강사 안내문(클립보드 전용). 자동 발송하지 않으며 학생 실명·UUID를 포함하지 않는다.
 */
export function buildTeacherNotice(t: TeacherUnclosed, windowLabel: string): string {
  const byClass = new Map<string, number>();
  for (const g of t.groups) byClass.set(g.className, (byClass.get(g.className) || 0) + g.openCount);
  const classLines = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([name, n]) => `- ${name}: ${n}건`);

  return [
    `${t.teacher} 선생님, 수업일지 마감 안내드립니다.`,
    `${windowLabel} 기준 미마감 ${t.unclosedCount}건이 남아 있습니다.`,
    `가장 오래된 수업일은 ${t.oldestDate}입니다.`,
    '',
    '반별 미마감 건수',
    ...classLines,
    '',
    '수업 마감은 [수업 마감] 메뉴(/lessons/close)에서 해당 반과 수업일을 선택해 진행하실 수 있습니다.',
    '확인 부탁드립니다. 감사합니다.',
  ].join('\n');
}
