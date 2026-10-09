// EXAM-HUB-A: 내신대비 통합 화면 공용 유틸 (설계: vault 19 — 내신대비 통합 개편안)
// 사이클(학교×학년×학기×시험종류) 하나를 기준으로 시험 정보·학생 결과·시험지 분석을 묶는다.
import { normalizeSchool, periodSortKey } from '@/components/exam-board/cycleUtils';

export type Cycle = {
  id: string; school_id: string | null; school_name: string; school_level: string; grade_year: number;
  academic_year: number; semester: string; exam_type: string; start_date: string | null; end_date: string | null;
  status: 'draft' | 'confirmed' | 'cancelled'; source: string; source_url: string | null; notes: string | null;
};
export type CycleSubject = {
  id: string; cycle_id: string; subject: string; exam_date: string | null; period: number | null; exam_time: string | null;
  scope: string | null; source: string; source_url: string | null; notes: string | null;
};
export type StudentRow = {
  id: string; name: string; grade: string | null; school: string | null; school_level: string | null; grade_year: number | null;
  enrollment_status: string;
};
export type ClassInfo = { student_id: string; subject: string; teacher_id: string | null };
export type SubjectTeacherLink = { student_id: string; subject: string; teacher_id: string };
export type Teacher = { id: string; full_name: string };
export type ExamResult = {
  id: string; student_id: string; subject: string; exam_type: string; exam_year: number | null; exam_period: string | null;
  actual_score: number | null; expected_score: number | null; exam_date: string | null; submitted_at: string | null;
  note: string | null; review_status: string | null;
};
export type ReportRow = {
  id: string; school_name: string; grade: string; subject: string; exam_year: number; exam_period: string; exam_type: string;
  is_published: boolean; published_at: string | null; original_pdf_path: string | null; answer_pdf_path: string | null;
  exam_difficulty: string | null; avg_score: number | null; card_image_paths: unknown; updated_at: string | null;
  created_by_name: string | null;
};
export type DeepReportRow = { id: string; analysis_report_id: string; status: string; teacher_notes: string | null; published_at: string | null };
export type ReportItemCount = { report_id: string; count: number };
export type TextbookRow = { school_name: string; grade: number | null; subject: string; publisher: string | null; textbook_name: string | null; year: number | null };
export type WatchPost = {
  id: string; school_id: string | null; school_name: string; board_name: string | null; title: string; posted_on: string | null;
  post_url: string | null; attachments: { name: string; url: string }[]; matched_keywords: string[];
  status: 'new' | 'extracted' | 'applied' | 'ignored' | string; extracted: any | null; cycle_id: string | null; created_at: string;
};
/** EXAM-PARTICIPANTS-V1: 사이클별 응시 여부. 행 없음 = 응시 */
export type Participant = { cycle_id: string; student_id: string; status: 'taking' | 'not_taking'; reason: string | null; decided_at: string };
export type ParticipantView = 'taking' | 'not_taking' | 'confirm';

export type ArchiveRow = {
  school_name: string; grade_year: number; academic_year: number; semester: string; exam_type: string; subject: string;
  performance_assessment_info: string | null; textbook_publisher: string | null; exam_scope: string | null; status: string;
};

/** 사이클의 exam_year / exam_period 키 — 드라이브 파일명 `2026-2-a …` 와 동일 체계 */
export function cycleKey(c: Cycle): { year: number; period: string; examType: 'midterm' | 'final' } {
  const sem = c.semester.includes('2') ? '2' : '1';
  const examType: 'midterm' | 'final' = c.exam_type.includes('중간') ? 'midterm' : 'final';
  const year = c.academic_year || (c.start_date ? Number(c.start_date.slice(0, 4)) : new Date().getFullYear());
  return { year, period: `${sem}-${examType === 'midterm' ? 'a' : 'b'}`, examType };
}

export function cycleTitle(c: Cycle): string {
  return `${c.school_name} ${gradeLabel(c)} · ${c.semester} ${c.exam_type}`;
}
export function gradeLabel(c: Pick<Cycle, 'school_level' | 'grade_year'>): string {
  const lv = c.school_level?.startsWith('초') ? '초' : c.school_level?.startsWith('중') ? '중' : c.school_level?.startsWith('고') ? '고' : '';
  return `${lv}${c.grade_year}`;
}

