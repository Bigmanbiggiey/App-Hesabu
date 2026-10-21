import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { NOTIFICATIONS_KEY, useMarkRead } from "@/hooks/useNotifications";
import { syncPushSubscription } from "@/lib/push";

/**
 * Connects the service worker's push handling (src/sw.ts) to the signed-in
 * app: refreshes the bell when a push arrives, and opens + marks read the
 * notification the user tapped. Rendered once inside the authenticated layout.
 */
export function NotificationBridge() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutate: markRead } = useMarkRead();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    syncPushSubscription();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const { type, url, id } = event.data ?? {};
      if (type === "NOTIFICATION_RECEIVED") {
        queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      } else if (type === "OPEN_NOTIFICATION") {
        if (id) markRead(id);
        navigate(url || "/");
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate, queryClient, markRead]);

  // Tapped while the app was closed: the worker opened `<url>?notification=<id>`.
  const openedId = params.get("notification");
  useEffect(() => {
    if (!openedId) return;
    markRead(openedId);
    const next = new URLSearchParams(params);
    next.delete("notification");
    setParams(next, { replace: true });
  }, [openedId, markRead, params, setParams]);

  return null;
}
