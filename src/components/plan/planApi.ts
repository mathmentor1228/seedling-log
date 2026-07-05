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
  return data || [];
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
