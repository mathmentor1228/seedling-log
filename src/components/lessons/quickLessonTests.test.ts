import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
import { lessonTest, mergeQuickTests, saveQuickTests, validateQuickTests } from './quickLessonTests';

let current: Record<string, any>;
let patch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  current = { id: 'lesson-1', test_content: '명제 주간테스트', test_result_text: '85점', test_result: 'pass', test_time: '18:00:00', test_date: '2026-10-30', test_assistant: '은서조교', test_notes: '기존 메모', submitted: true };
  patch = vi.fn();
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.from.mockReset().mockImplementation(() => {
    const query: any = { select: () => query, eq: () => query, update: (value: any) => { patch(value); return query; }, maybeSingle: async () => ({ data: current, error: null }), then: (resolve: any) => Promise.resolve({ data: current, error: null }).then(resolve) };
    return query;
  });
});

describe('대시보드 테스트 결과', () => {
  it('당일 일지의 테스트 1과 2를 독립적으로 읽는다', () => {
    const tests = mergeQuickTests({ ...current, test_content_2: '기출 테스트', test_result_text_2: '17/20', test_result_2: 'fail' }, [], []);
    expect(tests.map(t => [t.slot, t.content, t.score, t.outcome])).toEqual([[1, '명제 주간테스트', '85점', 'pass'], [2, '기출 테스트', '17/20', 'fail']]);
  });
  it('일지 결과를 우선하며 같은 테스트의 중복 표시를 제외한다', () => {
    const tests = mergeQuickTests(current, [{ id: 'record-1', lesson_record_id: 'lesson-1', content: '명제 주간테스트', score: '80점' }], [{ id: 'schedule-1', content: '명제 주간테스트', result_score: '70점' }]);
    expect(tests).toHaveLength(2);
    expect(tests[0].score).toBe('85점');
  });
  it('별도 기록과 일정의 서로 다른 테스트도 모두 보존한다', () => {
    const tests = mergeQuickTests(null, [{ id: 'record-1', content: '어휘', score: '17/20', passed: false }], [{ id: 'schedule-1', content: '문법', result_score: '90점', result_passed: true }]);
    expect(tests.slice(2).map(t => [t.source, t.content, t.score, t.outcome])).toEqual([['record', '어휘', '17/20', 'fail'], ['schedule', '문법', '90점', 'pass']]);
  });
  it('결과가 있으면 내용 및 범위를 필수로 검사한다', () => {
    expect(validateQuickTests([{ ...lessonTest(null, 1), score: '85점' }])).not.toBeNull();
    expect(validateQuickTests([{ ...lessonTest(null, 1), content: '단원평가', score: '85점' }])).toBeNull();
  });
  it('일지만 수정하면 테스트 결과는 다시 저장하지 않는다', async () => {
    const base = mergeQuickTests(current, [], []);
    await saveQuickTests('lesson-1', '수학', base, base);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('점수 변경은 해당 슬롯만 저장하며 조교·시간·메모를 보존한다', async () => {
    const base = mergeQuickTests(current, [], []);
    await saveQuickTests('lesson-1', '수학', [{ ...base[0], score: '90점' }, base[1]], base);
    expect(mocks.rpc).toHaveBeenCalledWith('update_lesson_test_fields', expect.objectContaining({ _lesson_id: 'lesson-1', _test_slot: 1, _test_result_text: '90점', _test_content: null, _test_time: '18:00:00', _test_assistant: '은서조교', _test_notes: '기존 메모', _test_result: 'pass' }));
    expect(patch).not.toHaveBeenCalled();
  });
  it('테스트 2 수정은 테스트 1 및 제출 상태를 건드리지 않는다', async () => {
    const base = mergeQuickTests(current, [], []);
    await saveQuickTests('lesson-1', '수학', [base[0], { ...base[1], content: '기출 테스트', score: '17/20' }], base);
    expect(mocks.rpc).toHaveBeenCalledWith('update_lesson_test_fields', expect.objectContaining({ _test_slot: 2, _test_name: '기출 테스트', _test_content: '기출 테스트', _test_result_text: '17/20' }));
    expect(patch).not.toHaveBeenCalled();
    expect(current.submitted).toBe(true);
  });
  it('영어 통과 여부를 기존 영어 필드에 반영한다', async () => {
    current.english_pass_fail = 'fail';
    const base = mergeQuickTests(current, [], []);
    await saveQuickTests('lesson-1', '영어', [{ ...base[0], outcome: 'pass' }, base[1]], base);
    expect(mocks.rpc).toHaveBeenCalledWith('update_lesson_test_fields', expect.objectContaining({ _test_result: 'none' }));
    expect(patch).toHaveBeenCalledWith({ english_pass_fail: 'pass' });
  });
  it('다른 화면이 수정한 점수를 오래된 값으로 덮어쓰지 않는다', async () => {
    const base = mergeQuickTests(current, [], []);
    current.test_result_text = '95점';
    await expect(saveQuickTests('lesson-1', '수학', [{ ...base[0], score: '90점' }, base[1]], base)).rejects.toThrow('다른 화면에서 변경');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('저장 실패를 성공으로 처리하지 않는다', async () => {
    const base = mergeQuickTests(current, [], []);
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(saveQuickTests('lesson-1', '수학', [{ ...base[0], score: '90점' }, base[1]], base)).rejects.toThrow('저장되지 않았습니다');
  });
});