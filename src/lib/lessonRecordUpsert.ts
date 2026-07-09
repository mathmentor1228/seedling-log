// LESSON-DEDUP-V1
// (student_id, subject, lesson_date)는 이제 lesson_records의 유일성 키입니다.
// 어떤 경로에서든 이 헬퍼를 통해 저장하면 중복 insert 대신 기존 레코드에 병합 update됩니다.
import { supabase } from '@/integrations/supabase/client';

type LessonRecordPayload = Record<string, any> & {
  student_id: string;
  subject: string;
  lesson_date: string;
};

interface UpsertResult {
  id: string;
  created: boolean;
  error: any | null;
}

/**
 * 같은 학생·과목·날짜의 기존 lesson_record가 있으면 그 위에 병합 update,
 * 없으면 insert. 병합 시에는 payload에 포함된 필드만 갱신됩니다 (다른 경로가
 * 채워둔 필드는 보존).
 *
 * 옵션:
 * - preserveSubmitted (기본 true): 기존 레코드가 이미 submitted=true면 그대로 유지
 */
export async function safeUpsertLessonRecord(
  payload: LessonRecordPayload,
  options: { preserveSubmitted?: boolean } = {}
): Promise<UpsertResult> {
  const preserveSubmitted = options.preserveSubmitted ?? true;
  try {
    const { data: existing, error: findErr } = await supabase
      .from('lesson_records')
      .select('id, submitted')
      .eq('student_id', payload.student_id)
      .eq('lesson_date', payload.lesson_date)
      .eq('subject', payload.subject as any)
      .maybeSingle();
    if (findErr && findErr.code !== 'PGRST116') {
      return { id: '', created: false, error: findErr };
    }

    if (existing?.id) {
      const updatePayload: Record<string, any> = { ...payload };
      // 이미 제출된 레코드면 submitted를 draft로 되돌리지 않음
      if (preserveSubmitted && existing.submitted && 'submitted' in updatePayload) {
        delete updatePayload.submitted;
      }
      const { error: upErr } = await supabase
        .from('lesson_records')
        .update(updatePayload)
        .eq('id', existing.id);
      return { id: existing.id, created: false, error: upErr };
    }

    const { data: ins, error: insErr } = await supabase
      .from('lesson_records')
      .insert(payload as any)
      .select('id')
      .single();

    return { id: ins?.id || '', created: true, error: insErr };
  } catch (e: any) {
    return { id: '', created: false, error: e };
  }
}

/** 배열 payload 각각을 safeUpsertLessonRecord로 처리 */
export async function safeUpsertLessonRecords(
  payloads: LessonRecordPayload[],
  options: { preserveSubmitted?: boolean } = {}
): Promise<UpsertResult[]> {
  const results: UpsertResult[] = [];
  for (const p of payloads) {
    results.push(await safeUpsertLessonRecord(p, options));
  }
  return results;
}
