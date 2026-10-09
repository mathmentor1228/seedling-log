// ROOT-ERROR-BOUNDARY-V1: 루트 렌더가 깨지면 화면이 하얗게만 남는다. 최상위에서 잡아 "새로고침" 안내로 바꾼다.
// 브라우저에 낡은 파일 조합이 남아 React 내부가 비는 상태(예: Cannot read properties of null (reading 'useRef'))처럼
// 코드와 무관한 이유로 렌더가 죽어도 사용자에게는 빈 화면 대신 회복 안내를 보여준다.
import { Component, type ErrorInfo, type ReactNode } from "react";

// main.tsx의 자동 재시도(key: __chunk_reload_at)와 같은 잠금장치를 쓴다 — reload 루프 방지.
const RELOAD_KEY = "__chunk_reload_at";
const RELOAD_COOLDOWN_MS = 10_000;

function tryAutoReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  } catch {
    // sessionStorage를 쓸 수 없는 환경이면 그냥 안내만 보여준다.
  }
}

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("루트 렌더 실패:", error, info.componentStack);
    tryAutoReload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-lg">
          <h1 className="text-base font-semibold text-foreground">화면을 불러오지 못했습니다</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            새로고침하면 다시 시도합니다. 대부분은 이대로 돌아옵니다.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            새로고침
          </button>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            같은 안내가 계속되면 브라우저 캐시를 비우거나 잠시 후 다시 시도해 주세요.
          </p>
        </div>
      </div>
    );
  }
}
