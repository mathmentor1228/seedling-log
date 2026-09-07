// LESSON-PERIOD-SUMMARY-V1 — 조회 기간 수업기록 개괄 요약 (순수 함수)
import { getAttendanceCategory, isAbsent, isUnrecorded } from '@/lib/attendance';

export interface SummaryLesson {
  id: string;
  student_id: string;
  student_name?: string | null;
  subject?: string | null;
  lesson_date: string;
  submitted?: boolean | null;
  attendance_status?: string[] | null;
  understanding_score?: number | null;
  homework_status?: string | null;
}

export interface StudentSummaryRow {
  studentId: string;
  studentName: string;
  subjects: string[];
  lessons: number;
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  unrecorded: number;
  /** 출결이 기록된 수업 기준 출석률(%) — 분모 0이면 null */
  attendanceRate: number | null;
  homeworkDone: number;
  homeworkPartial: number;
  homeworkNotDone: number;
  understandingAvg: number | null;
  unsubmitted: number;
  /** 특이사항 요약 문구 */
  flags: string[];
}

export interface PeriodSummary {
  totalLessons: number;
  studentCount: number;
  submitted: number;
  unsubmitted: number;
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  attendanceUnrecorded: number;
  attendanceRate: number | null;
  homeworkDone: number;
  homeworkPartial: number;
  homeworkNotDone: number;
  homeworkNone: number;
  understandingAvg: number | null;
  students: StudentSummaryRow[];
}

export function summarizeLessonPeriod(lessons: SummaryLesson[]): PeriodSummary {
  const byStudent = new Map<string, StudentSummaryRow & { undSum: number; undCount: number; attDenom: number }>();

  let present = 0, late = 0, earlyLeave = 0, absent = 0, attendanceUnrecorded = 0;
  let submitted = 0, unsubmitted = 0;
  let homeworkDone = 0, homeworkPartial = 0, homeworkNotDone = 0, homeworkNone = 0;
  let undSum = 0, undCount = 0, attDenom = 0, attHit = 0;

  for (const l of lessons) {
    const key = l.student_id || l.id;
    let row = byStudent.get(key);
    if (!row) {
      row = {
        studentId: key,
        studentName: l.student_name || '이름 없음',
        subjects: [],
        lessons: 0,
        present: 0, late: 0, earlyLeave: 0, absent: 0, unrecorded: 0,
        attendanceRate: null,
        homeworkDone: 0, homeworkPartial: 0, homeworkNotDone: 0,
        understandingAvg: null,
        unsubmitted: 0,
        flags: [],
        undSum: 0, undCount: 0, attDenom: 0,
      };
      byStudent.set(key, row);
    }
    row.lessons += 1;
    if (l.subject && !row.subjects.includes(l.subject)) row.subjects.push(l.subject);

    if (l.submitted) submitted += 1; else { unsubmitted += 1; row.unsubmitted += 1; }

    const statuses = l.attendance_status || [];
    if (isUnrecorded(statuses)) {
      attendanceUnrecorded += 1;
      row.unrecorded += 1;
    } else {
      attDenom += 1;
      row.attDenom += 1;
      const cats = statuses.map(getAttendanceCategory);
      const absentHere = isAbsent(statuses);
      if (absentHere) {
        absent += 1; row.absent += 1;
      } else {
        attHit += 1;
      }
      if (cats.includes('late')) { late += 1; row.late += 1; }
      if (cats.includes('early_leave')) { earlyLeave += 1; row.earlyLeave += 1; }
      if (!absentHere && cats.includes('present')) { present += 1; row.present += 1; }
    }

    switch (l.homework_status) {
      case 'completed': homeworkDone += 1; row.homeworkDone += 1; break;
      case 'partial': homeworkPartial += 1; row.homeworkPartial += 1; break;
      case 'not_done': homeworkNotDone += 1; row.homeworkNotDone += 1; break;
      case 'none_assigned': homeworkNone += 1; break;
      default: break;
    }

    if (typeof l.understanding_score === 'number') {
      undSum += l.understanding_score; undCount += 1;
      row.undSum += l.understanding_score; row.undCount += 1;
    }
  }

  const students = [...byStudent.values()].map((r) => {
    const attHitRow = r.attDenom - r.absent;
    r.attendanceRate = r.attDenom > 0 ? Math.round((attHitRow / r.attDenom) * 100) : null;
    r.understandingAvg = r.undCount > 0 ? Math.round((r.undSum / r.undCount) * 10) / 10 : null;
    const flags: string[] = [];
    if (r.absent > 0) flags.push(`결석 ${r.absent}`);
    if (r.late > 0) flags.push(`지각 ${r.late}`);
    if (r.earlyLeave > 0) flags.push(`조퇴 ${r.earlyLeave}`);
    if (r.homeworkNotDone > 0) flags.push(`숙제 미완 ${r.homeworkNotDone}`);
    if (r.unsubmitted > 0) flags.push(`미마감 ${r.unsubmitted}`);
    if (r.unrecorded > 0) flags.push(`출결 미기록 ${r.unrecorded}`);
    if (r.understandingAvg !== null && r.understandingAvg <= 2.5) flags.push(`이해도 낮음 ${r.understandingAvg}`);
    r.flags = flags;
    const { undSum: _a, undCount: _b, attDenom: _c, ...rest } = r;
    return rest as StudentSummaryRow;
  }).sort((a, b) => b.flags.length - a.flags.length || a.studentName.localeCompare(b.studentName));

  return {
    totalLessons: lessons.length,
    studentCount: byStudent.size,
    submitted, unsubmitted,
    present, late, earlyLeave, absent, attendanceUnrecorded,
    attendanceRate: attDenom > 0 ? Math.round((attHit / attDenom) * 100) : null,
    homeworkDone, homeworkPartial, homeworkNotDone, homeworkNone,
    understandingAvg: undCount > 0 ? Math.round((undSum / undCount) * 10) / 10 : null,
    students,
  };
}