/** 학생이 이 사이클 대상인가: 학교 정규화 + 학년 일치 */
export function studentInCycle(s: StudentRow, c: Cycle): boolean {
  return normalizeSchool(s.school) === normalizeSchool(c.school_name) && s.grade_year === c.grade_year;
}

/**
 * 응시가 애매한 이유 (하나라도 있으면 원장/선생님이 위에서 확정). 비어 있으면 그냥 '응시'.
 *  - 최근 21일 마감 일지 없음 (장기 결석·휴원 전조)
 *  - 학원 수강 과목이 연결돼 있지 않음 (반 배정도 담당 매핑도 없음)
 *  - 직전 시험에서 미응시로 처리됨
 */
export function ambiguityReasons(args: {
  student: StudentRow; cycle: Cycle; recentActiveIds: Set<string>; hasSubjects: boolean;
  priorNotTaking: boolean;
}): string[] {
  const r: string[] = [];
  if (!args.recentActiveIds.has(args.student.id)) r.push('최근 21일 수업 기록 없음');
  if (!args.hasSubjects) r.push('수강 과목 연결 없음');
  if (args.priorNotTaking) r.push('직전 시험 미응시');
  return r;
}

/** 시험 회차 라벨 — 결과 테이블의 표기가 섞여 있어(1-a / 1학기 / None) 정규화해서 보여준다 */
export function periodLabel(year: number | null, period: string | null, examType: string | null): string {
  const y = year ? `${String(year).slice(2)}년` : '연도 미상';
  const sem = period ? (period.includes('2') ? '2학기' : '1학기') : '';
  const half = period && /-[ab]$/.test(period) ? (period.endsWith('a') ? '중간' : '기말')
    : examType === 'midterm' || examType === '중간고사' ? '중간' : examType === 'final' || examType === '기말고사' ? '기말' : '';
  return [y, sem, half].filter(Boolean).join(' ') || '회차 미상';
}
export function periodKey(year: number | null, period: string | null, examType: string | null): number {
  const y = year || 0;
  const sem = period ? (period.includes('2') ? 2 : 1) : 0;
  const half = period && /-[ab]$/.test(period) ? (period.endsWith('a') ? 1 : 2)
    : examType === 'midterm' || examType === '중간고사' ? 1 : examType === 'final' || examType === '기말고사' ? 2 : 0;
  return y * 100 + sem * 10 + half;
}

/**
 * 분석보고서가 이 사이클 것인가.
 * 실측(2026-10-10): grade는 '1'/'2'/'3' 텍스트, exam_period는 '1학기'/'2학기', exam_type은 '중간고사'/'기말고사'.
 * 옛 설계('1-a' 키, 'midterm')도 함께 받는다.
 */
export function reportInCycle(r: ReportRow, c: Cycle, key: { year: number; period: string; examType: 'midterm' | 'final' }): boolean {
  if (normalizeSchool(r.school_name) !== normalizeSchool(c.school_name)) return false;
  if (Number(r.exam_year) !== key.year) return false;
  const sem = key.period.startsWith('2') ? '2' : '1';
  const p = String(r.exam_period || '').replace(/\s+/g, '');
  const periodOk = p === key.period || p.startsWith(sem) || p.includes(`${sem}학기`);
  if (!periodOk) return false;
  const t = String(r.exam_type || '');
  const typeOk = !t || (key.examType === 'midterm' ? /중간|midterm|1차/.test(t) : /기말|final|2차/.test(t))
    || (p === key.period); // 옛 키('1-a')가 맞으면 유형 검사 생략
  if (!typeOk) return false;
  const g = String(r.grade || '').replace(/\s+/g, '');
  return g === gradeLabel(c) || g === `${c.grade_year}` || g === `${c.grade_year}학년` || g.endsWith(`${c.grade_year}`);
}

export type DdayState = { kind: 'before'; days: number } | { kind: 'during' } | { kind: 'after'; days: number } | { kind: 'unknown' };
export function ddayState(c: Cycle, today: string): DdayState {
  if (!c.start_date) return { kind: 'unknown' };
  const end = c.end_date || c.start_date;
  const diff = (a: string, b: string) => Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000);
  if (today < c.start_date) return { kind: 'before', days: diff(c.start_date, today) };
  if (today > end) return { kind: 'after', days: diff(today, end) };
  return { kind: 'during' };
}
export function ddayLabel(st: DdayState): string {
  if (st.kind === 'before') return st.days === 0 ? 'D-Day' : `D-${st.days}`;
  if (st.kind === 'during') return '시험 중';
  if (st.kind === 'after') return st.days === 0 ? '오늘 종료' : `종료 +${st.days}일`;
  return '날짜 미정';
}

