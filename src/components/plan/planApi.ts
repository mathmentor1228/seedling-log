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
export type GoalInput = { id?: string; title: string; pages: string };

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

// PLAN-TRACK-EDIT-V1: 기존 트랙의 목표를 통째로 동기화 (수정/추가/삭제/순서변경)
// goals: 편집된 순서대로. id 있으면 기존 목표, 없으면 신규. 목록에서 빠진 기존 목표는 삭제 시도.
export async function updateTrackGoals(
  trackId: string, title: string, textbook: string,
  goals: { id?: string; title: string; pages: string }[],
): Promise<{ deletedBlocked: number }> {
  // 1) 트랙 메타 갱신
  await db.from('plan_tracks').update({ title: title.trim(), textbook: textbook || null }).eq('id', trackId);

  const existing = await fetchGoals(trackId);
  const keepIds = new Set(goals.filter(g => g.id).map(g => g.id));
  const toDelete = existing.filter(g => !keepIds.has(g.id));

  // 2) 삭제 — 진도(plan_goal_progress) 참조 있는 목표는 못 지움(FK) → 건너뛰고 카운트
  let deletedBlocked = 0;
  for (const g of toDelete) {
    const { error } = await db.from('plan_goals').delete().eq('id', g.id);
    if (error) deletedBlocked++;
  }

  // 3) 순서대로 upsert (기존=update, 신규=insert)
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const row = { track_id: trackId, order_index: i + 1, title: g.title.trim(), pages: g.pages.trim() || null };
    if (g.id) {
      await db.from('plan_goals').update(row).eq('id', g.id);
    } else {
      await db.from('plan_goals').insert(row);
    }
  }
  return { deletedBlocked };
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
  students: {
    student_id: string;
    student_type: StudentType | null;
    start_goal_id?: string | null;
    joined_at?: string | null;
  }[],
): Promise<string> {
  const { data: design, error: dErr } = await db.from('plan_designs')
    .insert({ ...payload, status: 'active' }).select().single();
  if (dErr) throw dErr;
  if (students.length > 0) {
    const rows = students.map(s => ({
      design_id: design.id,
      student_id: s.student_id,
      student_type: s.student_type,
      start_goal_id: s.start_goal_id ?? null,
      joined_at: s.joined_at ?? null,
    }));
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

// PLAN-PROGRESS-VIZ-V1: 설계별 커리큘럼 진행 위치 (어디쯤 왔나)
export type PlanProgress = {
  total: number;          // 끝점까지 목표 수
  done: number;           // 나간(진행/확인) 목표 수
  currentIdx: number;     // 그룹 현재 위치 (0-based, -1=시작 전)
  currentTitle: string | null;  // 지금 나가는 중인/다음 목표
  perStudent: { studentId: string; done: number }[]; // 학생별 나간 수 (편차 표시용)
};
export async function fetchTrackProgress(
  designs: { id: string; track_id: string; end_goal_id?: string | null }[],
): Promise<Record<string, PlanProgress>> {
  const out: Record<string, PlanProgress> = {};
  if (designs.length === 0) return out;
  const trackIds = Array.from(new Set(designs.map(d => d.track_id)));
  const designIds = designs.map(d => d.id);
  const [goalsRes, progRes] = await Promise.all([
    db.from('plan_goals').select('id, track_id, order_index, title').in('track_id', trackIds).order('order_index'),
    db.from('plan_goal_progress').select('design_id, student_id, goal_id, status').in('design_id', designIds),
  ]);
  const goalsByTrack = new Map<string, any[]>();
  ((goalsRes.data || []) as any[]).forEach(g => { (goalsByTrack.get(g.track_id) || goalsByTrack.set(g.track_id, []).get(g.track_id))!.push(g); });
  // 완료로 치는 상태 vs 위치에만 반영하는 상태를 분리.
  // partial(일부만)은 위치엔 포함하되 완료가 아니다 — 다 안 나갔는데 "지금: 다음 목표"로 표시되던 버그 수정.
  const FULL = new Set(['advanced', 'verified_ok', 'verified_weak']);
  const progByDesign = new Map<string, any[]>();
  ((progRes.data || []) as any[]).forEach(p => { (progByDesign.get(p.design_id) || progByDesign.set(p.design_id, []).get(p.design_id))!.push(p); });

  for (const d of designs) {
    const allGoals = (goalsByTrack.get(d.track_id) || []);
    const endIdx = d.end_goal_id ? allGoals.findIndex(g => g.id === d.end_goal_id) : allGoals.length - 1;
    const trackGoals = allGoals.slice(0, (endIdx >= 0 ? endIdx : allGoals.length - 1) + 1);
    const total = trackGoals.length;
    const prog = progByDesign.get(d.id) || [];
    const fullGoalIds = new Set(prog.filter(p => FULL.has(p.status)).map(p => p.goal_id));
    const partialGoalIds = new Set(prog.filter(p => p.status === 'partial').map(p => p.goal_id));
    // 그룹 현재 위치 = 나간(완료 또는 일부) 목표 중 가장 뒤 index
    let currentIdx = -1;
    trackGoals.forEach((g, i) => { if (fullGoalIds.has(g.id) || partialGoalIds.has(g.id)) currentIdx = i; });
    const done = trackGoals.filter(g => fullGoalIds.has(g.id)).length;
    // 현재 위치가 '일부만'이면 그 목표를 이어서 — 아니면 다음 목표
    const curGoal = currentIdx >= 0 ? trackGoals[currentIdx] : null;
    const curIsPartial = curGoal ? (!fullGoalIds.has(curGoal.id) && partialGoalIds.has(curGoal.id)) : false;
    const currentTitle = currentIdx >= 0 && currentIdx < trackGoals.length
      ? (curIsPartial
        ? `${curGoal!.title} — 이어서`
        : trackGoals[Math.min(currentIdx + 1, trackGoals.length - 1)]?.title || curGoal?.title)
      : (trackGoals[0]?.title || null);
    // 학생별 나간 수 (편차) — 완료 기준
    const perMap = new Map<string, Set<string>>();
    prog.filter(p => FULL.has(p.status)).forEach(p => {
      (perMap.get(p.student_id) || perMap.set(p.student_id, new Set()).get(p.student_id))!.add(p.goal_id);
    });
    const perStudent = Array.from(perMap.entries()).map(([studentId, gset]) => ({ studentId, done: gset.size }));
    out[d.id] = { total, done, currentIdx, currentTitle, perStudent };
  }
  return out;
}

// PLAN-POS-ADJUST-V1: 진도 위치 수동 조정 — 잘못 눌린 기록을 UI에서 리셋/이동
export type ProgressDetailRow = { student_id: string; goal_id: string; status: string; partial_upto: string | null };
export async function fetchDesignProgressRows(designId: string): Promise<ProgressDetailRow[]> {
  const { data, error } = await db.from('plan_goal_progress')
    .select('student_id, goal_id, status, partial_upto').eq('design_id', designId);
  if (error) throw error;
  return data || [];
}

// 위치 재설정: doneGoalIds까지는 전원 '나감' 처리, clearGoalIds의 기록은 삭제.
// 이미 확인(verified_*)·나감(advanced)인 기록은 그대로 둔다 — 쪽지 점수(plan_checks)는 건드리지 않음.
export async function setDesignPosition(
  designId: string,
  studentIds: string[],
  doneGoalIds: string[],
  clearGoalIds: string[],
): Promise<void> {
  if (clearGoalIds.length > 0) {
    const { error } = await db.from('plan_goal_progress')
      .delete().eq('design_id', designId).in('goal_id', clearGoalIds);
    if (error) throw error;
  }
  if (doneGoalIds.length > 0 && studentIds.length > 0) {
    const existing = await fetchDesignProgressRows(designId);
    const keep = new Set(existing
      .filter(r => ['advanced', 'verified_ok', 'verified_weak'].includes(r.status))
      .map(r => `${r.student_id}::${r.goal_id}`));
    const rows: any[] = [];
    for (const gid of doneGoalIds) {
      for (const sid of studentIds) {
        if (keep.has(`${sid}::${gid}`)) continue;
        rows.push({
          design_id: designId, student_id: sid, goal_id: gid,
          status: 'advanced', partial_upto: null, advanced_at: new Date().toISOString(),
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await db.from('plan_goal_progress')
        .upsert(rows, { onConflict: 'design_id,student_id,goal_id' });
      if (error) throw error;
    }
  }
}

// PLAN-CANCEL-V1: 휴강 처리 — 세션을 cancelled로 표시(사유 기록).
// 진도는 저절로 밀린다(그날 기록이 없으니 남은 목표가 풀에 남아 자동 재분배).
// 그날 마감이던 숙제는 다음 수업일로 마감을 밀어 숙제검사도 다음 시간으로 넘어간다.
export function nextRhythmDate(rhythm: Record<string, SessionRole>, fromDate: string): string | null {
  const days = Object.keys(rhythm || {}).map(Number);
  if (days.length === 0) return null;
  const base = new Date(fromDate + 'T12:00:00');
  for (let i = 1; i <= 14; i++) {
    const dt = new Date(base); dt.setDate(dt.getDate() + i);
    if (days.includes(dt.getDay())) return dt.toISOString().slice(0, 10);
  }
  return null;
}

export async function cancelSession(design: any, dateStr: string, reason: string): Promise<{ hwShifted: number; nextDate: string | null }> {
  const role = (design.rhythm || {})[String(new Date(dateStr + 'T12:00:00').getDay())] || 'progress';
  const { error } = await db.from('plan_sessions').upsert({
    design_id: design.id, session_date: dateStr, role,
    status: 'cancelled', cancel_reason: reason.trim() || null,
  }, { onConflict: 'design_id,session_date' });
  if (error) throw error;

  // 이날 마감 숙제 → 다음 수업일로
  let hwShifted = 0;
  const subject = design.plan_tracks?.subject;
  const nextDate = nextRhythmDate(design.rhythm || {}, dateStr);
  if (subject && nextDate) {
    const { data: ps } = await db.from('plan_students').select('student_id').eq('design_id', design.id);
    const sids = ((ps || []) as any[]).map(r => r.student_id);
    if (sids.length > 0) {
      const { data: hws } = await db.from('homework_assignments')
        .select('id').in('student_id', sids).eq('subject', subject)
        .in('check_status', ['pending', 'assigned']).eq('end_date', dateStr);
      const ids = ((hws || []) as any[]).map(h => h.id);
      if (ids.length > 0) {
        const { error: hwErr } = await db.from('homework_assignments')
          .update({ end_date: nextDate }).in('id', ids);
        if (!hwErr) hwShifted = ids.length;
      }
    }
  }
  return { hwShifted, nextDate };
}

export async function uncancelSession(designId: string, dateStr: string): Promise<void> {
  const { error } = await db.from('plan_sessions')
    .update({ status: 'draft', cancel_reason: null })
    .eq('design_id', designId).eq('session_date', dateStr);
  if (error) throw error;
}

// 특정 날짜의 설계별 세션 상태 (휴강 표시용)
export type SessionStatusInfo = { status: string; cancelReason: string | null };
export async function fetchSessionStatusFor(designIds: string[], dateStr: string): Promise<Record<string, SessionStatusInfo>> {
  const out: Record<string, SessionStatusInfo> = {};
  if (designIds.length === 0) return out;
  const { data } = await db.from('plan_sessions')
    .select('design_id, status, cancel_reason')
    .in('design_id', designIds).eq('session_date', dateStr);
  ((data || []) as any[]).forEach(r => {
    out[r.design_id] = { status: r.status, cancelReason: r.cancel_reason || null };
  });
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

// PLAN-PRINCIPAL-BOARD-V1: 원장 격차 대시보드 — 반별 "나간 진도 vs 확인된 진도" + 학생별 신호
export type PrincipalStudentRow = {
  studentId: string; name: string; type: string | null;
  done: number;        // 나간 목표 수 (advanced 계열)
  verifiedOk: number;  // 확인 도장 ✓이해
  weak: number;        // 확인 도장 ✗미흡
  unverified: number;  // 나갔지만 아직 확인 안 됨
  behind: number;      // 반에서 가장 앞선 학생 대비 뒤처진 목표 수
  openQueue: number;   // 열린 재시험·재학습 건수
};
export type PrincipalDesignOverview = {
  designId: string; title: string; subject: string; teacherName: string;
  total: number;            // 끝점까지 목표 수
  groupDone: number;        // 반이 나간 목표 수 (union)
  advancedRate: number;     // 나간 진도 % (학생×목표 기준)
  verifiedRate: number;     // 확인된 진도 % (학생×목표 기준)
  unverifiedCount: number; weakCount: number;
  queueTeacher: number; queueAssistant: number;
  pace: number | null;      // 남은 목표 ÷ 남은 수업 (기한 없으면 null)
  targetDate: string | null;
  students: PrincipalStudentRow[];
};
const ADVANCED_FAMILY = ['advanced', 'partial', 'verified_ok', 'verified_weak'];

export async function fetchPrincipalOverview(): Promise<PrincipalDesignOverview[]> {
  const designs = await fetchDesigns();
  if (designs.length === 0) return [];
  const designIds = designs.map((d: any) => d.id);
  const trackIds = Array.from(new Set(designs.map((d: any) => d.track_id)));
  const [goalsRes, progRes, queueRes, psRes] = await Promise.all([
    db.from('plan_goals').select('id, track_id, order_index').in('track_id', trackIds).order('order_index'),
    db.from('plan_goal_progress').select('design_id, student_id, goal_id, status').in('design_id', designIds),
    db.from('plan_queue').select('design_id, student_id, assignee').in('design_id', designIds).eq('status', 'open'),
    db.from('plan_students').select('design_id, student_id, student_type').in('design_id', designIds),
  ]);
  const sids = Array.from(new Set(((psRes.data || []) as any[]).map(r => r.student_id)));
  const tids = Array.from(new Set(designs.map((d: any) => d.teacher_id).filter(Boolean)));
  const [studsRes, profsRes] = await Promise.all([
    sids.length ? supabase.from('students').select('id, name').in('id', sids) : Promise.resolve({ data: [] as any[] }),
    tids.length ? db.from('profiles').select('id, full_name').in('id', tids) : Promise.resolve({ data: [] as any[] }),
  ]);
  const nameOf = new Map(((studsRes.data || []) as any[]).map((s: any) => [s.id, s.name]));
  const teacherOf = new Map(((profsRes.data || []) as any[]).map((p: any) => [p.id, p.full_name]));
  const goalsByTrack = new Map<string, any[]>();
  ((goalsRes.data || []) as any[]).forEach(g => {
    (goalsByTrack.get(g.track_id) || goalsByTrack.set(g.track_id, []).get(g.track_id))!.push(g);
  });

  const out: PrincipalDesignOverview[] = [];
  for (const d of designs) {
    const allGoals = goalsByTrack.get(d.track_id) || [];
    const endIdx = d.end_goal_id ? allGoals.findIndex(g => g.id === d.end_goal_id) : allGoals.length - 1;
    const trackGoalIds = new Set(allGoals.slice(0, (endIdx >= 0 ? endIdx : allGoals.length - 1) + 1).map(g => g.id));
    const total = trackGoalIds.size;
    const roster = ((psRes.data || []) as any[]).filter(r => r.design_id === d.id);
    const rows = ((progRes.data || []) as any[]).filter(r => r.design_id === d.id && trackGoalIds.has(r.goal_id));
    const queueRows = ((queueRes.data || []) as any[]).filter(r => r.design_id === d.id);

    const perStudent: PrincipalStudentRow[] = roster.map(r => {
      const mine = rows.filter(p => p.student_id === r.student_id);
      const done = mine.filter(p => ADVANCED_FAMILY.includes(p.status)).length;
      const verifiedOk = mine.filter(p => p.status === 'verified_ok').length;
      const weak = mine.filter(p => p.status === 'verified_weak').length;
      return {
        studentId: r.student_id, name: nameOf.get(r.student_id) || '?', type: r.student_type || null,
        done, verifiedOk, weak,
        unverified: mine.filter(p => p.status === 'advanced' || p.status === 'partial').length,
        behind: 0,
        openQueue: queueRows.filter(q => q.student_id === r.student_id).length,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const maxDone = perStudent.reduce((m, s) => Math.max(m, s.done), 0);
    perStudent.forEach(s => { s.behind = maxDone - s.done; });

    const groupDone = new Set(rows.filter(p => ADVANCED_FAMILY.includes(p.status)).map(p => p.goal_id)).size;
    const denom = roster.length * total;
    const advancedTotal = perStudent.reduce((a, s) => a + s.done, 0);
    const verifiedTotal = perStudent.reduce((a, s) => a + s.verifiedOk, 0);
    const remainSessions = countProgressSessions(d.rhythm || {}, d.target_date);
    out.push({
      designId: d.id,
      title: d.title || d.plan_tracks?.title || '(제목 없음)',
      subject: d.plan_tracks?.subject || '',
      teacherName: teacherOf.get(d.teacher_id) || '담당',
      total, groupDone,
      advancedRate: denom > 0 ? advancedTotal / denom : 0,
      verifiedRate: denom > 0 ? verifiedTotal / denom : 0,
      unverifiedCount: perStudent.reduce((a, s) => a + s.unverified, 0),
      weakCount: perStudent.reduce((a, s) => a + s.weak, 0),
      queueTeacher: queueRows.filter(q => q.assignee !== 'assistant').length,
      queueAssistant: queueRows.filter(q => q.assignee === 'assistant').length,
      pace: remainSessions > 0 ? Math.max(0, total - groupDone) / remainSessions : null,
      targetDate: d.target_date || null,
      students: perStudent,
    });
  }
  return out;
}

// 에스컬레이션 플래그 — 원장 보드에서 소비 (확인/해결 처리)
export type PlanFlagRow = {
  id: string; design_id: string; student_id: string;
  kind: string; level: string; message: string; status: string; created_at: string;
  student_name?: string; design_title?: string;
};
export async function fetchOpenFlags(): Promise<PlanFlagRow[]> {
  const { data, error } = await db.from('plan_flags')
    .select('*').in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as PlanFlagRow[];
  if (rows.length === 0) return rows;
  const sids = Array.from(new Set(rows.map(r => r.student_id)));
  const dids = Array.from(new Set(rows.map(r => r.design_id)));
  const [studs, des] = await Promise.all([
    supabase.from('students').select('id, name').in('id', sids),
    db.from('plan_designs').select('id, title, plan_tracks(title)').in('id', dids),
  ]);
  const sName = new Map(((studs.data || []) as any[]).map((s: any) => [s.id, s.name]));
  const dName = new Map(((des.data || []) as any[]).map((r: any) => [r.id, r.title || r.plan_tracks?.title]));
  rows.forEach(r => {
    r.student_name = sName.get(r.student_id) || '?';
    r.design_title = dName.get(r.design_id) || '';
  });
  return rows;
}
export async function updateFlagStatus(id: string, status: 'acknowledged' | 'resolved'): Promise<void> {
  const patch: any = { status };
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();
  const { error } = await db.from('plan_flags').update(patch).eq('id', id);
  if (error) throw error;
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

