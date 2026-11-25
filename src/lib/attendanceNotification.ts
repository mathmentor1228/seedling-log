export type AttendanceNotificationType = 'late' | 'not_arrived';

export const ATTENDANCE_NOTIFICATION_LABEL: Record<AttendanceNotificationType, string> = {
  late: '지각',
  not_arrived: '등원 전',
};

export function defaultAttendanceNotificationType(status: string): AttendanceNotificationType {
  return status === '지각' ? 'late' : 'not_arrived';
}

interface AttendanceMessageInput {
  type: AttendanceNotificationType;
  studentName: string;
  subject: string;
  startTime: string;
  teacherName: string;
}

export function cleanStudentNameForParent(name: string): string {
  return name.trim().replace(/_[A-Z]$/, '');
}

export function buildAttendanceNotificationMessage({
  type,
  studentName,
  subject,
  startTime,
  teacherName,
}: AttendanceMessageInput): string {
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
