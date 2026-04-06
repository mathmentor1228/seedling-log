import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Service worker management: only keep SW for /student/ routes (PWA)
// For all other routes, aggressively unregister to prevent stale cache issues
if ('serviceWorker' in navigator) {
  const isStudentRoute = window.location.pathname.startsWith('/student');

  if (!isStudentRoute) {
    // Non-student pages: unregister ALL service workers to prevent stale cache
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
    // Also clear all caches created by workbox
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name);
        });
      });
    }
  } else {
    // Student pages: only update existing student-scoped SW
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.update();
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
