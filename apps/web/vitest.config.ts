import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Local runs read DATABASE_URL from .env.local (CI sets it in the environment and has no
// such file); test/setup.ts then switches every worker to the oda_test database.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': here('.'),
      'server-only': here('./test/server-only-stub.ts'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next', 'e2e'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Server tests share oda_test and truncate it, so files run one at a time.
    fileParallelism: false,
  },
});
