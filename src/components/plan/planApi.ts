// LESSON-PLAN-CORE-V1: plan_* 테이블 접근 헬퍼
// 생성 타입(types.ts)에 아직 plan_* 테이블이 없어 캐스팅으로 접근한다.
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type PlanTrack = {
  id: string; title: string; subject: string; textbook: string | null; created_at: string;
  created_by?: string | null; creator_name?: string | null;
};
export type PlanGoal = {
  id: string; track_id: string; order_index: number; title: string; pages: string | null;
};
export type GoalInput = { title: string; pages: string };

export type TeachingMode = 'lecture' | 'abc' | 'individual';
export type StudentType = 'A' | 'B' | 'C';
export type SessionRole = 'progress' | 'progress_quiz' | 'test_day';

export type DesignPayload = {
  track_id: string;
  class_id: string | null;
  teacher_id: string;
  title: string;
  teaching_mode: TeachingMode;
  type_concepts: Record<string, string>;
  angle_mode: 'manual' | 'ai' | 'off';
  check_methods: string[];
  check_cycle: string;
  cutline_default: number;
  cutline_by_type: Record<string, number>;
  fail_action: 'retest' | 'clinic' | 'homework';
  escalate_after: number;
  rhythm: Record<string, SessionRole>;   // {"1":"progress","4":"progress_quiz"}
  end_goal_id: string | null;
  target_date: string | null;
};

export type PlanDesignRow = DesignPayload & {
  id: string; status: string; created_at: string;
};

export async function fetchTracks(subject?: string): Promise<PlanTrack[]> {
  let q = db.from('plan_tracks').select('*').order('created_at', { ascending: false });
  if (subject) q = q.eq('subject', subject);
  const { data, error } = await q;
  if (error) throw error;
  const tracks = (data || []) as PlanTrack[];
  const creatorIds = Array.from(new Set(tracks.map(t => t.created_by).filter(Boolean))) as string[];
  if (creatorIds.length > 0) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', creatorIds);
    const nameMap = new Map<string, string>((profs || []).map((p: any) => [p.id, p.full_name]));
    tracks.forEach(t => { t.creator_name = t.created_by ? (nameMap.get(t.created_by) || null) : null; });
  }
  return tracks;
}

export async function fetchGoals(trackId: string): Promise<PlanGoal[]> {
  const { data, error } = await db.from('plan_goals')
    .select('*').eq('track_id', trackId).order('order_index');
  if (error) throw error;
  return data || [];
}

export async function createTrackWithGoals(
  title: string, subject: string, textbook: string, goals: GoalInput[], createdBy: string,
): Promise<{ track: PlanTrack; goals: PlanGoal[] }> {
  const { data: track, error: tErr } = await db.from('plan_tracks')
    .insert({ title, subject, textbook: textbook || null, created_by: createdBy })
    .select().single();
  if (tErr) throw tErr;
  const rows = goals.map((g, i) => ({
    track_id: track.id, order_index: i + 1, title: g.title.trim(), pages: g.pages.trim() || null,
  }));
  const { data: created, error: gErr } = await db.from('plan_goals').insert(rows).select();
  if (gErr) throw gErr;
  return { track, goals: created || [] };
}

export async function createDesign(
  payload: DesignPayload,
  students: { student_id: string; student_type: StudentType | null }[],
): Promise<string> {
  const { data: design, error: dErr } = await db.from('plan_designs')
    .insert({ ...payload, status: 'active' }).select().single();
  if (dErr) throw dErr;
  if (students.length > 0) {
    const rows = students.map(s => ({ design_id: design.id, ...s }));
    const { error: sErr } = await db.from('plan_students').insert(rows);
    if (sErr) throw sErr;
  }
  return design.id;
}

