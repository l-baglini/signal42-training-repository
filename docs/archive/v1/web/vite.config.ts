/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local-only app: no proxy, no external services. `vite preview`/`dev` serve
// purely static assets; the camera feed never leaves the browser.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    // core/ is framework-free pure logic — Node environment is sufficient and fast.
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
