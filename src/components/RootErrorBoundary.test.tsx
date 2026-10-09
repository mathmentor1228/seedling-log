import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootErrorBoundary } from './RootErrorBoundary';

// 브라우저에 낡은 파일 조합이 남아 React 내부가 비었을 때 실제 나는 오류.
const STALE_CACHE_MESSAGE = "Cannot read properties of null (reading 'useRef')";

function Boom(): JSX.Element {
  throw new TypeError(STALE_CACHE_MESSAGE);
}

function BoomChild() {
  return <Boom />;
}

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  });

  it('문제가 없으면 자식을 그대로 보여준다', () => {
    render(
      <RootErrorBoundary>
        <p>정상 화면</p>
      </RootErrorBoundary>,
    );
    expect(screen.getByText('정상 화면')).toBeInTheDocument();
    expect(screen.queryByText('화면을 불러오지 못했습니다')).not.toBeInTheDocument();
  });

  it('React 내부가 비는 렌더 오류를 잡고 새로고침 안내를 보여준다', () => {
    render(
      <RootErrorBoundary>
        <BoomChild />
      </RootErrorBoundary>,
    );
    expect(screen.getByText('화면을 불러오지 못했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
  });

  it('처음 잡았을 때는 자동 새로고침을 한 번 시도한다', () => {
    render(
      <RootErrorBoundary>
        <BoomChild />
      </RootErrorBoundary>,
    );
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem('__chunk_reload_at'))).toBeGreaterThan(0);
  });

  it('안내의 새로고침 단추를 누르면 다시 시도한다', async () => {
    render(
      <RootErrorBoundary>
        <BoomChild />
      </RootErrorBoundary>,
    );
    const reload = window.location.reload as unknown as ReturnType<typeof vi.fn>;
    reload.mockClear();
    await userEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
