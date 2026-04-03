import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const scopePath = new URL(registration.scope).pathname;
      const isStudentScope = scopePath.startsWith('/student/');

      if (window.location.pathname.startsWith('/student/')) {
        if (isStudentScope) {
          registration.update();
        }
        continue;
      }

      registration.unregister();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
