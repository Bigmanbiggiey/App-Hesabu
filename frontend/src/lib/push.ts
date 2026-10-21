import api from "./api";
import { isIos, isStandalone } from "./pwa";

/**
 * Push on this device:
 * - unsupported: the browser has no Web Push
 * - needs-install: iOS/iPadOS only offers push to apps added to the Home Screen
 * - denied: the user blocked notifications in browser/OS settings
 * - off / on: whether this device is subscribed
 */
export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const SUBSCRIPTION_URL = "/notifications/push/subscription/";

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

// VAPID keys travel base64url-encoded; PushManager wants the raw bytes.
function base64UrlToBytes(value: string): Uint8Array {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Ask permission (call from a click handler) and register this device. */
export async function enablePush(): Promise<PushState> {
  const { data } = await api.get<{ public_key: string }>("/notifications/push/key/");
  if (!data.public_key) throw new Error("Push notifications aren't set up on the server yet.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(data.public_key),
    }));
  await api.post(SUBSCRIPTION_URL, subscription.toJSON());
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await api.delete(SUBSCRIPTION_URL, { data: subscription.toJSON() }).catch(() => {});
    await subscription.unsubscribe();
  }
  return "off";
}

/**
 * Make sure the server ties this device's subscription to the signed-in
 * user (e.g. after the database was reset, or a previous user's logout
 * couldn't reach the server).
 */
export async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (subscription) await api.post(SUBSCRIPTION_URL, subscription.toJSON()).catch(() => {});
}

/**
 * On an explicit logout: stop this device receiving the user's notifications
 * (shared devices). An expired session doesn't do this, so a phone left idle
 * for a week keeps its alerts; whoever logs in next is re-linked to the
 * device by syncPushSubscription.
 *
 * The browser-side unsubscribe is what matters (the server prunes the dead
 * endpoint on its next push); the server call is a courtesy and passes the
 * token explicitly because logout clears it right after.
 */
export async function unsubscribeOnLogout(accessToken: string | null) {
  if (!pushSupported()) return;
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  if (accessToken) {
    api
      .delete(SUBSCRIPTION_URL, {
        data: subscription.toJSON(),
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .catch(() => {});
  }
  await subscription.unsubscribe().catch(() => {});
}
