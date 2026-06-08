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

createRoot(document.getElementById("root")!).render(<App />);
