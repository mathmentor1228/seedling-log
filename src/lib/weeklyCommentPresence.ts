// WEEKLY-COMMENT-V2: "지금 누가 어느 학생 코멘트를 쓰고 있는가"를 Supabase Realtime presence 로 공유한다.
// 입력창(WeeklySummaryDialog)이 열려 있는 동안 track 하고, 원장 현황판(WeeklyCommentBoard)이 구독해 파란색으로 보여준다.
// DB 쓰기 없음. 창을 닫거나 탭을 떠나면 presence 가 사라진다.
export const WEEKLY_COMMENT_PRESENCE_CHANNEL = 'weekly-comment-editing';

export interface WeeklyCommentEditing {
  student_id: string;
  teacher_id: string;
  teacher_name: string;
  week_start: string;
  since: string; // ISO
}

/** 현황판 키: 과목(선생님)별로 따로 관리한다 — 원장이 김한솔을 쓰는 동안 다른 선생님 줄의 김한솔은 파랗게 되면 안 된다 */
export function presenceKey(teacherId: string, studentId: string): string {
  return `${teacherId}:${studentId}`;
}

/** presenceState() 결과를 "선생님:학생" → 편집자 목록으로 평탄화 */
export function flattenPresence(state: Record<string, unknown[]>): Map<string, WeeklyCommentEditing[]> {
  const out = new Map<string, WeeklyCommentEditing[]>();
  for (const metas of Object.values(state)) {
    for (const m of metas as Array<Partial<WeeklyCommentEditing>>) {
      if (!m || typeof m.student_id !== 'string') continue;
      const e: WeeklyCommentEditing = {
        student_id: m.student_id,
        teacher_id: String(m.teacher_id || ''),
        teacher_name: String(m.teacher_name || '선생님'),
        week_start: String(m.week_start || ''),
        since: String(m.since || ''),
      };
      const k = presenceKey(e.teacher_id, e.student_id);
      const arr = out.get(k) ?? [];
      arr.push(e);
      out.set(k, arr);
    }
  }
  return out;
}
