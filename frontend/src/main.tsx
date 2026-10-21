import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./contexts/AuthContext";
import { purgeLegacyApiCache } from "./lib/session";
import "./lib/pwa"; // starts listening for beforeinstallprompt before React mounts

// The notification panel is a native popover: Baseline only since 2025 (iOS
// before 18.3 lacks it), so load the polyfill only where it's missing.
if (!("popover" in HTMLElement.prototype)) {
  import("@oddbird/popover-polyfill");
}

purgeLegacyApiCache();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
);
