import { supabase } from '@/integrations/supabase/client';

export type TestOutcome = 'none' | 'pass' | 'fail';
export interface QuickLessonTest {
  key: string;
  source: 'lesson' | 'record' | 'schedule';
  id: string | null;
  slot: 1 | 2;
  content: string;
  score: string;
  outcome: TestOutcome;
}

type TestRow = Record<string, any>;
export const QUICK_TEST_COLUMNS = 'id, test_name, test_content, test_title, test_result_text, test_result, english_pass_fail, test_date, test_time, test_notes, test_assistant, test_name_2, test_content_2, test_result_text_2, test_result_2, english_pass_fail_2, test_date_2, test_assistant_2';

export function lessonTest(row: TestRow | null, slot: 1 | 2): QuickLessonTest {
  const suffix = slot === 2 ? '_2' : '';
  const outcome = row?.[`english_pass_fail${suffix}`] || row?.[`test_result${suffix}`];
  return {
    key: `lesson-${slot}`, source: 'lesson', id: row?.id ?? null, slot,
    content: row?.[`test_content${suffix}`] || row?.[`test_name${suffix}`] || (slot === 1 ? row?.test_title : '') || '',
    score: row?.[`test_result_text${suffix}`] ?? '',
    outcome: outcome === 'pass' || outcome === 'fail' ? outcome : 'none',
  };
}

export const hasTest = (test: QuickLessonTest) => !!(test.content.trim() || test.score.trim() || test.outcome !== 'none');
export const testChanged = (test: QuickLessonTest, base: QuickLessonTest) =>
  test.content !== base.content || test.score !== base.score || test.outcome !== base.outcome;

export function mergeQuickTests(row: TestRow | null, records: TestRow[], schedules: TestRow[]): QuickLessonTest[] {
  const lessons = [lessonTest(row, 1), lessonTest(row, 2)];
  const existing = lessons.filter(hasTest);
  const sameContent = (test: QuickLessonTest, content: string) => test.content.trim() === content.trim();
  const extras: QuickLessonTest[] = [];
  const add = (source: 'record' | 'schedule', entry: TestRow) => {
    const content = entry.content || '';
    // Linked test_records mirror slot 1. Other tests remain separate, even on the same day.
    if (existing.some(t => sameContent(t, content)) || (source === 'record' && entry.lesson_record_id === row?.id && hasTest(lessons[0]))) return;
    if (source === 'schedule' && extras.some(t => sameContent(t, content))) return;
    const passed = source === 'record' ? entry.passed : entry.result_passed;
    const test: QuickLessonTest = {
      key: `${source}-${entry.id}`, source, id: entry.id, slot: 1,
      content, score: (source === 'record' ? entry.score : entry.result_score) ?? '',
      outcome: passed === true ? 'pass' : passed === false ? 'fail' : 'none',
    };
    if (hasTest(test)) extras.push(test);
  };
  records.forEach(r => add('record', r));
  schedules.forEach(r => add('schedule', r));
  return [...lessons, ...extras];
}

export async function loadQuickTests(row: TestRow | null, studentId: string, subject: string, date: string): Promise<QuickLessonTest[]> {
  // Canonical lesson slots take priority; don't fetch legacy mirrors when both are filled.
  if (hasTest(lessonTest(row, 1)) && hasTest(lessonTest(row, 2))) return mergeQuickTests(row, [], []);
  const [records, schedules] = await Promise.all([
    supabase.from('test_records').select('id, lesson_record_id, content, score, passed')
      .eq('student_id', studentId).eq('subject', subject).eq('test_date', date).order('created_at'),
    supabase.from('test_schedules').select('id, content, result_score, result_passed')
      .eq('student_id', studentId).eq('subject', subject as any).eq('test_date', date).order('created_at'),
  ]);
  if (records.error) throw records.error;
  if (schedules.error) throw schedules.error;
  return mergeQuickTests(row, records.data || [], schedules.data || []);
}

