import { RefreshCw, WifiOff } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/Button";
import { useOnline } from "@/lib/pwa";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * App-wide status toasts, pinned to the bottom of the screen on every route:
 * "you're offline" and "a new version is ready". Also owns service-worker
 * registration (registerType "prompt", injectRegister false in vite.config).
 */
export function AppStatus() {
  const online = useOnline();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // A long-lived tab or installed app may never navigate again, so poll for
    // a new deploy instead of waiting for the next page load.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (online && !needRefresh) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {!online && (
        <div
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-card bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You&apos;re offline. Hesabu needs a connection to load or save data.</span>
        </div>
      )}
      {needRefresh && (
        <div
          role="status"
          className="pointer-events-auto flex max-w-md flex-wrap items-center gap-3 rounded-card border border-border bg-white px-4 py-3 text-sm shadow-lg"
        >
          <RefreshCw className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="flex-1">A new version of Hesabu is available.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
              Later
            </Button>
            <Button size="sm" onClick={() => updateServiceWorker(true)}>
              Reload
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
