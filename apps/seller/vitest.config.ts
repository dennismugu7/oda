import { defineConfig } from 'vitest/config';

// Plain TypeScript logic only (decision #40): screens are checked by hand on the Redmi.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
