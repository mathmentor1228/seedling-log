// TEACHER-CHANGE-LOG-V1 — 수강과정 담당 선생님 변경을 학생 수업관리 기록(team_notes)에 함께 남기기 위한 순수 로직
export interface TeacherChangeInfo {
  studentId: string;
  subject: string | null;
  fromTeacherName: string | null;
  toTeacherName: string | null;
  effectiveDate: string; // YYYY-MM-DD
  reason?: string | null;
}

export function teacherChangeTitle(c: TeacherChangeInfo): string {
  const subj = c.subject ? `${c.subject} ` : '';
  return `[담당변경] ${subj}${c.fromTeacherName || '미지정'} → ${c.toTeacherName || '미지정'} (${c.effectiveDate})`;
}

export function teacherChangeBody(c: TeacherChangeInfo): string {
  const lines = [
    `적용 시작일: ${c.effectiveDate}`,
    `과목: ${c.subject || '미지정'}`,
    `이전 담당: ${c.fromTeacherName || '미지정'}`,
    `변경 담당: ${c.toTeacherName || '미지정'}`,
  ];
  if (c.reason && c.reason.trim()) lines.push(`사유: ${c.reason.trim()}`);
  lines.push('※ 이 날짜 이전 수업 기록의 담당자 표기는 그대로 보존됩니다.');
  return lines.join('\n');
}

/** team_notes 에 그대로 insert 할 수 있는 payload (추가만, 기존 기록 수정 없음) */
export function buildTeacherChangeNote(c: TeacherChangeInfo, createdBy: string) {
  return {
    scope: 'student' as const,
    student_id: c.studentId,
    target_role: 'teacher' as const,
    status: 'done' as const,
    priority: 'normal' as const,
    title: teacherChangeTitle(c),
    body: teacherChangeBody(c),
    due_date: null as string | null,
    created_by: createdBy,
  };
}

export interface TeacherChangeRow {
  id: string;
  student_id: string;
  subject: string | null;
  from_teacher_name: string | null;
  to_teacher_name: string | null;
  effective_date: string;
  reason: string | null;
  created_at: string;
}

/** 학생명까지 합쳐 한 문자열로 검색 (이름/과목/선생님/사유/날짜) */
export function matchesTeacherChangeQuery(
  row: TeacherChangeRow & { student_name?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.student_name, row.subject, row.from_teacher_name, row.to_teacher_name,
    row.reason, row.effective_date,
  ].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}
