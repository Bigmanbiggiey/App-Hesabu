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
      // "prompt": a new service worker waits until the user accepts the
      // "new version" toast (UpdatePrompt), instead of taking over mid-task.
      registerType: "prompt",
      // Registration happens in AppStatus via virtual:pwa-register/react.
      injectRegister: false,
      // Our own service worker (src/sw.ts): precaching and the SPA fallback
      // as before, plus Web Push display and notification clicks.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["logo.svg", "icons/*.png"],
      manifest: {
        id: "/",
        name: "Hesabu — Invoicing & Tax Compliance",
        short_name: "Hesabu",
        description:
          "eTIMS invoicing, M-Pesa payments and KRA tax returns for Kenyan businesses",
        lang: "en-KE",
        dir: "ltr",
        theme_color: "#007c1a",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["finance", "business", "productivity"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "New invoice", url: "/invoices/new", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          { name: "M-Pesa payments", url: "/payments", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          { name: "Tax returns", url: "/taxes", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
        ],
        screenshots: [
          { src: "screenshots/dashboard-narrow.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Dashboard" },
          { src: "screenshots/invoices-narrow.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Invoices" },
          { src: "screenshots/dashboard-wide.png", sizes: "1920x1200", type: "image/png", form_factor: "wide", label: "Dashboard" },
        ],
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