export async function fetchDesigns(): Promise<any[]> {
  const { data, error } = await db.from('plan_designs')
    .select('*, plan_tracks(title, subject, textbook)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchDesignStudents(designId: string): Promise<any[]> {
  const { data, error } = await db.from('plan_students').select('*').eq('design_id', designId);
  if (error) throw error;
  return data || [];
}

// PLAN-ROSTER-MID-JOIN-V1: 설계 명단 추가/제거/수정
export type AddStudentInput = {
  student_id: string;
  student_type: StudentType | null;
  start_goal_id: string | null;   // null = 처음부터
  joined_at: string | null;       // 'YYYY-MM-DD'
};
export async function addStudentsToDesign(designId: string, students: AddStudentInput[]): Promise<void> {
  if (!students.length) return;
  const rows = students.map(s => ({ design_id: designId, ...s }));
  const { error } = await db.from('plan_students')
    .upsert(rows, { onConflict: 'design_id,student_id' });
  if (error) throw error;
}
export async function removeStudentFromDesign(designId: string, studentId: string): Promise<void> {
  const { error } = await db.from('plan_students')
    .delete().eq('design_id', designId).eq('student_id', studentId);
  if (error) throw error;
}
export async function updateDesignStudent(
  designId: string, studentId: string,
  patch: Partial<Pick<AddStudentInput, 'student_type' | 'start_goal_id' | 'joined_at'>>,
): Promise<void> {
  const { error } = await db.from('plan_students')
    .update(patch).eq('design_id', designId).eq('student_id', studentId);
  if (error) throw error;
}

export type RosterStudent = { id: string; name: string; grade: string | null; type: 'A' | 'B' | 'C' | null };

// 여러 설계의 명단(이름 포함)을 한 번에 — design_id → 학생 배열
export async function fetchRostersFor(designIds: string[]): Promise<Record<string, RosterStudent[]>> {
  if (designIds.length === 0) return {};
  const { data: ps } = await db.from('plan_students')
    .select('design_id, student_id, student_type').in('design_id', designIds);
  const rows = (ps || []) as any[];
  const studentIds = Array.from(new Set(rows.map(r => r.student_id)));
  const { data: studs } = studentIds.length > 0
    ? await supabase.from('students').select('id, name, grade').in('id', studentIds)
    : { data: [] as any[] };
  const nameMap = new Map(((studs || []) as any[]).map((s: any) => [s.id, s]));
  const out: Record<string, RosterStudent[]> = {};
  for (const r of rows) {
    const s = nameMap.get(r.student_id);
    if (!s) continue;
    (out[r.design_id] ||= []).push({ id: s.id, name: s.name, grade: s.grade, type: r.student_type || null });
  }
  Object.values(out).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name, 'ko')));
  return out;
}

// 오늘 특강 세션이 있는 설계 id 집합 (materialize된 plan_sessions 기준)
export async function fetchTodayIntensiveDesignIds(todayStr: string): Promise<Set<string>> {
  const { data } = await db.from('plan_sessions')
    .select('design_id').eq('session_date', todayStr).not('intensive_id', 'is', null);
  return new Set(((data || []) as any[]).map((r: any) => r.design_id));
}

// 수업 시작 전 브리핑: 설계별 '오늘 확인할 것' 요약 (열린 큐 + 미흡 이력 + 학습신호 주의)
export type PlanBriefing = {
  retest: string[];   // 재시험 대상 학생명
  makeup: string[];   // 보충/재학습 대상 학생명
  weak: string[];     // 최근 확인에서 미흡(verified_weak)인 학생명
  flagged: string[];  // 학습신호 플래그(원장 에스컬레이션) 학생명
};
export async function fetchBriefings(designIds: string[]): Promise<Record<string, PlanBriefing>> {
  const out: Record<string, PlanBriefing> = {};
  if (designIds.length === 0) return out;
  designIds.forEach(id => { out[id] = { retest: [], makeup: [], weak: [], flagged: [] }; });

  const [qRes, pgRes, flRes] = await Promise.all([
    db.from('plan_queue').select('design_id, student_id, kind').in('design_id', designIds).eq('status', 'open'),
    db.from('plan_goal_progress').select('design_id, student_id, status').in('design_id', designIds).eq('status', 'verified_weak'),
    db.from('plan_flags').select('design_id, student_id, status').in('design_id', designIds).eq('status', 'open'),
  ]);
  const rows = [...(qRes.data || []), ...(pgRes.data || []), ...(flRes.data || [])] as any[];
  const sids = Array.from(new Set(rows.map(r => r.student_id)));
  const { data: studs } = sids.length > 0
    ? await supabase.from('students').select('id, name').in('id', sids)
    : { data: [] as any[] };
  const nameOf = new Map(((studs || []) as any[]).map((s: any) => [s.id, s.name]));
  const pushUniq = (arr: string[], n: string) => { if (n && !arr.includes(n)) arr.push(n); };

  ((qRes.data || []) as any[]).forEach(r => {
    const b = out[r.design_id]; const n = nameOf.get(r.student_id);
    if (r.kind === 'retest') pushUniq(b.retest, n); else pushUniq(b.makeup, n);
  });
  ((pgRes.data || []) as any[]).forEach(r => pushUniq(out[r.design_id].weak, nameOf.get(r.student_id)));
  ((flRes.data || []) as any[]).forEach(r => pushUniq(out[r.design_id].flagged, nameOf.get(r.student_id)));
  return out;
}

