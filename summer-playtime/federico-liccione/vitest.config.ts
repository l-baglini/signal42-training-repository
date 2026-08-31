import { defineConfig } from 'vitest/config'

// The instruments in tools/ are not tests and must not run in `npm test`.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