export function validateQuickTests(tests: QuickLessonTest[]): string | null {
  if (tests.some(t => (t.score.trim() || t.outcome !== 'none') && !t.content.trim())) {
    return '결과를 입력한 테스트의 내용 및 범위를 적어 주세요.';
  }
  return null;
}

const CONFLICT = '테스트 결과가 다른 화면에서 변경되었습니다. 테스트를 다시 불러온 뒤 확인해 주세요.';

export async function saveQuickTests(lessonId: string, subject: string, tests: QuickLessonTest[], base: QuickLessonTest[]) {
  const validation = validateQuickTests(tests);
  if (validation) throw new Error(validation);
  for (const test of tests) {
    const original = base.find(b => b.key === test.key);
    if (!original || !testChanged(test, original)) continue;
    const contentChanged = test.content !== original.content;
    const scoreChanged = test.score !== original.score;
    const outcomeChanged = test.outcome !== original.outcome;
    if (test.source === 'lesson') {
      const { data: current, error } = await supabase.from('lesson_records').select(QUICK_TEST_COLUMNS).eq('id', lessonId).maybeSingle();
      if (error) throw error;
      if (!current) throw new Error('수업 일지를 찾을 수 없습니다.');
      const live = lessonTest(current, test.slot);
      if ((contentChanged && live.content !== original.content) || (scoreChanged && live.score !== original.score) || (outcomeChanged && live.outcome !== original.outcome)) throw new Error(CONFLICT);
      const suffix = test.slot === 2 ? '_2' : '';
      const outcome = outcomeChanged ? test.outcome : live.outcome;
      const { data: saved, error: saveError } = await supabase.rpc('update_lesson_test_fields', {
        _lesson_id: lessonId, _test_slot: test.slot,
        _test_name: contentChanged ? test.content.trim() : null,
        _test_content: contentChanged ? test.content.trim() : null,
        _test_result_text: scoreChanged ? test.score.trim() : null,
        _test_result: subject === '영어' && test.slot === 1 ? 'none' : outcome,
        _test_date: current[`test_date${suffix}`] ?? null,
        _test_time: current.test_time ?? null,
        _test_notes: current.test_notes ?? null,
        _test_assistant: current[`test_assistant${suffix}`] ?? null,
      });
      if (saveError) throw saveError;
      if (!saved) throw new Error('테스트 결과가 저장되지 않았습니다.');
      // Slot 1 RPC does not synchronize the legacy title or English outcome.
      const patch: Record<string, string | null> = {};
      if (contentChanged && test.slot === 1) patch.test_title = test.content.trim();
      if (subject === '영어' && test.slot === 1 && outcomeChanged) patch.english_pass_fail = outcome === 'none' ? null : outcome;
      if (Object.keys(patch).length) {
        const { error: patchError } = await supabase.from('lesson_records').update(patch).eq('id', lessonId);
        if (patchError) throw patchError;
      }
    } else {
      if (!test.id) throw new Error('테스트 기록을 찾을 수 없습니다.');
      const scoreField = test.source === 'record' ? 'score' : 'result_score';
      const passedField = test.source === 'record' ? 'passed' : 'result_passed';
      const updates: Record<string, string | boolean | null> = {};
      if (contentChanged) updates.content = test.content.trim();
      if (scoreChanged) updates[scoreField] = test.score.trim() || null;
      if (outcomeChanged) updates[passedField] = test.outcome === 'none' ? null : test.outcome === 'pass';
      let query = supabase.from(test.source === 'record' ? 'test_records' : 'test_schedules').update(updates).eq('id', test.id);
      // Conditional updates protect changes made by assistants after this form was opened.
      if (contentChanged) query = query.eq('content', original.content);
      if (scoreChanged) query = original.score ? query.eq(scoreField, original.score) : query.or(`${scoreField}.is.null,${scoreField}.eq.`);
      if (outcomeChanged) query = original.outcome === 'none' ? query.is(passedField, null) : query.eq(passedField, original.outcome === 'pass');
      const { data: saved, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!saved) throw new Error(CONFLICT);
    }
  }
}