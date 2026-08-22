import { describe, it, expect } from 'vitest';
import { buildFindings, type DataQualityInput } from './dataQuality';

const base = (over: Partial<DataQualityInput> = {}): DataQualityInput => ({
  students: [], classes: [], schedules: [], classStudents: [], lessons: [],
  profiles: [], roles: [], subjectTeachers: [], homework: [], reports: [],
  lessonWindowDays: 30, reportWindowDays: 60, ...over,
});

const get = (input: DataQualityInput, id: string) => buildFindings(input).find((f) => f.id === id)!;

const sched = (class_id: string, over: Partial<DataQualityInput['schedules'][number]> = {}) => ({
  id: `s-${class_id}-${over.start_time || '1'}`, class_id, teacher_id: null,
  day_of_week: 1, start_time: '10:00:00', end_time: '11:00:00', is_active: true, ...over,
});

describe('buildFindings', () => {
  it('빈 입력이면 모든 항목이 0건', () => {
    const findings = buildFindings(base());
    expect(findings.every((f) => f.recordCount === 0)).toBe(true);
  });

  it('활성 반 담당 강사 없음만 잡고 보관 반은 제외', () => {
    const input = base({
      classes: [
        { id: 'c1', name: 'A', subject: '수학', teacher_id: null },
        { id: 'c2', name: 'B', subject: '수학', teacher_id: null },
      ],
      schedules: [sched('c1')],
    });
    expect(get(input, 'class_no_teacher').recordCount).toBe(1);
    expect(get(input, 'class_no_active_schedule').recordCount).toBe(1);
  });

  it('요일/시간 누락과 종료≤시작을 잡는다', () => {
    const input = base({
      classes: [{ id: 'c1', name: 'A', subject: '수학', teacher_id: 't1' }],
      schedules: [
        sched('c1', { start_time: '12:00:00', end_time: '11:00:00' }),
        sched('c1', { start_time: '13:00:00', day_of_week: null }),
        sched('c1', { start_time: '14:00:00', end_time: '15:00:00' }),
      ],
    });
    const f = get(input, 'schedule_invalid');
    expect(f.recordCount).toBe(2);
    expect(f.groupCount).toBe(1);
  });

  it('이름만 같고 과목/강사가 다르면 중복 오류가 아니라 참고로 분류', () => {
    const input = base({
      classes: [
        { id: 'c1', name: '고1B', subject: '수학', teacher_id: 't1' },
        { id: 'c2', name: '고1B', subject: '영어', teacher_id: 't2' },
      ],
      schedules: [sched('c1'), sched('c2')],
    });
    expect(get(input, 'class_duplicate_identical').recordCount).toBe(0);
    const info = get(input, 'class_duplicate_name_only');
    expect(info.severity).toBe('info');
    expect(info.recordCount).toBe(2);
  });

  it('표시명·과목·강사가 모두 같으면 확인 필요로 분류', () => {
    const input = base({
      classes: [
        { id: 'c1', name: '고1B', subject: '수학', teacher_id: 't1' },
        { id: 'c2', name: '고1B ', subject: '수학', teacher_id: 't1' },
      ],
      schedules: [sched('c1'), sched('c2')],
    });
    const f = get(input, 'class_duplicate_identical');
    expect(f.severity).toBe('check');
    expect(f.groupCount).toBe(1);
    expect(f.recordCount).toBe(2);
  });

  it('재원 학생만 활성 반 0개로 세고 퇴원생은 제외', () => {
    const input = base({
      students: [
        { id: 's1', enrollment_status: '재학' },
        { id: 's2', enrollment_status: '퇴원' },
        { id: 's3', enrollment_status: '재등원' },
      ],
      classes: [{ id: 'c1', name: 'A', subject: '수학', teacher_id: 't1' }],
      schedules: [sched('c1')],
      classStudents: [{ class_id: 'c1', student_id: 's3' }],
    });
    expect(get(input, 'student_no_active_class').recordCount).toBe(1);
    expect(get(input, 'withdrawn_in_active_class').recordCount).toBe(0);
  });

  it('반 미지정 수업일지는 미마감 건만 확인 필요로 센다', () => {
    const input = base({
      lessons: [
        { id: 'l1', lesson_date: '2026-08-20', class_id: null, teacher_id: 't1', student_id: 's1', submitted: false },
        { id: 'l2', lesson_date: '2026-08-20', class_id: null, teacher_id: 't1', student_id: 's1', submitted: true },
      ],
    });
    const f = get(input, 'lesson_no_class_unclosed');
    expect(f.recordCount).toBe(1);
    expect(f.groupCount).toBe(1);
  });

  it('현재 반 명단에 없는 재원 학생 기록만 잡는다', () => {
    const input = base({
      students: [
        { id: 's1', enrollment_status: '재학' },
        { id: 's2', enrollment_status: '퇴원' },
      ],
      classes: [{ id: 'c1', name: 'A', subject: '수학', teacher_id: 't1' }],
      schedules: [sched('c1')],
      lessons: [
        { id: 'l1', lesson_date: '2026-08-20', class_id: 'c1', teacher_id: 't1', student_id: 's1', submitted: true },
        { id: 'l2', lesson_date: '2026-08-20', class_id: 'c1', teacher_id: 't1', student_id: 's2', submitted: true },
      ],
    });
    expect(get(input, 'lesson_student_not_in_class').recordCount).toBe(1);
  });

  it('학생/강사 참조 누락 기록을 즉시 수정 필요로 분류', () => {
    const input = base({
      lessons: [
        { id: 'l1', lesson_date: '2026-08-20', class_id: 'c1', teacher_id: null, student_id: 's1', submitted: true },
      ],
    });
    const f = get(input, 'lesson_missing_ref');
    expect(f.severity).toBe('critical');
    expect(f.recordCount).toBe(1);
  });

  it('학생-반 중복 연결은 초과분만 센다', () => {
    const input = base({
      classes: [{ id: 'c1', name: 'A', subject: '수학', teacher_id: 't1' }],
      classStudents: [
        { class_id: 'c1', student_id: 's1' },
        { class_id: 'c1', student_id: 's1' },
        { class_id: 'c1', student_id: 's1' },
      ],
    });
    const f = get(input, 'class_student_duplicate');
    expect(f.groupCount).toBe(1);
    expect(f.recordCount).toBe(2);
  });

  it('역할/프로필 불일치를 유형별로 집계', () => {
    const input = base({
      profiles: [
        { id: 'p1', full_name: 'A', is_active: true },
        { id: 'p2', full_name: 'B', is_active: false },
      ],
      roles: [{ user_id: 'p2', role: 'teacher' }],
    });
    const f = get(input, 'user_role_mismatch');
    expect(f.recordCount).toBe(2);
    expect(f.groupCount).toBe(2);
  });

  it('개인정보(학생 식별값)를 샘플에 노출하지 않는다', () => {
    const input = base({
      students: [{ id: 's1', enrollment_status: '재학' }],
    });
    expect(get(input, 'student_no_active_class').samples).toEqual([]);
  });
});
