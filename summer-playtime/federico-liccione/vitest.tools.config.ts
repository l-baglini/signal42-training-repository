import { defineConfig } from 'vitest/config'

// The tuning instruments. They assert nothing; they print measurements.
export default defineConfig({
  test: { include: ['tools/**/*.test.ts'] },
})
