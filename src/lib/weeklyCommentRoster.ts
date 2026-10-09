// WEEKLY-COMMENT-V2: "이 선생님이 이번 주에 봐야 할 학생" 명단을 세 출처의 합집합으로 만든다.
//   ① 이번 주 일지(lesson_records)  ② 활성 시간표(class_schedules → classes → class_students)  ③ 담당 매핑(student_subject_teachers)
// 일지만 보면 아직 수업 안 한 학생·일지 안 쓴 학생이 빠지므로(2026-10-09 원장 지적) 시간표·매핑을 더한다.
// 재학/재등원 학생만, 제외 선생님(영어 이재진)·비활성 강사는 뺀다. 읽기만 한다.
import { supabase } from '@/integrations/supabase/client';

export type RosterSource = 'lesson' | 'schedule' | 'mapping';

export interface RosterStudent {
  id: string;
  name: string;
  school: string | null;
  subject: string;
  sources: RosterSource[];
}
export interface RosterComment { teacherId: string; teacherName: string; text: string }
export interface TeacherRoster { teacherId: string; teacherName: string; students: RosterStudent[] }
export interface WeeklyCommentRoster {
  groups: TeacherRoster[];
  /** 학생ID → 이번 주 코멘트(누가 썼든) */
  commentsByStudent: Map<string, RosterComment[]>;
}

const ACTIVE = new Set(['재학', '재등원']);

export async function fetchWeeklyCommentRoster(
  weekStart: string,
  weekEnd: string,
  opts: { excludedTeacherIds?: readonly string[]; onlyTeacherId?: string } = {},
): Promise<WeeklyCommentRoster> {
  const excluded = new Set(opts.excludedTeacherIds ?? []);

  const [lessonsRes, schedRes, classesRes, csRes, mapRes, studentsRes, profilesRes] = await Promise.all([
    supabase.from('lesson_records')
      .select('student_id, teacher_id, teacher_display_name, subject, weekly_summary, weekly_summary_week')
      .gte('lesson_date', weekStart).lte('lesson_date', weekEnd),
    supabase.from('class_schedules').select('class_id, teacher_id, is_active, inactive_until').eq('is_active', true),
    supabase.from('classes').select('id, name, subject, teacher_id'),
    supabase.from('class_students').select('class_id, student_id'),
    // 매핑 테이블은 권한에 따라 못 읽을 수 있다 → 실패하면 비움
    supabase.from('student_subject_teachers').select('student_id, teacher_id, subject').then(r => r, () => ({ data: null, error: null })),
    supabase.from('students').select('id, name, school, enrollment_status').in('enrollment_status', [...ACTIVE]),
    supabase.from('profiles').select('id, full_name, is_active'),
  ]);

  const students = new Map<string, { id: string; name: string; school: string | null }>();
  for (const s of (studentsRes.data || []) as any[]) students.set(s.id, { id: s.id, name: s.name, school: s.school });
  const profiles = new Map<string, { name: string; active: boolean }>();
  for (const p of (profilesRes.data || []) as any[]) profiles.set(p.id, { name: p.full_name || '(강사?)', active: p.is_active !== false });
  const classes = new Map<string, { name: string; subject: string; teacherId: string | null }>();
  for (const k of (classesRes.data || []) as any[]) classes.set(k.id, { name: k.name, subject: k.subject, teacherId: k.teacher_id });
  const roster = new Map<string, Set<string>>();
  for (const cs of (csRes.data || []) as any[]) {
    const set = roster.get(cs.class_id) ?? new Set<string>();
    set.add(cs.student_id);
    roster.set(cs.class_id, set);
  }

  const teacherOk = (tid: string | null | undefined): tid is string =>
    !!tid && !excluded.has(tid) && (profiles.get(tid)?.active ?? true) && (!opts.onlyTeacherId || tid === opts.onlyTeacherId);

  // 강사 → 학생 → (과목, 출처들)
  const groups = new Map<string, Map<string, { subject: string; sources: Set<RosterSource> }>>();
  const add = (tid: string, sid: string, subject: string, source: RosterSource) => {
    if (!students.has(sid)) return;
    const g = groups.get(tid) ?? new Map();
    groups.set(tid, g);
    const cell = g.get(sid) ?? { subject, sources: new Set<RosterSource>() };
    if (source === 'lesson') cell.subject = subject || cell.subject; // 일지의 과목이 가장 정확
    else if (!cell.subject) cell.subject = subject;
    cell.sources.add(source);
    g.set(sid, cell);
  };

  const commentsByStudent = new Map<string, RosterComment[]>();
  const teacherNameFromLesson = new Map<string, string>();
  for (const r of (lessonsRes.data || []) as any[]) {
    if (r.teacher_display_name && r.teacher_id) teacherNameFromLesson.set(r.teacher_id, r.teacher_display_name);
    const t = (r.weekly_summary || '').trim();
    if (t && (!r.weekly_summary_week || r.weekly_summary_week === weekStart) && r.teacher_id) {
      const arr = commentsByStudent.get(r.student_id) ?? [];
      if (!arr.some(x => x.teacherId === r.teacher_id && x.text === t)) {
        arr.push({ teacherId: r.teacher_id, teacherName: r.teacher_display_name || profiles.get(r.teacher_id)?.name || '선생님', text: t });
      }
      commentsByStudent.set(r.student_id, arr);
    }
    if (teacherOk(r.teacher_id)) add(r.teacher_id, r.student_id, r.subject, 'lesson');
  }

  // ② 시간표: 이번 주 안에 비활성 해제가 안 되는 반은 제외
  for (const s of (schedRes.data || []) as any[]) {
    if (s.inactive_until && s.inactive_until >= weekEnd) continue;
    const k = classes.get(s.class_id);
    const tid = s.teacher_id || k?.teacherId;
    if (!k || !teacherOk(tid)) continue;
    for (const sid of roster.get(s.class_id) ?? []) add(tid, sid, k.subject, 'schedule');
  }

  // ③ 담당 매핑
  for (const l of (mapRes.data || []) as any[]) {
    if (!teacherOk(l.teacher_id)) continue;
    add(l.teacher_id, l.student_id, l.subject, 'mapping');
  }

  const out: TeacherRoster[] = [];
  for (const [tid, g] of groups) {
    const list: RosterStudent[] = [];
    for (const [sid, cell] of g) {
      const st = students.get(sid)!;
      list.push({ id: sid, name: st.name, school: st.school, subject: cell.subject || '', sources: [...cell.sources] });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    out.push({ teacherId: tid, teacherName: teacherNameFromLesson.get(tid) || profiles.get(tid)?.name || '(강사?)', students: list });
  }
  return { groups: out, commentsByStudent };
}

export function sourceLabel(sources: RosterSource[]): string {
  if (sources.includes('lesson')) return '';
  const parts = [];
  if (sources.includes('schedule')) parts.push('시간표');
  if (sources.includes('mapping')) parts.push('담당 매핑');
  return `이번 주 일지 아직 없음 (${parts.join('·')} 기준)`;
}
