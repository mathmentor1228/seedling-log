import { createRoot } from "react-dom/client";
import App from "./App.tsx";
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
function isChunkLoadError(message?: string) {
  if (!message) return false;
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

createRoot(document.getElementById("root")!).render(<App />);
