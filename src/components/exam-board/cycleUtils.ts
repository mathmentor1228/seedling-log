// EXAM-CYCLE-V1: 시험 사이클 감지 유틸
// 시험 일정이 3곳(school_exam_archives / school_schedules / academy_events)에 흩어져 있어
// 반드시 병합해서 봐야 한다. (academy_events 누락이 "기말 봤는데 입력란에 안 뜸" 버그의 원인)

export type CycleExam = {
  school: string;          // 정규화된 학교명
  title: string;           // 예: "1학기 기말고사"
  start: string;           // yyyy-MM-dd
  end: string;             // yyyy-MM-dd (없으면 start)
  year: number;            // exam_year
  semester: '1' | '2';
  examType: 'midterm' | 'final';
  period: string;          // exam_period: "1-a" | "1-b" | "2-a" | "2-b"
};

export const SUBJECT_COLORS: Record<string, string> = {
  수학: 'hsl(217 91% 60%)',
  영어: 'hsl(142 71% 45%)',
  국어: 'hsl(271 76% 53%)',
  과학: 'hsl(25 95% 53%)',
  사회: 'hsl(0 84% 60%)',
};
export const DEFAULT_LINE_COLOR = 'hsl(217 91% 60%)';

// 학교명 정규화 (useExamArchiveData와 동일 규칙 — 신길초등학교 ↔ 신길초)
export function normalizeSchool(name: string | null | undefined): string {
  if (!name) return '';
  const compact = name.trim().replace(/\s+/g, '');
  for (const [suffix, rep] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']] as const) {
    if (compact.endsWith(suffix)) return compact.slice(0, -suffix.length) + rep;
  }
  return compact;
}

function schoolAliases(name: string): string[] {
  const n = normalizeSchool(name);
  const set = new Set([n]);
  if (n.endsWith('초')) set.add(`${n.slice(0, -1)}초등학교`);
  if (n.endsWith('중')) set.add(`${n.slice(0, -1)}중학교`);
  if (n.endsWith('고')) set.add(`${n.slice(0, -1)}고등학교`);
  return Array.from(set);
}

export function matchesSchoolTitle(title: string, schoolName: string): boolean {
  const compact = title.replace(/\s+/g, '');
  return schoolAliases(schoolName).some(a => compact.includes(a));
}

export function periodLabel(year: number | null, period: string | null, examType: string) {
  if (!year && !period) return examType === 'performance' ? '수행' : examType;
  const sem = period?.startsWith('2') ? '2학기' : '1학기';
  const mf = period?.endsWith('a') ? '중간' : period?.endsWith('b') ? '기말' : '';
  const base = `${year ? String(year).slice(2) + '년 ' : ''}${sem} ${mf}`.trim();
  return examType === 'performance' ? `${base} 수행` : base;
}

// 시험 당시 학년 계산 (현재 중3이 작년에 본 시험 → 2학년)
export function gradeAtExam(currentGradeYear: number | null, examYear: number | null, currentYear: number): number | null {
  if (!currentGradeYear || !examYear) return null;
  const g = currentGradeYear - (currentYear - examYear);
  return g >= 1 && g <= 6 ? g : null;
}

// 사용자 표준 표기: "1학년 1학기 중간고사" (띄어쓰기 포함)
export function examResultLabel(
  r: { exam_year: number | null; exam_period: string | null; exam_type: string },
  currentGradeYear: number | null,
  currentYear: number,
): string {
  const sem = r.exam_period?.startsWith('2') ? '2학기' : r.exam_period?.startsWith('1') ? '1학기' : null;
  const type = r.exam_type === 'midterm' ? '중간고사'
    : r.exam_type === 'final' ? '기말고사'
    : r.exam_type === 'performance' ? '수행평가' : '기타';
  const grade = gradeAtExam(currentGradeYear, r.exam_year, currentYear);
  const parts = [
    grade ? `${grade}학년` : (r.exam_year ? `${r.exam_year}년` : null),
    sem,
    type,
  ].filter(Boolean);
  return parts.join(' ') || type;
}

// 시험 자체의 표기: "1학기 기말고사"
export function examTitleLabel(exam: { semester: '1' | '2'; examType: 'midterm' | 'final' }): string {
  return `${exam.semester}학기 ${exam.examType === 'midterm' ? '중간고사' : '기말고사'}`;
}

