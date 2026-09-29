// OFFICE-TASK-STUDENT-SYNC-V1
// 행정 업무 보드 ↔ 학생 기록(students.enrollment_status) 자동 반영 규칙.
// DB 쪽 규칙은 supabase/migrations/20260929090000_office_task_student_sync.sql 과 같아야 한다.

export const OFFICE_CATEGORIES = [
  '신규생 정보', '퇴원생 안내', '휴원 안내', '재등원 안내', '수강과목 변경',
  '등록 문자', '시간표', '원비 수납', '미납 확인', '교재비 정리', '기타',
] as const;

export type OfficeCategory = typeof OFFICE_CATEGORIES[number];

/** 분류 → 자동으로 바뀌는 재원상태. 없으면 상태 변경 없음. */
const TARGET_STATUS: Record<string, string> = {
  '퇴원생 안내': '퇴원',
  '휴원 안내': '휴학',
  '재등원 안내': '재등원',
};

const TITLE_PREFIX: Record<string, string> = {
  '퇴원생 안내': '[퇴원]',
  '휴원 안내': '[휴원]',
  '재등원 안내': '[재등원]',
  '수강과목 변경': '[과목변경]',
};

export type SyncStatus = 'scheduled' | 'applied' | 'no_change' | 'skipped' | null;

export interface PickableStudent {
  id: string;
  name: string;
  school?: string | null;
  school_level?: string | null;
  grade_year?: number | null;
  enrollment_status?: string | null;
}

export function targetStatusFor(category: string): string | null {
  return TARGET_STATUS[category] ?? null;
}

/** 학생을 반드시 골라야 하는 분류 (재원상태 변경 + 과목 변경) */
export function needsStudent(category: string): boolean {
  return category in TITLE_PREFIX;
}

/** 재원상태가 자동으로 바뀌는 분류 */
export function changesStatus(category: string): boolean {
  return category in TARGET_STATUS;
}

export function studentLabel(s: PickableStudent): string {
  const grade = s.school_level && s.grade_year ? `${s.school_level}${s.grade_year}` : '';
  const tail = [s.school, grade].filter(Boolean).join(' ');
  return tail ? `${s.name} (${tail})` : s.name;
}

export function buildTaskTitle(category: string, student: PickableStudent | null): string {
  const prefix = TITLE_PREFIX[category];
  if (!prefix) return '';
  if (!student) return `${prefix} `;
  return `${prefix} ${studentLabel(student)}`;
}

/** 분류에 맞는 학생만 고르게 한다: 재등원은 퇴원·휴학생만, 나머지는 퇴원생 제외 */
export function pickableStudents<T extends PickableStudent>(category: string, students: T[]): T[] {
  if (category === '재등원 안내') {
    return students.filter(s => s.enrollment_status === '퇴원' || s.enrollment_status === '휴학');
  }
  if (needsStudent(category)) {
    return students.filter(s => s.enrollment_status !== '퇴원');
  }
  return students;
}

/** KST 기준 오늘 (YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 등록 전 미리보기 문구 */
export function syncPreviewText(category: string, effectiveDate: string, today: string = todayKst()): string | null {
  const target = targetStatusFor(category);
  if (!target) return null;
  const extra = target === '퇴원' || target === '휴학'
    ? ' 반·시간표·강의실 배정도 함께 정리됩니다.'
    : '';
  if (!effectiveDate || effectiveDate <= today) {
    return `등록하면 바로 이 학생의 재원상태가 '${target}'으로 바뀝니다.${extra}`;
  }
  return `${effectiveDate}에 재원상태가 '${target}'으로 자동 변경됩니다.${extra} 그 전까지는 지금 상태 그대로 수업에 잡힙니다.`;
}

/** 등록 직후 토스트 문구 */
export function syncResultToast(category: string, studentName: string, effectiveDate: string, today: string = todayKst()): string | null {
  const target = targetStatusFor(category);
  if (!target) return null;
  if (!effectiveDate || effectiveDate <= today) {
    return `${studentName} 학생 재원상태가 '${target}'으로 반영되었습니다`;
  }
  return `${studentName} 학생은 ${effectiveDate}에 '${target}'으로 자동 반영됩니다`;
}

export interface SyncBadge {
  label: string;
  tone: 'success' | 'warning' | 'muted';
}

/** 업무 카드에 붙는 반영 상태 배지 */
export function syncBadge(task: { student_sync_status?: SyncStatus; effective_date?: string | null; student_id?: string | null; category: string }): SyncBadge | null {
  if (!task.student_id || !changesStatus(task.category)) return null;
  switch (task.student_sync_status) {
    case 'applied': return { label: '학생 기록 반영됨', tone: 'success' };
    case 'scheduled': return { label: `${task.effective_date ?? ''} 반영 예정`.trim(), tone: 'warning' };
    case 'no_change': return { label: '이미 같은 상태', tone: 'muted' };
    case 'skipped': return { label: '반영 안 됨', tone: 'warning' };
    default: return { label: '반영 대기', tone: 'muted' };
  }
}
