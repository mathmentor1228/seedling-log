// RETIRED-TEACHER-GUARD-V1
// 퇴사(비활성) 선생님의 반은 수업일지 작성/선택 목록에서 제외한다.
// 과거 기록은 그대로 보존되며, 여기서는 '새로 만드는 경로'만 막는다.
import { supabase } from '@/integrations/supabase/client';

export async function fetchRetiredTeacherIds(): Promise<Set<string>> {
  const { data } = await supabase.from('profiles').select('id').eq('is_active', false);
  return new Set((data || []).map((r: any) => r.id as string));
}

/** teacher_id 가 퇴사자인 반을 제거한다. teacher_id 가 없는(미지정) 반은 유지. */
export function filterActiveTeacherClasses<T extends { teacher_id?: string | null }>(
  classes: T[] | null | undefined,
  retiredIds: Set<string>
): T[] {
  return (classes || []).filter((c) => !c.teacher_id || !retiredIds.has(c.teacher_id));
}
