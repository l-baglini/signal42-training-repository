import { defineConfig } from 'vite'

// Relative base so the built page works from any static path, including the
// gh-pages subdirectory the demo will be served from.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
})
