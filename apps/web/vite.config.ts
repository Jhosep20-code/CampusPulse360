import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Agrupa dependencias pesadas en chunks propios para que el bundle inicial no cargue 3D ni graficas. */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return "react";
  if (/node_modules\/(three|@react-three|three-stdlib|three-mesh-bvh|meshline|troika-[^/]+|camera-controls|maath|zustand|its-fine|react-use-measure|suspend-react|its-fine|stats-gl|@use-gesture|detect-gpu|hls\.js|bidi-js|webgl-sdf-generator|@monogrid)\//.test(id))
    return "twin";
  // recharts no se agrupa a mano: queda en el chunk diferido de SpaceDetail
  // (agruparlo arrastraba helpers compartidos al bundle inicial).
  return undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: { manualChunks },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
  },
});
