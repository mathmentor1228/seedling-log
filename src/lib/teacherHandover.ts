// TEACHER-HANDOVER-V1 — 원장 일괄 담당 인계용 순수 로직 (DB 접근 없음)
import type { TeacherChangeInfo } from './teacherChangeLog';

export interface HandoverRow {
  courseId: string;
  studentId: string;
  studentName: string;
  grade: string | null;
  subject: string | null;
  courseName: string | null;
  teacherId: string | null;
}

/** 이름·과목·학년 통합 검색 */
export function matchesHandoverQuery(row: HandoverRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.studentName, row.subject, row.grade, row.courseName]
    .filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}

export function buildHandoverChange(
  row: HandoverRow,
  opts: { effectiveDate: string; reason?: string | null; fromTeacherName: string | null; toTeacherName: string | null }
): TeacherChangeInfo {
  return {
    studentId: row.studentId,
    subject: row.subject,
    fromTeacherName: opts.fromTeacherName,
    toTeacherName: opts.toTeacherName,
    effectiveDate: opts.effectiveDate,
    reason: opts.reason ?? null,
  };
}

export function validateHandover(input: {
  selected: string[]; toTeacherId: string; fromTeacherId: string; effectiveDate: string;
}): string | null {
  if (!input.fromTeacherId) return '인계할 기존 선생님을 선택해주세요';
  if (input.selected.length === 0) return '인계할 학생을 선택해주세요';
  if (!input.toTeacherId) return '새 담당 선생님을 선택해주세요';
  if (input.toTeacherId === input.fromTeacherId) return '기존 선생님과 동일합니다';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) return '적용 시작일을 올바르게 입력해주세요';
  return null;
}