// PLANNER-PRINT-V1: 플래너 출력 이력 → 재출력 필요 판정
export type PrinterStatus = 'never' | 'outdated' | 'ok';
export async function fetchPlannerStatus(
  designs: { id: string; updated_at?: string | null }[], periodMonth: string,
): Promise<Record<string, PrinterStatus>> {
  const out: Record<string, PrinterStatus> = {};
  designs.forEach(d => { out[d.id] = 'never'; });
  if (designs.length === 0) return out;
  try {
    const { data } = await db.from('plan_planner_prints')
      .select('design_id, snapshot_updated_at')
      .in('design_id', designs.map(d => d.id))
      .eq('period_month', periodMonth);
    const printMap = new Map(((data || []) as any[]).map((r: any) => [r.design_id, r.snapshot_updated_at]));
    for (const d of designs) {
      if (!printMap.has(d.id)) { out[d.id] = 'never'; continue; }
      const snap = printMap.get(d.id);
      out[d.id] = (d.updated_at && snap && new Date(d.updated_at) > new Date(snap)) ? 'outdated' : 'ok';
    }
  } catch { /* 테이블 미생성 시 조용히 never 유지 */ }
  return out;
}
export async function markPlannerPrinted(designId: string, periodMonth: string, updatedAt: string | null, userId: string) {
  await db.from('plan_planner_prints').upsert({
    design_id: designId, period_month: periodMonth,
    printed_at: new Date().toISOString(), printed_by: userId, snapshot_updated_at: updatedAt,
  }, { onConflict: 'design_id,period_month' });
}

export const DAY_LABELS: Record<number, string> = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

export const ROLE_LABELS: Record<SessionRole, string> = {
  progress: '진도 수업',
  progress_quiz: '진도 + 쪽지시험',
  test_day: '테스트·복습 데이',
};

