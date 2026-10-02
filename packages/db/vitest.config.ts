import { defineConfig } from 'vitest/config';

// Database tests run against oda_test (never the dev database), one file at a time because
// they share it and truncate between tests. test/setup.ts points DATABASE_URL at it.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
  },
});