export type ResultStatus = 'done' | 'score_empty' | 'missing' | 'absent';

export type StudentSubjectRow = {
  student: StudentRow;
  subject: string;
  teacherName: string | null;
  teacherId: string | null;
  result: ExamResult | null;
  previous: ExamResult | null;
  status: ResultStatus;
};

/**
 * 사이클 대상 학생 × 학원 수강 과목 행을 만든다 (vault 19 §15 누락 표시의 근거).
 * 과목 출처: student_subject_teachers(우선) ∪ class_students→classes.subject. 사이클에 과목 목록이 있으면 그 과목만.
 */
export function buildStudentSubjectRows(args: {
  cycle: Cycle; key: { year: number; period: string; examType: string };
  students: StudentRow[]; classInfos: ClassInfo[]; links: SubjectTeacherLink[]; teachers: Teacher[];
  results: ExamResult[]; cycleSubjects: string[];
  /** EXAM-PARTICIPANTS-V1: 미응시로 확정된 학생은 행을 만들지 않는다 */
  excludedStudentIds?: Set<string>;
}): StudentSubjectRow[] {
  const { cycle, key, students, classInfos, links, teachers, results, cycleSubjects, excludedStudentIds } = args;
  const nameById = new Map(teachers.map(t => [t.id, t.full_name]));
  const targets = students.filter(s => studentInCycle(s, cycle) && !(excludedStudentIds?.has(s.id)));
  const subjectsByStudent = new Map<string, Map<string, string | null>>(); // subject -> teacherId
  const put = (sid: string, subject: string, tid: string | null, override: boolean) => {
    if (!subject) return;
    if (!subjectsByStudent.has(sid)) subjectsByStudent.set(sid, new Map());
    const m = subjectsByStudent.get(sid)!;
    if (override || !m.has(subject) || !m.get(subject)) m.set(subject, tid);
  };
  classInfos.forEach(ci => put(ci.student_id, ci.subject, ci.teacher_id, false));
  links.forEach(l => put(l.student_id, l.subject, l.teacher_id, true));

  const resultsByStudent = new Map<string, ExamResult[]>();
  results.forEach(r => { (resultsByStudent.get(r.student_id) || resultsByStudent.set(r.student_id, []).get(r.student_id))!.push(r); });

  const rows: StudentSubjectRow[] = [];
  for (const s of targets) {
    const subj = subjectsByStudent.get(s.id);
    if (!subj) continue;
    for (const [subject, teacherId] of subj) {
      if (cycleSubjects.length > 0 && !cycleSubjects.includes(subject)) continue;
      const mine = (resultsByStudent.get(s.id) || []).filter(r => r.subject === subject && r.exam_type !== 'performance');
      const result = mine.find(r => r.exam_year === key.year && r.exam_period === key.period) || null;
      const curKey = periodSortKey(key.year, key.period, null);
      const previous = mine
        .filter(r => periodSortKey(r.exam_year, r.exam_period, null) < curKey && r.actual_score != null)
        .sort((a, b) => periodSortKey(b.exam_year, b.exam_period, b.exam_date) - periodSortKey(a.exam_year, a.exam_period, a.exam_date))[0] || null;
      const absent = !!result?.note && result.note.includes('미응시');
      const status: ResultStatus = absent ? 'absent' : !result ? 'missing' : result.actual_score == null ? 'score_empty' : 'done';
      rows.push({ student: s, subject, teacherName: teacherId ? nameById.get(teacherId) || null : null, teacherId, result, previous, status });
    }
  }
  rows.sort((a, b) => a.subject.localeCompare(b.subject, 'ko') || (a.teacherName || '').localeCompare(b.teacherName || '', 'ko') || a.student.name.localeCompare(b.student.name, 'ko'));
  return rows;
}

export const STATUS_META: Record<ResultStatus, { label: string; cls: string }> = {
  done: { label: '입력됨', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  score_empty: { label: '점수 비어 있음', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  missing: { label: '미입력', cls: 'bg-muted text-muted-foreground' },
  absent: { label: '미응시', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};
