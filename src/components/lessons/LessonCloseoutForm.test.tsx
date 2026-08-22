// LESSON-CLOSEOUT-V1 컴포넌트 테스트
// - 실제 DB write는 절대 하지 않는다. supabase 클라이언트와 저장 헬퍼는 전부 mock.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const upsertMock = vi.fn(async (..._args: any[]) => ({ id: 'rec-1', error: null }));
const reconcileMock = vi.fn(async (..._args: any[]) => ({ error: null }));

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'teacher-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/lessonRecordUpsert', () => ({ safeUpsertLessonRecord: (...a: any[]) => upsertMock(...a) }));
vi.mock('@/lib/homeworkReconcile', () => ({
  reconcileLessonHomework: (...a: any[]) => reconcileMock(...a),
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
  render(
    <MemoryRouter>
      <LessonCloseoutForm classId="c1" date="2026-08-21" onClose={onClose} />
    </MemoryRouter>
  );
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

describe('저장 결과 표시 · 회귀', () => {
  it('마감 성공 시 다음 행동 패널이 뜨고 submitted=true로 저장된다', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(screen.getAllByRole('button', { name: '미기록 전원 정상등원' })[0]);
    await user.click(screen.getByRole('button', { name: /수업 마감/ }));
    await waitFor(() => expect(screen.getByTestId('closeout-next-actions')).toBeInTheDocument());
    expect((upsertMock.mock.calls[0][0] as any).submitted).toBe(true);
  });

  it('이해도 미선택은 3으로 임의 저장하지 않는다', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(screen.getByRole('button', { name: /임시저장/ }));
    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect((upsertMock.mock.calls[0][0] as any).understanding_score).toBeNull();
  });

  it('부분 실패는 성공처럼 보이지 않고 저장된 인원 수를 알린다', async () => {
    const user = userEvent.setup();
    upsertMock.mockImplementationOnce(async () => ({ id: 'rec-1', error: null }));
    upsertMock.mockImplementationOnce(async () => ({ id: null, error: { message: '권한 없음' } }));
    await renderForm();
    await user.click(screen.getByRole('button', { name: /임시저장/ }));
    await waitFor(() => expect(screen.getByText(/1\/2명만 저장/)).toBeInTheDocument());
    expect(screen.queryByTestId('closeout-next-actions')).toBeNull();
  });

  it('저장 중 중복 클릭은 한 번만 처리된다', async () => {
    const user = userEvent.setup();
    let resolve: (v: any) => void = () => {};
    upsertMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    await renderForm();
    const btn = screen.getByRole('button', { name: /임시저장/ });
    await user.click(btn);
    await user.click(btn).catch(() => {});
    expect(upsertMock).toHaveBeenCalledTimes(1);
    resolve({ id: 'rec-1', error: null });
  });

  it('단계 요약이 남은 필수 항목 수를 보여준다', async () => {
    await renderForm();
    expect(screen.getByTestId('closeout-step-summary')).toHaveTextContent('남은 필수 항목 2건');
  });
});
