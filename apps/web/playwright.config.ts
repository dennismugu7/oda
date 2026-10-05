import { defineConfig, devices } from '@playwright/test';
import { E2E_OUTBOX_DIR } from './e2e/outbox';

// E2E_PORT when 3100 is taken (e.g. by another project's server on this machine).
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './test/e2eGlobalSetup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // Buyer web reference viewport (docs/milestones.md): 390×844, Android Chrome.
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: 'mobile-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `pnpm exec next start --port ${port}`,
    url: `http://localhost:${port}`,
    // Emails go to a file outbox the tests read (e2e/outbox.ts); links point at this server.
    env: {
      EMAIL_TRANSPORT: 'file',
      OUTBOX_DIR: E2E_OUTBOX_DIR,
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
    // Never reuse a server we didn't start: one on this port may be another app entirely, and
    // every test would then fail (or pass) against the wrong thing. A taken port fails loudly.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
