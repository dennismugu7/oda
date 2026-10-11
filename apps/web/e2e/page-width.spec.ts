import type { Page } from '@playwright/test';
import { fillDetails, sellerShop } from './shop';
import { expect, test } from './test';

// No buyer page may be wider than a small phone (360 px, e.g. many Android phones in Kenya):
// a page that scrolls sideways hides buttons and looks broken. The shop's search row once
// measured 406 px because the Chat button sat next to it (now a round icon in the header).
// Long names with long words test that text wraps instead of widening the page.

test.use({ viewport: { width: 360, height: 780 } });

const LONG_SHOP = 'Nyokabiskitengekikoyandkiondoboutique KE'; // 40, the most a shop name takes
const LONG_PRODUCT = 'Handembroideredkitengewrapdresswithbelt and matching headwrap for weddings';
const LONG_AREA = 'Westlandsparklandsandkilimanimainroadside, Nairobi';

async function tooWide(page: Page, name: string): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  await page
    .locator('h1')
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  const w = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    // The widest element, to say what to fix.
    widest: [...document.querySelectorAll('body *')]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > window.innerWidth + 0.5)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3)
      .map(
        ({ el, right }) =>
          `${el.tagName.toLowerCase()} "${((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').slice(0, 40)}" ends at ${Math.round(right)}`,
      ),
  }));
  if (w.html <= 360 && w.body <= 360) return [];
  return [`${name}: html ${w.html} px, body ${w.body} px wide (${w.widest.join('; ')})`];
}

test('every buyer page fits a 360 px screen', async ({ page, request }) => {
  test.setTimeout(150_000);
  const slug = await sellerShop(request, {
    till: true,
    payOnDelivery: true,
    name: LONG_SHOP,
    products: [{ name: LONG_PRODUCT, price: 125_000 }],
    areas: [{ name: LONG_AREA, fee: 350, etaLabel: 'Same day' }],
  });
  const pages: [string, () => Promise<unknown>][] = [
    ['landing', () => page.goto('/')],
    ['privacy', () => page.goto('/privacy')],
    ['terms', () => page.goto('/terms')],
    ['delete account', () => page.goto('/delete-account')],
    ['shop', () => page.goto(`/${slug}`)],
    ['search', () => page.goto(`/${slug}/search?q=Handembroidered`)],
    ['search with filters', () => page.goto(`/${slug}/search?filters=1`)],
    [
      'product',
      async () => {
        await page.goto(`/${slug}`);
        await page.getByRole('link', { name: new RegExp(LONG_PRODUCT) }).click();
        await expect(page.getByRole('heading', { name: LONG_PRODUCT })).toBeVisible();
      },
    ],
    [
      'cart',
      async () => {
        await page.goto(`/${slug}`);
        await page.getByRole('button', { name: `Add ${LONG_PRODUCT} to cart` }).click();
        await page.goto(`/${slug}/cart`);
        await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
      },
    ],
    [
      'checkout',
      async () => {
        await page.goto(`/${slug}/checkout`);
        await expect(page.getByRole('button', { name: /Place order/ })).toBeVisible();
      },
    ],
    [
      'pay page',
      async () => {
        await fillDetails(page);
        await page.getByLabel('Area, street or building').fill('Moi Avenue, Bazaar Plaza');
        await page.getByRole('radio', { name: /Pay now with M-Pesa/ }).check();
        await page.getByRole('button', { name: /Place order/ }).click();
        await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
        await expect(page.getByRole('button', { name: 'Pay on delivery instead' })).toBeVisible();
      },
    ],
    [
      'order page',
      async () => {
        await page.getByRole('button', { name: 'Pay on delivery instead' }).click();
        await expect(page.getByText(`Waiting for ${LONG_SHOP} to accept`)).toBeVisible();
      },
    ],
    ['not found', () => page.goto('/no-such-shop-width')],
  ];
  // Soft: every page is measured and reported, even after one is too wide.
  for (const [name, open] of pages) {
    await open();
    expect.soft(await tooWide(page, name), `${name} fits 360 px`).toEqual([]);
  }
});
