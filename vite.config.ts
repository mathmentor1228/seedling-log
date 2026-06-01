import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: '더멘토 학생',
        short_name: '더멘토',
        description: '더멘토학원 학생용 숙제 제출 및 학습 현황 앱',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/student/',
        start_url: '/student/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Only precache the app shell - NOT all JS bundles
        globPatterns: ['**/*.{ico,png,svg,woff2}'],
        // Skip waiting so new SW activates immediately
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/storage/, /^\/report\//, /^\/parent/, /^\/trial/, /^\/quiz-/],
        // No runtime caching - let the browser handle API freshness
        runtimeCaching: [],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Only split the very large, self-contained libraries that aren't
        // needed on initial load. Splitting recharts/d3/radix/etc. by hand
        // caused TDZ errors ("Cannot access 'P' before initialization")
        // due to circular imports between split chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
          if (id.includes('katex')) return 'katex';
        },
      },
    },
  },
}));
