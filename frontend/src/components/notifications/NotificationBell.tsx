import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Bell, CalendarClock, Clock, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type AppNotification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";

const PANEL_ID = "notifications-panel";

const KIND_ICON: Record<AppNotification["kind"], React.ElementType> = {
  payment_received: Smartphone,
  etims_rejected: AlertTriangle,
  invoices_overdue: Clock,
  filing_reminder: CalendarClock,
  test: Bell,
};

/**
 * Bell + notification panel. The panel is a native popover (top layer,
 * light dismiss, Esc to close) opened by `popovertarget`; it sits at a fixed
 * spot under the top bar rather than using anchor positioning, which most
 * browsers don't support yet. See `.notifications-panel` in index.css.
 */
export function NotificationBell() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: unread = 0 } = useUnreadCount();
  const { data, isLoading } = useNotifications(open);
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAllRead } = useMarkAllRead();
  const notifications = data?.results ?? [];

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    panel.addEventListener("toggle", onToggle);
    return () => panel.removeEventListener("toggle", onToggle);
  }, []);

  const go = (url: string) => {
    panelRef.current?.hidePopover();
    navigate(url);
  };

  const openNotification = (n: AppNotification) => {
    if (!n.read_at) markRead(n.id);
    go(n.url || "/");
  };

  return (
    <>
      <button
        type="button"
        popoverTarget={PANEL_ID}
        className="relative rounded-lg p-2 text-muted hover:bg-brand-50"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <div id={PANEL_ID} ref={panelRef} popover="auto" className="notifications-panel">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-text">Notifications</h2>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead()}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              <Bell className="mx-auto mb-2 h-6 w-6" />
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-50",
                        !n.read_at && "bg-brand-50/40",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          n.kind === "etims_rejected" || n.kind === "invoices_overdue"
                            ? "text-danger"
                            : "text-brand-600",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm text-text", !n.read_at && "font-semibold")}>
                          {n.title}
                        </span>
                        <span className="block text-sm text-muted">{n.body}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </span>
                      {!n.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => go("/settings?tab=notifications")}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Notification settings
          </button>
        </div>
      </div>
    </>
  );
}
