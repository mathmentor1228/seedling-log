import { describe, expect, it } from 'vitest';
import {
  buildAttendanceNotificationMessage,
  cleanStudentNameForParent,
  defaultAttendanceNotificationType,
} from './attendanceNotification';

describe('attendance parent notifications', () => {
  it('defaults to the late message only for a student marked late', () => {
    expect(defaultAttendanceNotificationType('지각')).toBe('late');
    expect(defaultAttendanceNotificationType('미등원')).toBe('not_arrived');
    expect(defaultAttendanceNotificationType('등원')).toBe('not_arrived');
  });

  it('builds the late message with the actual class time and arrival confirmation', () => {
    const message = buildAttendanceNotificationMessage({
      type: 'late',
      studentName: '홍길동',
      subject: '수학',
      startTime: '18:00',
      teacherName: '김담임',
    });

    expect(message).toContain('학생: 홍길동');
    expect(message).toContain('수업: 수학 18:00');
    expect(message).toContain('상태: 지각');
    expect(message).toContain('현재 등원 확인되어 수업에 참여합니다.');
    expect(message).toContain('담당 선생님: 김담임');
  });

  it('builds the not-arrived message without claiming an absence', () => {
    const message = buildAttendanceNotificationMessage({
      type: 'not_arrived',
      studentName: '홍길동',
      subject: '영어',
      startTime: '19:30',
      teacherName: '이담임',
    });

    expect(message).toContain('상태: 등원 전');
    expect(message).toContain('아직 등원하지 않았습니다.');
    expect(message).toContain('등원 예정 시간이나 결석 사유');
    expect(message).not.toContain('결석 처리되었습니다');
  });

  it('removes only the internal same-name suffix from the parent-facing name', () => {
    expect(cleanStudentNameForParent('이승현_H')).toBe('이승현');
    expect(cleanStudentNameForParent('박채원_M')).toBe('박채원');
    expect(cleanStudentNameForParent('홍길동')).toBe('홍길동');
  });
});