export function periodSortKey(year: number | null, period: string | null, examDate: string | null) {
  const m: Record<string, number> = { '1-a': 1, '1-b': 2, '2-a': 3, '2-b': 4 };
  const base = (year ?? 0) * 10 + (period ? m[period] ?? 0 : 0);
  return base * 100000 + (examDate ? parseInt(examDate.replace(/-/g, '').slice(2), 10) % 100000 : 0);
}

// 제목·필드·날짜에서 중간/기말과 학기를 판별
function parseExamMeta(
  title: string,
  dateStr: string,
  semesterField?: string | null,
  examTypeField?: string | null,
): { semester: '1' | '2'; examType: 'midterm' | 'final' } {
  const month = Number(dateStr.slice(5, 7));
  let semester: '1' | '2' | null = null;
  if (semesterField?.includes('1')) semester = '1';
  else if (semesterField?.includes('2')) semester = '2';
  else if (title.includes('1학기')) semester = '1';
  else if (title.includes('2학기')) semester = '2';
  if (!semester) semester = month >= 8 || month <= 1 ? '2' : '1';

  let examType: 'midterm' | 'final' | null = null;
  const typeSrc = `${examTypeField || ''} ${title}`;
  if (typeSrc.includes('중간')) examType = 'midterm';
  else if (typeSrc.includes('기말')) examType = 'final';
  if (!examType) examType = [3, 4, 9, 10].includes(month) ? 'midterm' : 'final';

  return { semester, examType };
}

type DetectInput = {
  archives: { school_name: string; semester: string | null; exam_type: string | null; exam_date_start: string | null; exam_date_end: string | null }[];
  schedules: { school_name: string; schedule_type: string; title: string; start_date: string | null; end_date: string | null }[];
  events: { title: string | null; start_at: string | null; end_at: string | null }[];
  schoolNames: string[]; // 정규화된 학교명 (담당 학생 기준)
};

// 3개 소스를 병합해 학교별 시험 목록 생성. (학교, 연도, period) 단위로 중복 제거.
export function detectCycleExams({ archives, schedules, events, schoolNames }: DetectInput): Map<string, CycleExam[]> {
  const bySchool = new Map<string, Map<string, CycleExam>>();
  const put = (school: string, title: string, start: string, end: string | null,
    semesterField?: string | null, examTypeField?: string | null) => {
    if (!start) return;
    const { semester, examType } = parseExamMeta(title, start, semesterField, examTypeField);
    const year = Number(start.slice(0, 4));
    const period = `${semester}-${examType === 'midterm' ? 'a' : 'b'}`;
    const key = `${year}|${period}`;
    if (!bySchool.has(school)) bySchool.set(school, new Map());
    const slot = bySchool.get(school)!;
    const existing = slot.get(key);
    const entry: CycleExam = {
      school,
      title: title || `${semester}학기 ${examType === 'midterm' ? '중간' : '기말'}고사`,
      start,
      end: end || start,
      year, semester, examType, period,
    };
    // 아카이브(범위·기간 명시) > 일정 > 캘린더 순으로 먼저 넣은 쪽 유지하되, 기간이 더 넓으면 갱신
    if (!existing) slot.set(key, entry);
    else {
      if (entry.start < existing.start) existing.start = entry.start;
      if (entry.end > existing.end) existing.end = entry.end;
    }
  };

  for (const a of archives) {
    if (!a.exam_date_start) continue;
    const school = normalizeSchool(a.school_name);
    put(school, `${a.semester || ''} ${a.exam_type || ''}`.trim(), a.exam_date_start, a.exam_date_end, a.semester, a.exam_type);
  }
  for (const s of schedules) {
    if (s.schedule_type !== 'exam' || !s.start_date) continue;
    put(normalizeSchool(s.school_name), s.title, s.start_date, s.end_date);
  }
  for (const ev of events) {
    if (!ev.title || !ev.start_at) continue;
    for (const school of schoolNames) {
      if (!matchesSchoolTitle(ev.title, school)) continue;
      put(school, ev.title, ev.start_at.slice(0, 10), ev.end_at ? ev.end_at.slice(0, 10) : null);
    }
  }

  const out = new Map<string, CycleExam[]>();
  bySchool.forEach((m, school) => {
    out.set(school, Array.from(m.values()).sort((a, b) => a.start.localeCompare(b.start)));
  });
  return out;
}
