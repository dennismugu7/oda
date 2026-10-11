import { expect, test } from './test';
import { appHeaders, createVerifiedSeller, lastEmailTo, randomIp } from './outbox';

// Web reset pages 07 and 08, end to end: request a reset like the app does, open the
// emailed link, choose a new password, and sign in with it.

const PASSWORD = 'kitenge2026';
const NEW_PASSWORD = 'newpass2026';

test('reset password from the emailed link', async ({ page, request }) => {
  const ip = randomIp();
  const email = `reset-${Date.now()}@example.test`;
  await createVerifiedSeller(request, email, PASSWORD, ip);

  const ask = await request.post('/api/auth/request-password-reset', {
    data: { email },
    headers: appHeaders(ip),
  });
  expect(ask.status()).toBe(200);
  const reset = await lastEmailTo(email, (m) => m.subject === 'Reset your oda password');
  expect(reset.subject).toBe('Reset your oda password');
  // The token rides in the fragment, never in a URL a server logs (decision #45).
  const link = /https?:\/\/\S+\/reset-password#token=\S+/.exec(reset.text)?.[0];
  expect(link).toBeTruthy();
  const url = new URL(link!);

  // 07
  await page.goto(url.pathname + url.hash);
  const heading = page.getByRole('heading', { name: 'Choose a new password' });
  await expect(heading).toBeVisible();
  // Once read, the token is gone from the address bar and history.
  expect(new URL(page.url()).hash).toBe('');
  expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
    /Bricolage Grotesque/i,
  );
  await page.screenshot({ path: test.info().outputPath('07-reset-password-390x844.png') });

  const newPassword = page.getByLabel('New password', { exact: true });
  const again = page.getByLabel('Re-enter new password');
  const submit = page.getByRole('button', { name: 'Reset password' });
  const error = page.getByRole('alert').first();

  // Rules tick as the seller types.
  await newPassword.fill('kitenge');
  await expect(page.getByText('At least one number')).toHaveAttribute('data-ok', 'false');
  await submit.click();
  await expect(error).toHaveText('Use at least 8 characters.');

  await newPassword.fill('kitengedress');
  await expect(error).toHaveText('Include at least one number.');

  await newPassword.fill(NEW_PASSWORD);
  await expect(page.getByText('At least one number')).toHaveAttribute('data-ok', 'true');
  await again.fill('different2026');
  await submit.click();
  await expect(error).toHaveText("The passwords don't match.");

  // Show / hide
  await expect(newPassword).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).first().click();
  await expect(newPassword).toHaveAttribute('type', 'text');

  await again.fill(NEW_PASSWORD);
  await submit.click();

  // 08
  await expect(page).toHaveURL(/\/reset-password\/done$/);
  await expect(page.getByRole('heading', { name: 'Password changed!' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open oda app' })).toHaveAttribute(
    'href',
    'oda://sign-in',
  );
  await expect(page.getByText('Or open the oda app on your phone and sign in.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('08-password-changed-390x844.png') });

  // The new password works, the old one doesn't.
  const signIn = (password: string) =>
    request.post('/api/auth/sign-in/email', {
      data: { email, password },
      headers: appHeaders(ip),
    });
  expect((await signIn(PASSWORD)).status()).toBe(401);
  expect((await signIn(NEW_PASSWORD)).status()).toBe(200);

  // The link works once.
  await page.goto(url.pathname + url.hash);
  await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
});

test('a made-up, missing or query-string token shows the expired-link page', async ({ page }) => {
  for (const path of [
    '/reset-password#token=not-a-real-token-123',
    '/reset-password',
    '/reset-password?token=query-tokens-are-ignored',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open oda app' })).toHaveAttribute(
      'href',
      'oda://sign-in',
    );
  }
  await page.screenshot({ path: test.info().outputPath('07-expired-link-390x844.png') });
});

test('the reset page never sends a referrer to other sites', async ({ page }) => {
  await page.goto('/reset-password#token=abc');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});

test('the local email outbox shows the codes (on Vercel it is a 404: unit tests)', async ({
  page,
  request,
}) => {
  const email = `outbox-${Date.now()}@example.test`;
  const res = await request.post('/api/signup/start', {
    data: { email, password: PASSWORD },
    headers: appHeaders(randomIp()),
  });
  expect(res.status()).toBe(200);
  await page.goto('/dev/outbox');
  await expect(page.getByRole('heading', { name: 'Email outbox' })).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();
});
