import { describe, expect, it } from 'vitest';
import {
  buildTaskTitle, changesStatus, needsStudent, pickableStudents, studentLabel,
  syncBadge, syncPreviewText, syncResultToast, targetStatusFor, todayKst,
} from './officeTaskSync';

const students = [
  { id: 'a', name: '김민준', school: '신길고', school_level: '고', grade_year: 2, enrollment_status: '재학' },
  { id: 'b', name: '이서연', school: '신길중', school_level: '중', grade_year: 3, enrollment_status: '휴학' },
  { id: 'c', name: '박지우', school: null, school_level: null, grade_year: null, enrollment_status: '퇴원' },
  { id: 'd', name: '최하늘', school: '원곡고', school_level: '고', grade_year: 1, enrollment_status: '재등원' },
];

describe('분류 → 재원상태 매핑', () => {
  it('퇴원·휴원·재등원만 상태를 바꾼다', () => {
    expect(targetStatusFor('퇴원생 안내')).toBe('퇴원');
    expect(targetStatusFor('휴원 안내')).toBe('휴학');
    expect(targetStatusFor('재등원 안내')).toBe('재등원');
    expect(targetStatusFor('수강과목 변경')).toBeNull();
    expect(targetStatusFor('신규생 정보')).toBeNull();
    expect(changesStatus('기타')).toBe(false);
  });

  it('과목 변경은 학생은 필요하지만 상태는 바꾸지 않는다', () => {
    expect(needsStudent('수강과목 변경')).toBe(true);
    expect(changesStatus('수강과목 변경')).toBe(false);
    expect(needsStudent('시간표')).toBe(false);
  });
});

describe('학생 선택 목록', () => {
  it('퇴원 안내는 이미 퇴원한 학생을 빼고 보여준다', () => {
    expect(pickableStudents('퇴원생 안내', students).map(s => s.id)).toEqual(['a', 'b', 'd']);
  });
  it('재등원 안내는 퇴원·휴학생만 보여준다', () => {
    expect(pickableStudents('재등원 안내', students).map(s => s.id)).toEqual(['b', 'c']);
  });
  it('학생과 무관한 분류는 전체를 그대로 준다', () => {
    expect(pickableStudents('기타', students)).toHaveLength(4);
  });
});

describe('제목·라벨', () => {
  it('학교·학년이 있으면 괄호로 붙인다', () => {
    expect(studentLabel(students[0])).toBe('김민준 (신길고 고2)');
    expect(studentLabel(students[2])).toBe('박지우');
  });
  it('분류별 접두어로 제목을 만든다', () => {
    expect(buildTaskTitle('퇴원생 안내', students[0])).toBe('[퇴원] 김민준 (신길고 고2)');
    expect(buildTaskTitle('휴원 안내', students[1])).toBe('[휴원] 이서연 (신길중 중3)');
    expect(buildTaskTitle('재등원 안내', students[2])).toBe('[재등원] 박지우');
    expect(buildTaskTitle('수강과목 변경', null)).toBe('[과목변경] ');
    expect(buildTaskTitle('기타', students[0])).toBe('');
  });
});

describe('적용일 문구', () => {
  const today = '2026-09-29';
  it('오늘 이하면 즉시 반영 문구', () => {
    expect(syncPreviewText('퇴원생 안내', today, today)).toContain('바로');
    expect(syncPreviewText('퇴원생 안내', '', today)).toContain('바로');
    expect(syncPreviewText('퇴원생 안내', today, today)).toContain('반·시간표');
    expect(syncResultToast('퇴원생 안내', '김민준', today, today)).toBe("김민준 학생 재원상태가 '퇴원'으로 반영되었습니다");
  });
  it('미래면 예약 문구', () => {
    expect(syncPreviewText('휴원 안내', '2026-10-15', today)).toContain('2026-10-15에');
    expect(syncResultToast('휴원 안내', '이서연', '2026-10-15', today)).toContain('2026-10-15에');
  });
  it('재등원은 시간표 정리 안내가 없다', () => {
    expect(syncPreviewText('재등원 안내', today, today)).not.toContain('반·시간표');
  });
  it('상태를 바꾸지 않는 분류는 문구가 없다', () => {
    expect(syncPreviewText('수강과목 변경', today, today)).toBeNull();
    expect(syncResultToast('기타', '아무개', today, today)).toBeNull();
  });
  it('todayKst는 KST 날짜를 준다', () => {
    // 2026-09-29 23:30 UTC = 2026-09-30 08:30 KST
    expect(todayKst(new Date('2026-09-29T23:30:00Z'))).toBe('2026-09-30');
    expect(todayKst(new Date('2026-09-29T10:00:00Z'))).toBe('2026-09-29');
  });
});

describe('반영 배지', () => {
  it('학생 연결이 없거나 상태 변경 분류가 아니면 배지가 없다', () => {
    expect(syncBadge({ category: '퇴원생 안내', student_id: null, student_sync_status: null })).toBeNull();
    expect(syncBadge({ category: '기타', student_id: 'a', student_sync_status: 'applied' })).toBeNull();
  });
  it('상태별 라벨', () => {
    expect(syncBadge({ category: '퇴원생 안내', student_id: 'a', student_sync_status: 'applied' })).toEqual({ label: '학생 기록 반영됨', tone: 'success' });
    expect(syncBadge({ category: '휴원 안내', student_id: 'a', student_sync_status: 'scheduled', effective_date: '2026-10-15' })).toEqual({ label: '2026-10-15 반영 예정', tone: 'warning' });
    expect(syncBadge({ category: '재등원 안내', student_id: 'a', student_sync_status: 'no_change' })?.tone).toBe('muted');
    expect(syncBadge({ category: '퇴원생 안내', student_id: 'a', student_sync_status: null })?.label).toBe('반영 대기');
  });
});
