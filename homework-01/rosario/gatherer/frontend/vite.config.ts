import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy /api to the backend so the SPA can use relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev-only: forward API calls to the local backend. In Docker, nginx
      // proxies /api instead, so this target is irrelevant there.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
