import { expect, test as base } from '@playwright/test';

// Every spec imports `test` from here (M10 CP1): a page that breaks the Content-Security-Policy
// (a blocked script, style, image, upload or frame) fails its test, so a CSP that is too strict
// can't slip through quietly (decision #81 c).

export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        if (/Content Security Policy/i.test(text)) violations.push(text);
      });
      await use(violations);
      expect(violations, 'the page broke the Content-Security-Policy').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { APIRequestContext, Page } from '@playwright/test';
