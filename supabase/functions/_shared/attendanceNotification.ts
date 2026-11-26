export type AttendanceNotificationType = 'late' | 'not_arrived' | 'absent';

export const ATTENDANCE_NOTIFICATION_LABEL: Record<AttendanceNotificationType, string> = {
  late: '지각',
  not_arrived: '등원 전',
  absent: '결석',
};

interface AttendanceMessageInput {
  type: AttendanceNotificationType;
  studentName: string;
  subject: string;
  startTime: string;
  teacherName: string;
  absenceReason?: string;
  makeupText?: string;
}

export function cleanStudentNameForParent(name: string): string {
  return name.trim().replace(/_[A-Z]$/, '');
}

// src/lib/attendanceNotification.ts의 화면 미리보기와 같은 문구를 유지한다.
export const NO_MAKEUP_TEXT = '보강 일정은 정해지는 대로 다시 안내드리겠습니다.';

export function formatMakeupText(date?: string | null, time?: string | null): string {
  if (!date) return NO_MAKEUP_TEXT;
  const [, m, d] = date.split('-').map(Number);
  const t = time && time !== '미정' ? ` ${time}` : ' (시간 추후 안내)';
  return `${m}월 ${d}일${t}`;
}

export function buildAbsenceNotificationMessage(input: {
  studentName: string; subject: string; startTime: string; teacherName: string; absenceReason: string; makeupText: string;
}): string {
  return [
    '[더멘토학원 결석 안내]',
    `학생: ${cleanStudentNameForParent(input.studentName)}`,
    `수업: ${input.subject} ${input.startTime}`,
    `결석 사유: ${input.absenceReason.trim()}`,
    `보강 일정: ${input.makeupText}`,
    '',
    '오늘 수업은 결석으로 처리되었습니다. 문의 사항은 학원으로 연락 부탁드립니다.',
    '',
    `담당 선생님: ${input.teacherName}`,
  ].join('\n');
}

export function buildAttendanceNotificationMessage({
  type,
  studentName,
  subject,
  startTime,
  teacherName,
  absenceReason,
  makeupText,
}: AttendanceMessageInput): string {
  if (type === 'absent') {
    return buildAbsenceNotificationMessage({ studentName, subject, startTime, teacherName, absenceReason: absenceReason || '', makeupText: makeupText || NO_MAKEUP_TEXT });
  }
  const name = cleanStudentNameForParent(studentName);
  const guidance = type === 'late'
    ? `오늘 ${subject} 수업에 늦게 등원했습니다. 현재 등원 확인되어 수업에 참여합니다.`
    : `오늘 ${subject} 수업 시작 시간까지 아직 등원하지 않았습니다. 등원 예정 시간이나 결석 사유를 알고 계시면 학원으로 연락 부탁드립니다.`;

  return [
    '[더멘토학원 출결 안내]',
    `학생: ${name}`,
    `수업: ${subject} ${startTime}`,
    `상태: ${ATTENDANCE_NOTIFICATION_LABEL[type]}`,
    '',
    guidance,
    '',
    `담당 선생님: ${teacherName}`,
  ].join('\n');
}
