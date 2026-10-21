import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Hesabu — Tax Compliance",
        short_name: "Hesabu",
        description: "eTIMS-integrated accounting for Kenyan SMEs",
        theme_color: "#16a34a",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The SPA fallback must only answer the React app's own routes; these
        // paths are served by Django/nginx (an intercepted /admin/ rendered
        // the React app instead of the Django admin).
        navigateFallbackDenylist: [/^\/(api|admin|static|media)\//],
        // No runtime caching of /api/: responses are one tenant's financial
        // data and must not outlive the session on a (possibly shared) device.
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5175,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
