import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Keeps everything same-origin in dev, so the CSP below can stay strict.
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