// 오늘~기한 사이, 리듬상 진도 나가는 요일의 수업 횟수
export function countProgressSessions(rhythm: Record<string, SessionRole>, targetDate: string | null): number {
  if (!targetDate) return 0;
  const progressDays = Object.entries(rhythm)
    .filter(([, role]) => role !== 'test_day')
    .map(([d]) => Number(d));
  if (progressDays.length === 0) return 0;
  let count = 0;
  const cur = new Date();
  const end = new Date(targetDate + 'T23:59:59');
  cur.setDate(cur.getDate() + 1); // 내일부터
  while (cur <= end && count < 500) {
    if (progressDays.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─────────── 특강 & 공동지도 확장 ───────────
export type PlanIntensive = {
  id: string; design_id: string; label: string;
  start_date: string; end_date: string;
  added_sessions: number;
  rhythm: Record<string, SessionRole>;
  scope: 'all' | 'subset';
  note: string | null;
  created_at: string;
};

export type PlanCoTeacher = {
  id: string; design_id: string; teacher_id: string;
  start_date: string; end_date: string;
  role_note: string | null; status: string;
  teacher_name?: string | null;
  created_at: string;
};

export type PlanSessionRow = {
  id: string; design_id: string; session_date: string;
  role: SessionRole; note: string | null; status: string;
  intensive_id: string | null;
  assigned_teacher_id: string | null;
  goal_id: string | null;
};

export async function fetchIntensives(designId: string): Promise<PlanIntensive[]> {
  const { data, error } = await db.from('plan_intensives')
    .select('*').eq('design_id', designId).order('start_date');
  if (error) throw error;
  return data || [];
}

export async function fetchCoTeachers(designId: string): Promise<PlanCoTeacher[]> {
  const { data, error } = await db.from('plan_co_teachers')
    .select('*').eq('design_id', designId).order('start_date');
  if (error) throw error;
  const rows = (data || []) as PlanCoTeacher[];
  const ids = Array.from(new Set(rows.map(r => r.teacher_id)));
  if (ids.length) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', ids);
    const map = new Map<string, string>((profs || []).map((p: any) => [p.id, p.full_name]));
    rows.forEach(r => { r.teacher_name = map.get(r.teacher_id) || null; });
  }
  return rows;
}

export async function createIntensive(payload: {
  design_id: string; label: string; start_date: string; end_date: string;
  added_sessions: number; rhythm: Record<string, SessionRole>;
  scope: 'all' | 'subset'; student_ids?: string[]; note?: string; created_by?: string;
}): Promise<string> {
  const { data, error } = await db.from('plan_intensives').insert({
    design_id: payload.design_id, label: payload.label,
    start_date: payload.start_date, end_date: payload.end_date,
    added_sessions: payload.added_sessions, rhythm: payload.rhythm,
    scope: payload.scope, note: payload.note ?? null, created_by: payload.created_by ?? null,
  }).select().single();
  if (error) throw error;
  const intensiveId = data.id;
  if (payload.scope === 'subset' && payload.student_ids?.length) {
    const rows = payload.student_ids.map(sid => ({ intensive_id: intensiveId, student_id: sid }));
    const { error: sErr } = await db.from('plan_intensive_students').insert(rows);
    if (sErr) throw sErr;
  }
  // 특강 기간 · 리듬으로 세션 자동 생성
  await materializeIntensiveSessions(payload.design_id, intensiveId, payload.start_date, payload.end_date, payload.rhythm);
  return intensiveId;
}

export async function deleteIntensive(id: string): Promise<void> {
  // 관련 세션의 intensive_id만 해제 (세션 자체는 유지)
  await db.from('plan_sessions').update({ intensive_id: null }).eq('intensive_id', id);
  const { error } = await db.from('plan_intensives').delete().eq('id', id);
  if (error) throw error;
}

async function materializeIntensiveSessions(
  designId: string, intensiveId: string,
  startDate: string, endDate: string,
  rhythm: Record<string, SessionRole>,
) {
  const days = Object.keys(rhythm).map(Number);
  if (!days.length) return;
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');
  const rows: any[] = [];
  while (cur <= end) {
    const dow = cur.getDay();
    if (days.includes(dow)) {
      const iso = cur.toISOString().slice(0, 10);
      rows.push({
        design_id: designId,
        session_date: iso,
        role: rhythm[String(dow)] || 'progress',
        intensive_id: intensiveId,
        status: 'draft',
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (rows.length) {
    // upsert: 이미 같은 날 세션이 있으면 intensive만 태깅
    await db.from('plan_sessions').upsert(rows, { onConflict: 'design_id,session_date' });
  }
}

export async function createCoTeacher(payload: {
  design_id: string; teacher_id: string;
  start_date: string; end_date: string;
  role_note?: string; created_by?: string;
}): Promise<string> {
  const { data, error } = await db.from('plan_co_teachers').insert({
    ...payload, role_note: payload.role_note ?? null,
  }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteCoTeacher(id: string): Promise<void> {
  const { error } = await db.from('plan_co_teachers').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchSessionsInRange(
  designId: string, startDate: string, endDate: string,
): Promise<PlanSessionRow[]> {
  const { data, error } = await db.from('plan_sessions').select('*')
    .eq('design_id', designId)
    .gte('session_date', startDate)
    .lte('session_date', endDate)
    .order('session_date');
  if (error) throw error;
  return data || [];
}

export async function assignSessionTeacher(sessionId: string, teacherId: string | null): Promise<void> {
  const { error } = await db.from('plan_sessions')
    .update({ assigned_teacher_id: teacherId }).eq('id', sessionId);
  if (error) throw error;
}

export async function assignSessionGoal(sessionId: string, goalId: string | null): Promise<void> {
  const { error } = await db.from('plan_sessions')
    .update({ goal_id: goalId }).eq('id', sessionId);
  if (error) throw error;
}

export async function fetchTeachers(): Promise<{ id: string; full_name: string }[]> {
  const { data: roles } = await db.from('user_roles').select('user_id').eq('role', 'teacher');
  const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
  if (!ids.length) return [];
  const { data: profs } = await db.from('profiles').select('id, full_name').in('id', ids);
  return (profs || []) as any;
}

