import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API calls go to /api and are proxied to the FastAPI backend in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ["recharts"], vendor: ["react", "react-dom", "react-router-dom"] } },
    },
  },
});
