import { useEffect, useState } from "react";
import { BellOff, BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InstallButton } from "@/components/pwa/Install";
import { useAuth } from "@/hooks/useAuth";
import {
  type NotificationPreferences,
  useNotificationPreferences,
  useSendTestNotification,
  useUpdateNotificationPreferences,
} from "@/hooks/useNotifications";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

const KINDS: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  { key: "payment_received", label: "M-Pesa payments", hint: "A payment arrives, or needs allocating to an invoice" },
  { key: "etims_rejected", label: "eTIMS rejections", hint: "KRA rejects an invoice submission" },
  { key: "invoices_overdue", label: "Overdue invoices", hint: "Daily summary when invoices pass their due date" },
  { key: "filing_reminder", label: "Filing reminders", hint: "3 days before the VAT (20th) and PAYE (9th) deadlines" },
];

const DEVICE_MESSAGE: Record<PushState, string> = {
  unsupported: "This browser doesn't support push notifications. You'll still see them under the bell.",
  "needs-install":
    "On iPhone and iPad, push notifications work once Hesabu is installed: tap Share → Add to Home Screen, then open Hesabu from your home screen.",
  denied:
    "Notifications are blocked for Hesabu. Allow them in your browser or phone settings, then reload this page.",
  off: "Get alerts on this device even when Hesabu is closed.",
  on: "Push notifications are on for this device.",
};

export function NotificationSettings() {
  const { user } = useAuth();
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testSent, setTestSent] = useState(false);
  const { data: prefs } = useNotificationPreferences();
  const { mutate: updatePrefs } = useUpdateNotificationPreferences();
  const sendTest = useSendTestNotification();

  useEffect(() => {
    getPushState().then(setPushState);
  }, []);

  const toggleDevice = async () => {
    setBusy(true);
    setError("");
    try {
      setPushState(await (pushState === "on" ? disablePush() : enablePush()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change push notifications.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold text-text">This device</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border p-4">
          {pushState === "on" ? (
            <BellRing className="h-5 w-5 shrink-0 text-brand-600" />
          ) : (
            <BellOff className="h-5 w-5 shrink-0 text-muted" />
          )}
          <p className="min-w-0 flex-1 text-sm text-text">
            {pushState ? DEVICE_MESSAGE[pushState] : "Checking…"}
          </p>
          {(pushState === "off" || pushState === "on") && (
            <Button
              size="sm"
              variant={pushState === "on" ? "secondary" : "primary"}
              loading={busy}
              onClick={toggleDevice}
            >
              {pushState === "on" ? "Turn off" : "Turn on"}
            </Button>
          )}
          {pushState === "needs-install" && <InstallButton />}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            loading={sendTest.isPending}
            onClick={() => sendTest.mutate(undefined, { onSuccess: () => setTestSent(true) })}
          >
            <Send className="h-3.5 w-3.5" />
            Send a test notification
          </Button>
          {testSent && (
            <span role="status" className="text-sm text-muted">
              Sent. Check the bell{pushState === "on" ? " and this device's notifications" : ""}.
            </span>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-text">Push me about</h2>
          <p className="text-sm text-muted">Applies to all your devices. Everything still appears under the bell.</p>
        </div>
        <div className="divide-y divide-border rounded-card border border-border">
          {KINDS.map(({ key, label, hint }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-brand-600"
                checked={prefs?.[key] ?? true}
                disabled={!prefs}
                onChange={(e) => updatePrefs({ [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
        {user?.role === "staff" && (
          <p className="text-xs text-muted">
            These alerts go to owners, admins and accountants. Ask an owner to change your role if
            you need them.
          </p>
        )}
      </section>
    </div>
  );
}
