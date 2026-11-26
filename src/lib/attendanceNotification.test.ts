import { describe, expect, it } from 'vitest';
import {
  buildAttendanceNotificationMessage,
  cleanStudentNameForParent,
  defaultAttendanceNotificationType,
  formatMakeupText,
  NO_MAKEUP_TEXT,
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

  it('absence message carries the reason and the makeup date/time', () => {
    const msg = buildAttendanceNotificationMessage({ type: 'absent', studentName: '홍길동_H', subject: '수학', startTime: '18:00', teacherName: '김담임', absenceReason: '병원 진료', makeupText: formatMakeupText('2026-11-28', '17:00') });
    expect(msg).toContain('학생: 홍길동');
    expect(msg).toContain('결석 사유: 병원 진료');
    expect(msg).toContain('보강 일정: 11월 28일 17:00');
  });

  it('absence without makeup says it will be announced later', () => {
    expect(formatMakeupText(null, null)).toBe(NO_MAKEUP_TEXT);
    expect(formatMakeupText('2026-12-01', '미정')).toBe('12월 1일 (시간 추후 안내)');
  });
});
