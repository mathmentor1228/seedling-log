// CONSULT-LOG-V1 — 상담 기록 순수 로직 (기존 team_notes 재사용, 새 테이블·새 저장 흐름 없음)
// 이 파일은 계산·검증만 한다. 실제 저장은 호출부에서 supabase insert 1회로 처리한다.

export const CONSULT_TARGETS = ['학생', '학부모', '기타'] as const;
export const CONSULT_METHODS = ['전화', '대면', '메신저', '기타'] as const;

export type ConsultTarget = (typeof CONSULT_TARGETS)[number];
export type ConsultMethod = (typeof CONSULT_METHODS)[number];

export const CONSULT_SENSITIVE_NOTICE =
  '전화번호·주소·진단명 등 민감정보와 메시지 원문은 적지 마세요. 상담 요지만 남깁니다.';

export const CONSULT_SUMMARY_MAX = 1000;

export interface ConsultDraft {
  studentId: string;
  /** datetime-local 값 (YYYY-MM-DDTHH:mm, KST 입력 기준) */
  consultedAt: string;
  target: ConsultTarget | '';
  method: ConsultMethod | '';
  summary: string;
  followUp: boolean;
  /** YYYY-MM-DD */
  followUpDate: string;
}

export function emptyConsultDraft(studentId: string, nowLocal: string): ConsultDraft {
  return {
    studentId,
    consultedAt: nowLocal,
    target: '',
    method: '',
    summary: '',
    followUp: false,
    followUpDate: '',
  };
}

export function isConsultDraftDirty(d: ConsultDraft): boolean {
  return !!(d.target || d.method || d.summary.trim() || d.followUp || d.followUpDate);
}

export type ConsultErrors = Partial<Record<'studentId' | 'consultedAt' | 'target' | 'method' | 'summary' | 'followUpDate', string>>;

export function validateConsultDraft(d: ConsultDraft, todayIso: string): ConsultErrors {
  const e: ConsultErrors = {};
  if (!d.studentId) e.studentId = '학생을 선택하세요.';
  if (!d.consultedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(d.consultedAt)) {
    e.consultedAt = '상담 일시를 입력하세요.';
  } else if (d.consultedAt.slice(0, 10) > todayIso) {
    e.consultedAt = '미래 시각은 입력할 수 없습니다.';
  }
  if (!d.target) e.target = '상담 대상을 선택하세요.';
  if (!d.method) e.method = '상담 방식을 선택하세요.';
  const summary = d.summary.trim();
  if (summary.length < 5) e.summary = '핵심 내용을 5자 이상 적어주세요.';
  else if (summary.length > CONSULT_SUMMARY_MAX) e.summary = `${CONSULT_SUMMARY_MAX}자 이내로 적어주세요.`;
  if (d.followUp) {
    if (!d.followUpDate) e.followUpDate = '후속조치 예정일을 입력하세요.';
    else if (d.followUpDate < d.consultedAt.slice(0, 10)) e.followUpDate = '예정일은 상담일 이후여야 합니다.';
  }
  return e;
}

/** 전화번호 등 민감정보로 보이는 패턴 (차단이 아니라 경고용) */
export function detectSensitive(text: string): string[] {
  const hits: string[] = [];
  if (/(\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4})/.test(text)) hits.push('전화번호로 보이는 숫자');
  if (/\d{6}[-\s]?\d{7}/.test(text)) hits.push('주민등록번호로 보이는 숫자');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) hits.push('이메일 주소');
  return hits;
}

export interface ConsultInsert {
  scope: 'student';
  student_id: string;
  target_role: 'teacher';
  status: 'open' | 'done';
  priority: 'normal';
  title: string;
  body: string;
  due_date: string | null;
  created_by: string;
  consult_target: string;
  consult_method: string;
  consulted_at: string;
}

export function consultTitle(target: string, method: string, dateIso: string): string {
  return `[상담] ${target}·${method} ${dateIso.slice(5, 10)}`;
}

/** datetime-local(KST 입력) → ISO(UTC) */
export function localKstToIso(local: string): string {
  return new Date(`${local.length === 16 ? local : local.slice(0, 16)}:00+09:00`).toISOString();
}

export function buildConsultInsert(d: ConsultDraft, createdBy: string): ConsultInsert {
  const dateIso = d.consultedAt.slice(0, 10);
  return {
    scope: 'student',
    student_id: d.studentId,
    target_role: 'teacher',
    status: d.followUp ? 'open' : 'done',
    priority: 'normal',
    title: consultTitle(d.target || '기타', d.method || '기타', dateIso),
    body: d.summary.trim(),
    due_date: d.followUp ? d.followUpDate : null,
    created_by: createdBy,
    consult_target: d.target || '기타',
    consult_method: d.method || '기타',
    consulted_at: localKstToIso(d.consultedAt),
  };
}

// ---------- 조회 측 ----------

export interface ConsultNote {
  id: string;
  created_at: string;
  consulted_at: string | null;
  consult_target: string | null;
  consult_method: string | null;
  title: string | null;
  body: string | null;
  status: string | null;
  due_date: string | null;
  created_by: string | null;
}

/** 상담 기록으로 볼 수 있는 행만 (consulted_at 이 있는 학생 메모) */
export function isConsultNote(n: { consulted_at?: string | null }): boolean {
  return !!n.consulted_at;
}

export function consultDate(n: ConsultNote): string {
  return (n.consulted_at || n.created_at || '').slice(0, 10);
}

export type FollowUpState = 'none' | 'done' | 'due' | 'overdue';

export function followUpState(n: ConsultNote, todayIso: string): FollowUpState {
  if (!n.due_date) return 'none';
  if (n.status === 'done') return 'done';
  return n.due_date < todayIso ? 'overdue' : 'due';
}

export interface ConsultSummary {
  total: number;
  lastDate: string | null;
  openFollowUps: number;
  overdue: number;
}

export function summarizeConsults(notes: ConsultNote[], todayIso: string): ConsultSummary {
  const sorted = sortConsults(notes);
  let openFollowUps = 0;
  let overdue = 0;
  for (const n of notes) {
    const st = followUpState(n, todayIso);
    if (st === 'due' || st === 'overdue') openFollowUps += 1;
    if (st === 'overdue') overdue += 1;
  }
  return {
    total: notes.length,
    lastDate: sorted.length ? consultDate(sorted[0]) : null,
    openFollowUps,
    overdue,
  };
}

export function sortConsults(notes: ConsultNote[]): ConsultNote[] {
  return [...notes].sort((a, b) => consultDate(b).localeCompare(consultDate(a)));
}

export function daysSince(dateIso: string | null, todayIso: string): number | null {
  if (!dateIso) return null;
  return Math.round(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${dateIso}T00:00:00Z`).getTime()) / 86400000
  );
}
