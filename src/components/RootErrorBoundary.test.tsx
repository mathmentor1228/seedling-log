import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootErrorBoundary } from './RootErrorBoundary';

// 브라우저에 낡은 파일 조합이 남아 React 내부가 비었을 때 실제 나는 오류.
const STALE_CACHE_MESSAGE = "Cannot read properties of null (reading 'useRef')";
const RELOAD_KEY = '__chunk_reload_at';

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
    // 새로고침 요청의 관찰 가능한 증거: main.tsx와共用하는 재시도 잠금장치가 기록된다.
    expect(Number(sessionStorage.getItem(RELOAD_KEY))).toBeGreaterThan(0);
  });

  it('방금 재시도한 직후면 다시 새로고침하지 않는다 (루프 방지)', () => {
    const justNow = String(Date.now() - 1_000);
    sessionStorage.setItem(RELOAD_KEY, justNow);
    render(
      <RootErrorBoundary>
        <BoomChild />
      </RootErrorBoundary>,
    );
    expect(screen.getByText('화면을 불러오지 못했습니다')).toBeInTheDocument();
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(justNow);
  });
});
