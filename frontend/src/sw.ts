/// <reference lib="webworker" />
// Hesabu service worker (vite-plugin-pwa "injectManifest"). Built separately
// from the app; type-checked by tsconfig.sw.json.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

// ── App shell ────────────────────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA fallback for the React app's own routes only: these paths belong to
// Django/nginx (serving index.html for /admin/ hid the Django admin). There is
// deliberately no runtime caching of /api/: tenant financial data must not
// outlive the session on the device.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/(api|admin|static|media)\//],
  }),
);

// registerType "prompt": the waiting worker takes over only when the user
// clicks Reload in the update toast (AppStatus → updateServiceWorker).
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ── Push ─────────────────────────────────────────────────────────────────────
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  id?: string;
  tag?: string;
}

async function postToClients(message: object) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(message));
}

self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Hesabu", {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png", // monochrome status-bar icon on Android
        tag: data.tag,
        data: { url: data.url || "/", id: data.id },
      }),
      // Open tabs refresh the bell's unread count.
      postToClients({ type: "NOTIFICATION_RECEIVED" }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url = "/", id } = (event.notification.data ?? {}) as { url?: string; id?: string };
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const app = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (app) {
        // Navigate inside the running SPA (keeps its state) and let it mark
        // the notification read: the worker has no access to the user's token.
        // Message first: focus() is only allowed with a user gesture and can
        // reject, which mustn't stop the navigation.
        app.postMessage({ type: "OPEN_NOTIFICATION", url, id });
        await app.focus().catch(() => {});
      } else {
        const target = new URL(url, self.location.origin);
        if (id) target.searchParams.set("notification", id);
        await self.clients.openWindow(target.href);
      }
    })(),
  );
});
