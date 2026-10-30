import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), reconcile: vi.fn(), saveTests: vi.fn(), loadTests: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/lessonRecordUpsert', () => ({ safeUpsertLessonRecord: mocks.upsert }));
vi.mock('@/lib/homeworkReconcile', () => ({ reconcileLessonHomework: mocks.reconcile, HOMEWORK_LOAD_COLUMNS: 'id, content', PROTECTED_HOMEWORK_MESSAGE: 'protected' }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('./quickLessonTests', async importOriginal => {
  const actual = await importOriginal<typeof import('./quickLessonTests')>();
  return { ...actual, saveQuickTests: mocks.saveTests, loadQuickTests: mocks.loadTests };
});
import { QuickLessonForm } from './QuickLessonForm';

let record: Record<string, any>;
beforeEach(() => {
  vi.clearAllMocks();
  record = { id: 'lesson-1', submitted: false, lesson_range: '명제', understanding_score: 4, notes: '' };
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === 'lesson_records' ? record : [], error: null };
    const q: any = { select: () => q, eq: () => q, lt: () => q, order: () => q, limit: () => q, maybeSingle: async () => result, then: (resolve: any) => Promise.resolve(result).then(resolve) };
    return q;
  });
  mocks.loadTests.mockResolvedValue([
    { key: 'lesson-1', source: 'lesson', id: 'lesson-1', slot: 1, content: '명제 주간테스트', score: '85점', outcome: 'pass' },
    { key: 'lesson-2', source: 'lesson', id: 'lesson-1', slot: 2, content: '', score: '', outcome: 'none' },
  ]);
  mocks.upsert.mockResolvedValue({ id: 'lesson-1', error: null });
  mocks.reconcile.mockResolvedValue({});
  mocks.saveTests.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function openForm() {
  render(<QuickLessonForm studentId="student-1" studentName="테스트 학생" classId="class-1" subject="수학" date="2026-10-30" teacherId="teacher-1" attendanceMarked />);
  await screen.findByRole('textbox', { name: '테스트 1 결과 및 점수' });
}

describe('일지와 테스트 함께 저장', () => {
  it('기존 결과를 읽고 수정한 90점으로 테스트 저장을 호출한다', async () => {
    await openForm();
    const user = userEvent.setup();
    const score = screen.getByRole('textbox', { name: '테스트 1 결과 및 점수' });
    expect(score).toHaveValue('85점');
    await user.clear(score);
    await user.type(score, '90점');
    await user.click(screen.getByRole('button', { name: '저장', exact: true }));
    await waitFor(() => expect(mocks.saveTests).toHaveBeenCalled());
    expect(mocks.saveTests.mock.calls[0][0]).toBe('lesson-1');
    expect(mocks.saveTests.mock.calls[0][2][0].score).toBe('90점');
    expect(mocks.saveTests.mock.calls[0][3][0].score).toBe('85점');
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('attendance_status');
  });
  it('테스트 결과 저장 실패 시 수업을 마감하지 않는다', async () => {
    await openForm();
    mocks.saveTests.mockRejectedValueOnce(new Error('테스트 저장 실패'));
    await userEvent.setup().click(screen.getByRole('button', { name: '마감', exact: true }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '저장 실패' })));
    expect(mocks.upsert.mock.calls.some(([payload]) => payload.submitted === true)).toBe(false);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('테스트와 숙제 저장 성공 후에만 수업을 마감한다', async () => {
    await openForm();
    await userEvent.setup().click(screen.getByRole('button', { name: '마감', exact: true }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(2));
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('submitted');
    expect(mocks.upsert.mock.calls[1][0].submitted).toBe(true);
    expect(mocks.saveTests.mock.invocationCallOrder[0]).toBeLessThan(mocks.reconcile.mock.invocationCallOrder[0]);
    expect(mocks.reconcile.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[1]);
  });
  it('마감된 일지의 테스트 수정은 마감 상태를 되돌리지 않는다', async () => {
    record.submitted = true;
    await openForm();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '테스트 1 결과 및 점수' }), ' 수정');
    await user.click(screen.getByRole('button', { name: '저장', exact: true }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert.mock.calls[0][1]).toEqual({ preserveSubmitted: true });
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('submitted');
  });
  it('다시 불러오기는 테스트만 갱신하고 작성 중인 진도를 보존한다', async () => {
    await openForm();
    const user = userEvent.setup();
    const progress = screen.getByPlaceholderText('진도 (예: 수학1 p.42~55)');
    await user.clear(progress);
    await user.type(progress, '새 진도');
    await user.click(screen.getByRole('button', { name: '테스트 결과 다시 불러오기' }));
    await waitFor(() => expect(mocks.loadTests).toHaveBeenCalledTimes(2));
    expect(progress).toHaveValue('새 진도');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('테스트 조회 실패를 빈 결과로 저장하지 않는다', async () => {
    mocks.loadTests.mockRejectedValueOnce(new Error('조회 실패'));
    render(<QuickLessonForm studentId="student-1" studentName="테스트 학생" classId="class-1" subject="수학" date="2026-10-30" teacherId="teacher-1" attendanceMarked />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: '저장', exact: true })).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});