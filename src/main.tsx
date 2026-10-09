import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import "./index.css";

// Always unregister any previously installed service workers and wipe their caches.
// The kill-switch worker at /sw.js will also self-unregister on activate, but this
// belt-and-suspenders cleanup ensures users on older builds recover immediately.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
      });
    }).catch(() => {});
  }
}

// Auto-recover from stale chunk errors after a new deploy.
// When the browser tries to load a JS chunk hash that no longer exists,
// reload once to fetch the fresh index.html and updated asset hashes.
const RELOAD_KEY = '__chunk_reload_at';
// 브라우저에 낡은 파일 조합이 남아 React 내부가 비는 경우(예: Cannot read properties of null (reading 'useRef')).
// 코드 문제라기보다 파일 생성이 섞인 상태라, 한 번 새로 고쳐 최신 파일만 다시 읽으면 회복된다.
const REACT_INNER_NULL =
  /Cannot read properties of (?:null|undefined) \(reading '(?:use[A-Z]\w*|createElement|createRef|cloneElement|isValidElement|forwardRef|createContext)'\)/;
function isChunkLoadError(message?: string) {
  if (!message) return false;
  if (REACT_INNER_NULL.test(message)) return true;
  return (
    message.includes('Importing a module script failed') ||
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    /Loading chunk \S+ failed/.test(message)
  );
}
function maybeReload(message?: string) {
  if (!isChunkLoadError(message)) return;
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
  if (Date.now() - last < 10_000) return; // avoid reload loop
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
}
window.addEventListener('error', (e) => maybeReload(e.message));
window.addEventListener('unhandledrejection', (e: any) =>
  maybeReload(e?.reason?.message || String(e?.reason || ''))
);

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
