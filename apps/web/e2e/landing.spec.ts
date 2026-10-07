import { expect, test } from './test';

test('landing page renders in Poppins and brand colours', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Turn your posts into orders.' });
  await expect(heading).toBeVisible();

  const font = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).toMatch(/Poppins/i);

  const logo = page.getByLabel('oda');
  const logoColour = await logo.evaluate((el) => getComputedStyle(el).color);
  expect(logoColour).toBe('rgb(217, 74, 39)'); // #D94A27

  // Without APP_DOWNLOAD_URL the store button is a placeholder (decision #59).
  await expect(page.getByText('Coming soon to Google Play')).toBeVisible();
  await expect(page.getByRole('link', { name: 'support@mugu-labs.com' })).toBeVisible();

  // Saved for side-by-side comparison with design/ (not a pixel baseline: fonts render differently per OS).
  await page.screenshot({
    path: test.info().outputPath('landing-390x844.png'),
    fullPage: true,
  });
});

test('health endpoint reports the database', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, db: 'up' });
});
