import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/webhook": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/steam": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          // React core — loaded on every page
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/react-router") ||
            id.includes("/react-router-dom/")
          ) return "vendor-react";
          // Animation
          if (id.includes("/framer-motion/") || id.includes("/motion/")) return "vendor-motion";
          // Data fetching
          if (id.includes("/@tanstack/")) return "vendor-query";
          // i18n
          if (id.includes("/i18next") || id.includes("/react-i18next/")) return "vendor-i18n";
          // Charts — heavy, only Dashboard uses them
          if (
            id.includes("/recharts/") ||
            id.includes("/d3-") ||
            id.includes("/victory-") ||
            id.includes("/internmap/")
          ) return "vendor-charts";
          // Everything else (axios, sonner, zod, lucide, react-hook-form, zustand…)
          return "vendor";
        },
      },
    },
  },
});
