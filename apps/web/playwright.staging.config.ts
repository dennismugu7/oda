import { defineConfig, devices } from '@playwright/test';

// The staging regression (M10 CP6, decision #92): only Actions → staging-regression runs this,
// against staging itself. No local web server, no retries (a step that passes on a second try
// still needs looking at), one test at a time: the steps build on each other.
export default defineConfig({
  testDir: './regression',
  testMatch: '*.regression.ts',
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['./regression/summaryReporter.ts']],
  outputDir: 'regression-output/test-results',
  use: {
    baseURL: 'https://oda-eta.vercel.app',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: 'staging', use: { browserName: 'chromium' } }],
});
