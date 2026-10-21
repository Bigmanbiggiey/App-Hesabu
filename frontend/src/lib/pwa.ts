import { useSyncExternalStore } from "react";

// ── Install prompt ────────────────────────────────────────────────────────────
// Chromium fires `beforeinstallprompt` once, often before React has mounted, so
// the listener is registered when this module is first imported (main.tsx).

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((l) => l());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // keep the mini-infobar away; we offer our own button
  deferredPrompt = e as BeforeInstallPromptEvent;
  emitInstall();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  emitInstall();
});

function subscribeInstall(listener: () => void) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS/iPadOS have no install prompt API; users add the app from the Share menu. */
export function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export type InstallMode = "prompt" | "ios" | null;

/**
 * How Hesabu can be installed here: "prompt" (the browser's own dialog is
 * available), "ios" (show Add to Home Screen steps), or null (already
 * installed, or the browser offers no install path).
 */
export function useInstallMode(): InstallMode {
  const hasPrompt = useSyncExternalStore(subscribeInstall, () => deferredPrompt !== null);
  if (isStandalone()) return null;
  if (hasPrompt) return "prompt";
  if (isIos()) return "ios";
  return null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null; // a prompt event can only be used once
  emitInstall();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

// ── Connectivity ──────────────────────────────────────────────────────────────

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
