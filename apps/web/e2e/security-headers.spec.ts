import { expect, test } from './test';

// M10 CP1 (decision #81 c): every page carries a strict, per-request nonce CSP and the other
// security headers; API answers allow nothing to render. The CSP fixture in ./test fails any
// spec whose page breaks the policy.

test('pages: a fresh nonce CSP and the security headers', async ({ page, request }) => {
  const first = await request.get('/privacy');
  const second = await request.get('/privacy');
  const csp = first.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain('unsafe-eval');
  const nonce = (h: string) => /'nonce-([^']+)'/.exec(h)![1];
  expect(nonce(csp)).not.toBe(nonce(second.headers()['content-security-policy'] ?? ''));
  // Next.js puts the request's nonce on its scripts.
  expect(await first.text()).toContain(`nonce="${nonce(csp)}"`);

  const headers = first.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');

  // The page still works with the policy on (hydrated: client navigation).
  await page.goto('/privacy');
  await expect(page.locator('h1')).toBeVisible();
});

test('API answers: nothing may render', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.headers()['content-security-policy']).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});
