import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/serviceWorker";
import { applyTheme, watchSystemTheme } from "./lib/theme";

// Apply theme early only if a Supabase session already exists — avoids a
// light→dark flash for returning signed-in users, while keeping the landing
// page in light mode for signed-out visitors.
const hasSession = (() => {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch { /* ignore */ }
  return false;
})();

if (hasSession) applyTheme();
watchSystemTheme();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();
