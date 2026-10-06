import { expect, test } from '@playwright/test';
import { lastEmailTo } from './outbox';
import { sellerEmails, sellerShop } from './shop';

// Self-serve web account deletion (decision #72 c, M8a CP3): the email form answers the same
// for any address; the emailed link opens the confirm page; one button deletes; the shop 404s
// at once; the link works only once.

test('delete-account: email → link → confirm → the shop 404s; the link works once', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request);
  const email = sellerEmails.get(slug)!;

  // An address without an account gets the same answer.
  await page.goto('/delete-account');
  await page.getByLabel('Email').fill('nobody-e2e@example.test');
  await page.getByRole('button', { name: 'Email me the confirm link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto('/delete-account');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me the confirm link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('delete-account-sent-390x844.png') });

  const mail = await lastEmailTo(email);
  const link = /(http\S+\/delete-account\/confirm#token=\S+)/.exec(mail.text)?.[1];
  expect(link).toBeTruthy();
  // The token is only in the fragment, never in the path or a query string.
  expect(new URL(link!).search).toBe('');

  // The shop still works until the link is confirmed.
  expect((await request.get(`/${slug}`)).status()).toBe(200);

  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
  await expect(page.getByText('E2E Boutique')).toBeVisible();
  // The token left the address bar.
  expect(page.url()).not.toContain('token=');
  await page.screenshot({ path: test.info().outputPath('delete-account-confirm-390x844.png') });
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account is deleted' })).toBeVisible();

  const shop = await page.goto(`/${slug}`);
  expect(shop?.status()).toBe(404);

  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'This link was already used' })).toBeVisible();
});

test('a made-up delete link shows the expired page', async ({ page }) => {
  await page.goto('/delete-account/confirm#token=not-a-real-token-but-long-enough-1234');
  await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ask for a new link' })).toBeVisible();
});
