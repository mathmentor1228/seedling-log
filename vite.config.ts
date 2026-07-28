import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// NOTE: vite-plugin-pwa has been removed. Previously-installed service workers
// are evicted by the kill-switch worker at public/sw.js.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
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
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
          if (id.includes('katex')) return 'katex';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
        },
      },
    },
  },
}));
