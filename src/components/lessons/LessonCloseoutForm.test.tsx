// LESSON-CLOSEOUT-V1 컴포넌트 테스트
// - 실제 DB write는 절대 하지 않는다. supabase 클라이언트와 저장 헬퍼는 전부 mock.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const upsertMock = vi.fn(async () => ({ id: 'rec-1', error: null }));
const reconcileMock = vi.fn(async () => ({ error: null }));

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'teacher-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/lessonRecordUpsert', () => ({ safeUpsertLessonRecord: (...a: any[]) => upsertMock(...(a as [])) }));
vi.mock('@/lib/homeworkReconcile', () => ({
  reconcileLessonHomework: (...a: any[]) => reconcileMock(...(a as [])),
  HOMEWORK_LOAD_COLUMNS: 'id, content',
}));

const TABLE_DATA: Record<string, any> = {
  classes: { name: '중2 A반', subject: '수학' },
  class_students: [{ student_id: 's1' }, { student_id: 's2' }],
  students: [
    { id: 's1', name: '학생가', school: null, grade: null },
    { id: 's2', name: '학생나', school: null, grade: null },
  ],
  lesson_records: [],
  homework_assignments: [],
};

function makeQuery(table: string) {
  const payload = TABLE_DATA[table];
  const result = { data: Array.isArray(payload) ? payload : payload, error: null, count: 0 };
  const q: any = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    in: () => q,
    lt: () => q,
    gte: () => q,
    lte: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: payload, error: null }),
    then: (res: any) => Promise.resolve(result).then(res),
  };
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => makeQuery(table) },
}));

import { LessonCloseoutForm } from './LessonCloseoutForm';

async function renderForm(onClose = vi.fn()) {
  render(<LessonCloseoutForm classId="c1" date="2026-08-21" onClose={onClose} />);
  await waitFor(() => expect(screen.getByText('학생가')).toBeInTheDocument());
  return onClose;
}

beforeEach(() => {
  upsertMock.mockClear();
  reconcileMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('수업출결 미선택 게이트', () => {
  it('미선택 학생이 있으면 마감 버튼이 비활성화되고 안내가 뜬다', async () => {
    await renderForm();
    expect(screen.getByTestId('closeout-unmarked-banner')).toHaveTextContent('수업출결 미선택 2명');
    const finalize = screen.getByRole('button', { name: /수업 마감/ });
    expect(finalize).toBeDisabled();
  });

  it("'미기록 전원 정상등원'으로 모두 채우면 마감이 가능해진다", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(screen.getAllByRole('button', { name: '미기록 전원 정상등원' })[0]);
    await waitFor(() => expect(screen.queryByTestId('closeout-unmarked-banner')).toBeNull());
    expect(screen.getByRole('button', { name: /수업 마감/ })).toBeEnabled();
  });

  it('미선택 상태에서도 임시저장은 가능하다 (암묵 정상등원 없음)', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(screen.getByRole('button', { name: /임시저장/ }));
    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    const payload = upsertMock.mock.calls[0][0] as any;
    expect(payload.attendance_status).toEqual([]);
    expect(payload.submitted).toBe(false);
  });
});

describe('저장하지 않은 변경 경고', () => {
  it('dirty → 닫기 → 취소하면 이동하지 않고 값이 유지된다', async () => {
    const user = userEvent.setup();
    const onClose = await renderForm();
    await user.click(screen.getAllByRole('button', { name: '지각' })[0]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('closeout-unmarked-banner')).toHaveTextContent('수업출결 미선택 1명');
  });

  it('dirty → 닫기 → 확인하면 이동한다', async () => {
    const user = userEvent.setup();
    const onClose = await renderForm();
    await user.click(screen.getAllByRole('button', { name: '지각' })[0]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clean 상태에서는 경고 없이 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = await renderForm();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
