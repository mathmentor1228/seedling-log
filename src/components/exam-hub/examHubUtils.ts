// EXAM-HUB-A: 내신대비 통합 화면 공용 유틸 (설계: vault 19 — 내신대비 통합 개편안)
// 사이클(학교×학년×학기×시험종류) 하나를 기준으로 시험 정보·학생 결과·시험지 분석을 묶는다.
import { normalizeSchool, periodSortKey } from '@/components/exam-board/cycleUtils';

export type Cycle = {
  id: string; school_id: string | null; school_name: string; school_level: string; grade_year: number;
  academic_year: number; semester: string; exam_type: string; start_date: string | null; end_date: string | null;
  status: 'draft' | 'confirmed' | 'cancelled'; source: string; source_url: string | null; notes: string | null;
  /** PAST-CYCLES-V1: exam_cycles 행이 없는 지난 회차를 성적·시험지 기록에서 만든 가상 사이클. member_ids = 그 해 그 학교·학년이었던 학생 */
  virtual?: boolean; member_ids?: Set<string>;
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
  // EXAM-SHEET-SYNC-V1
  source?: string | null; sheet_teacher_name?: string | null; previous_score?: number | null; synced_at?: string | null;
  /** 시험 당시 학교(드라이브·노션 가져오기 때 기록). 비어 있으면 학생의 현재 학교로 본다 */
  school_name?: string | null;
};
export type ResultPdf = { id: string; result_id: string; storage_path: string; display_title: string; source: string | null; drive_file_name: string | null; drive_modified_at: string | null };
export type SheetSync = {
  id: string; kind: 'rows' | 'file'; spreadsheet_name: string | null; exam_year: number | null; exam_period: string | null; received_at: string;
  rows_total: number; rows_matched: number; unmatched: { row_no?: number; school?: string; grade?: string; name?: string; subject?: string; reason?: string; file?: string; warning?: boolean }[];
  files_total: number; files_matched: number; errors: unknown[];
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
/** EXAM-STUDENT-ANALYSIS-V1 */
export type StudentAnalysis = {
  id: string; result_id: string; student_id: string; subject: string; exam_year: number | null; exam_period: string | null;
  status: 'draft' | 'teacher_confirmed' | 'published'; wrong_count: number; total_items: number | null;
  final_text: string | null; academy_action_text: string | null; published_at: string | null; updated_at: string;
};
export type WrongReasonTag = { subject: string; code: string; label: string; sort_order: number };
export const ANALYSIS_STATUS_META: Record<StudentAnalysis['status'], { label: string; cls: string }> = {
  draft: { label: '초안', cls: 'bg-muted text-muted-foreground' },
  teacher_confirmed: { label: '교사 컨펌', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  published: { label: '공개됨', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
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
  if (c.member_ids) return c.member_ids.has(s.id);
  return normalizeSchool(s.school) === normalizeSchool(c.school_name) && s.grade_year === c.grade_year;
}

// ── PAST-CYCLES-V1: 지난 회차 가상 사이클 ───────────────────────────────
/** 학년도: 3월 시작 */
export function academicYearOf(today: string): number { const y = Number(today.slice(0, 4)); return Number(today.slice(5, 7)) >= 3 ? y : y - 1; }
function levelOf(level: string | null | undefined, school: string | null | undefined): '초' | '중' | '고' | null {
  const l = level || '';
  if (l.startsWith('초')) return '초'; if (l.startsWith('중')) return '중'; if (l.startsWith('고')) return '고';
  const n = normalizeSchool(school) || '';
  return n.endsWith('초') ? '초' : n.endsWith('중') ? '중' : n.endsWith('고') ? '고' : null;
}
/** 학생이 `year` 학년도에 몇 학년이었나 (초1=1 … 중1=7 … 고3=12 절대 학년으로 역산) */
export function gradeAt(s: StudentRow, year: number, today: string): { level: '초' | '중' | '고'; grade: number } | null {
  const lv = levelOf(s.school_level, s.school); if (!lv || !s.grade_year) return null;
  const abs = (lv === '초' ? 0 : lv === '중' ? 6 : 9) + s.grade_year - (academicYearOf(today) - year);
  if (abs < 1 || abs > 12) return null;
  return abs <= 6 ? { level: '초', grade: abs } : abs <= 9 ? { level: '중', grade: abs - 6 } : { level: '고', grade: abs - 9 };
}
/** 회차의 대략 종료일(카드 정렬·'지난 시험' 판정용). 실제 날짜는 모른다 */
const PERIOD_APPROX_END: Record<string, string> = { '1-a': '04-30', '1-b': '07-03', '2-a': '10-08', '2-b': '12-10' };
/**
 * exam_cycles 에 없는 (연도·회차·학교·학년) 조합을 결과 행에서 찾아 가상 사이클로 만든다.
 * 2025년 노션 시험지처럼 사이클 없이 들어온 기록을 '지난 시험' 카드로 보여주기 위함. 퇴원생도 member 에 들어간다.
 */
export function buildVirtualCycles(cycles: Cycle[], results: ExamResult[], allStudents: StudentRow[], today: string): Cycle[] {
  const byId = new Map(allStudents.map(s => [s.id, s]));
  const real = new Set(cycles.map(c => { const k = cycleKey(c); return `${k.year}|${k.period}|${normalizeSchool(c.school_name)}|${c.grade_year}`; }));
  const groups = new Map<string, { year: number; period: string; school: string; level: '초' | '중' | '고'; grade: number; members: Set<string> }>();
  for (const r of results) {
    if (r.exam_type === 'performance' || !r.exam_year || !r.exam_period || !/^[12]-[ab]$/.test(r.exam_period)) continue;
    if (r.exam_year >= academicYearOf(today)) continue; // 올해는 실제 사이클(자동 감시)로
    const s = byId.get(r.student_id); if (!s) continue;
    const g = gradeAt(s, r.exam_year, today); if (!g) continue;
    const nowLv = levelOf(s.school_level, s.school);
    let school: string | null = null;
    const rs = normalizeSchool(r.school_name); const rsLv = levelOf(null, rs);
    if (rs && rsLv === g.level) school = rs;            // 가져오기 때 적힌 그때 학교
    else if (nowLv === g.level) school = normalizeSchool(s.school); // 학교급이 같으면 지금 학교
    if (!school) continue;                                 // 중학교 시절 학교를 모르면 못 넣는다
    const key = `${r.exam_year}|${r.exam_period}|${school}|${g.grade}`;
    if (real.has(key)) continue;
    const grp = groups.get(key) || groups.set(key, { year: r.exam_year, period: r.exam_period, school, level: g.level, grade: g.grade, members: new Set() }).get(key)!;
    grp.members.add(s.id);
  }
  return [...groups.entries()].map(([key, g]) => ({
    id: `virt:${key}`, school_id: null, school_name: g.school, school_level: g.level === '초' ? '초등' : g.level === '중' ? '중등' : '고등', grade_year: g.grade,
    academic_year: g.year, semester: g.period.startsWith('2') ? '2학기' : '1학기', exam_type: g.period.endsWith('a') ? '중간고사' : '기말고사',
    start_date: `${g.year}-${PERIOD_APPROX_END[g.period]}`, end_date: `${g.year}-${PERIOD_APPROX_END[g.period]}`,
    status: 'confirmed' as const, source: 'record', source_url: null, notes: null, virtual: true, member_ids: g.members,
  }));
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

/**
 * 학생 개별 성적 기록 기준점 (원장 2026-10-10): 2026년 2학기 중간고사부터 전부 기록한다.
 * 그 이전 회차는 값이 없어도 '미입력'으로 잡지 않는다(과거 기록은 찾는 대로 채움).
 */
export const RESULT_TRACKING_SINCE = { year: 2026, period: '2-a' as const, label: '2026년 2학기 중간고사' };
export function isResultTracked(key: { year: number; period: string }): boolean {
  return periodKey(key.year, key.period, null) >= periodKey(RESULT_TRACKING_SINCE.year, RESULT_TRACKING_SINCE.period, null);
}

export type ResultStatus = 'done' | 'score_empty' | 'missing' | 'absent' | 'untracked';

export type StudentSubjectRow = {
  student: StudentRow;
  subject: string;
  teacherName: string | null;
  teacherId: string | null;
  result: ExamResult | null;
  previous: ExamResult | null;
  previousScore: number | null;   // 시트 '최근성적' 우선, 없으면 앱 기록
  pdf: ResultPdf | null;          // 드라이브에서 복사된 시험지
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
  /** EXAM-SHEET-SYNC-V1: 드라이브에서 복사된 시험지 */
  pdfs?: ResultPdf[];
}): StudentSubjectRow[] {
  const { cycle, key, students, classInfos, links, teachers, results, cycleSubjects, excludedStudentIds } = args;
  const pdfByResult = new Map((args.pdfs || []).map(p => [p.result_id, p]));
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

  // EXAM-SHEET-SYNC-V1: 시트/드라이브에서 들어온 결과는 수강 매핑이 없어도 행을 만든다 (담당은 시트 열로 표시)
  for (const r of results) {
    if (r.exam_year !== key.year || r.exam_period !== key.period || r.exam_type === 'performance') continue;
    if (!targets.some(t => t.id === r.student_id)) continue;
    if (!subjectsByStudent.has(r.student_id)) subjectsByStudent.set(r.student_id, new Map());
    const m = subjectsByStudent.get(r.student_id)!;
    if (!m.has(r.subject)) m.set(r.subject, null);
  }

  const rows: StudentSubjectRow[] = [];
  for (const s of targets) {
    const subj = subjectsByStudent.get(s.id);
    if (!subj) continue;
    for (const [subject, teacherId] of subj) {
      const hasResultHere = (resultsByStudent.get(s.id) || []).some(r => r.subject === subject && r.exam_year === key.year && r.exam_period === key.period);
      if (cycleSubjects.length > 0 && !cycleSubjects.includes(subject) && !hasResultHere) continue;
      const mine = (resultsByStudent.get(s.id) || []).filter(r => r.subject === subject && r.exam_type !== 'performance');
      const result = mine.find(r => r.exam_year === key.year && r.exam_period === key.period) || null;
      const curKey = periodSortKey(key.year, key.period, null);
      const previous = mine
        .filter(r => periodSortKey(r.exam_year, r.exam_period, null) < curKey && r.actual_score != null)
        .sort((a, b) => periodSortKey(b.exam_year, b.exam_period, b.exam_date) - periodSortKey(a.exam_year, a.exam_period, a.exam_date))[0] || null;
      const absent = !!result?.note && result.note.includes('미응시');
      const tracked = isResultTracked(key);
      const status: ResultStatus = absent ? 'absent'
        : !result ? (tracked ? 'missing' : 'untracked')
          : result.actual_score == null ? (tracked ? 'score_empty' : 'untracked') : 'done';
      const teacherName = (teacherId ? nameById.get(teacherId) : null) || result?.sheet_teacher_name || null;
      const previousScore = result?.previous_score ?? previous?.actual_score ?? null;
      rows.push({ student: s, subject, teacherName, teacherId, result, previous, previousScore, pdf: result ? pdfByResult.get(result.id) || null : null, status });
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
  untracked: { label: '기록 전', cls: 'bg-muted text-muted-foreground/70' },
};
