import type { Page } from '@playwright/test';
import { addDressAndBag, placePayNowOrder, sellerShop } from './shop';
import { expect, test } from './test';

// M10 CP3 accessibility (decision #84), without a new dependency: on every buyer page, each
// image has alt text (empty for decoration), each button, link and form field has a name a
// screen reader can read, and buttons are at least 44 × 44 px (links inside running text are
// exempt, as in WCAG 2.5.8).

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    // The browser's own check: also hidden inside a closed <details> (content-visibility).
    const visible = (el: Element) =>
      el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) &&
      !el.closest('[aria-hidden="true"]');
    const named = (el: Element) => {
      const label = el.getAttribute('aria-label')?.trim();
      const by = el
        .getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join('');
      const text = (el as HTMLElement).innerText?.trim();
      const imgAlt = [...el.querySelectorAll('img[alt]')]
        .map((i) => i.getAttribute('alt'))
        .join('');
      const title = el.getAttribute('title');
      return !!(label || by || text || imgAlt || title);
    };
    const what = (el: Element) =>
      `${el.tagName.toLowerCase()} "${((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.outerHTML).slice(0, 60)}"`;
    for (const img of document.querySelectorAll('img')) {
      if (!img.hasAttribute('alt') && visible(img)) out.push(`no alt: ${img.src.slice(-50)}`);
    }
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      if (!visible(el)) continue;
      if (!named(el)) out.push(`no name: ${what(el)}`);
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      const r = el.getBoundingClientRect();
      if (!inline && (r.width < 44 || r.height < 44)) {
        out.push(`smaller than 44px (${Math.round(r.width)}×${Math.round(r.height)}): ${what(el)}`);
      }
    }
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const input = el as HTMLInputElement;
      if (input.type === 'hidden' || !visible(el)) continue;
      const hasLabel = (input.labels?.length ?? 0) > 0 || named(el) || !!input.placeholder;
      if (!hasLabel) out.push(`field without a label: ${what(el)}`);
    }
    if (!document.querySelector('h1')) out.push('no h1');
    if (!document.documentElement.lang) out.push('no lang');
    return out;
  });
}

test('buyer pages: names, labels, alt text and 44 px buttons', async ({ page, request }) => {
  test.setTimeout(120_000);
  const slug = await sellerShop(request, { till: true, payOnDelivery: true });
  const pages: [string, () => Promise<unknown>][] = [
    ['landing', () => page.goto('/')],
    ['shop', () => page.goto(`/${slug}`)],
    ['search', () => page.goto(`/${slug}/search?q=wrap`)],
    [
      'product',
      async () => {
        await page.goto(`/${slug}`);
        await page.getByRole('link', { name: /Kitenge wrap dress KES/ }).click();
        await expect(page.getByRole('heading', { name: 'Kitenge wrap dress' })).toBeVisible();
      },
    ],
    [
      'cart',
      async () => {
        await addDressAndBag(page, slug);
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
        await page.evaluate(() => localStorage.clear()); // a fresh cart
        await placePayNowOrder(page, slug);
      },
    ],
    ['delete account', () => page.goto('/delete-account')],
    ['privacy', () => page.goto('/privacy')],
    ['terms', () => page.goto('/terms')],
    ['not found', () => page.goto('/no-such-shop-a11y')],
  ];
  const found: string[] = [];
  for (const [name, open] of pages) {
    await open();
    // Past the loading skeleton: the real page has its h1.
    await page.waitForLoadState('networkidle');
    await page
      .locator('h1')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    for (const p of await problems(page)) found.push(`${name}: ${p}`);
  }
  expect(found).toEqual([]);
});
