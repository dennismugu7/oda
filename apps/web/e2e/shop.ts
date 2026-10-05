import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { jpeg } from '../test/imageFixtures';
import { setDeliveryOptions } from '../test/e2eShop';
import { appHeaders, createVerifiedSeller, randomIp } from './outbox';

// A shop for the buyer tests, built the way a seller builds it (M4), plus the delivery
// options a seller can only add from M6 on (written straight to the database).

const PASSWORD = 'kitenge2026';

export interface ShopOptions {
  /** A Till at onboarding step 5 (pay now); otherwise step 5 is skipped (pay on delivery). */
  till?: boolean;
  /** Pay on delivery as well as pay now (with `till`). */
  payOnDelivery?: boolean;
  /** Delivery areas / pickup (no seller API until M6); default one area, CBD KES 200. */
  areas?: { name: string; fee: number; etaLabel?: string; freeDeliveryEligible?: boolean }[];
  pickup?: boolean;
  freeDeliveryThreshold?: number | null;
}

/**
 * A seller sets up a shop through the real API (sign-up, onboarding, signed uploads,
 * products): "Kitenge wrap dress" (KES 2,500, sizes M/L) and "Woven kiondo bag" (KES 1,800).
 */
export async function sellerShop(request: APIRequestContext, opts: ShopOptions = {}) {
  const ip = randomIp();
  const email = `shop-${Date.now()}@example.test`;
  await createVerifiedSeller(request, email, PASSWORD, ip);
  const signIn = await request.post('/api/auth/sign-in/email', {
    data: { email, password: PASSWORD },
    headers: appHeaders(ip),
  });
  expect(signIn.status()).toBe(200);
  const { token } = (await signIn.json()) as { token: string };
  const headers = { ...appHeaders(ip), authorization: `Bearer ${token}` };
  const post = async (path: string, data: unknown, status = 200) => {
    const res = await request.post(path, { data, headers });
    expect(res.status(), path).toBe(status);
    return res.json();
  };
  const photo = async () => {
    const file = jpeg();
    const pair = [];
    for (let i = 0; i < 2; i++) {
      const up = await post('/api/uploads', {
        kind: 'product',
        contentType: 'image/jpeg',
        size: file.length,
      });
      const put = await request.fetch(up.url, { method: 'PUT', headers: up.headers, data: file });
      expect(put.status()).toBeLessThan(300);
      pair.push(up.key as string);
    }
    return { objectKey: pair[0], thumbKey: pair[1], width: 1200, height: 1200 };
  };

  const slug = `e2e-${Date.now().toString(36)}`;
  await post('/api/onboarding/answers', { step: 1, businessType: 'fashion' });
  await post('/api/onboarding/answers', { step: 2, skip: true });
  // Step 3 twice: going back to change the link leaves the first one in the slug history.
  const shop = { name: 'E2E Boutique', whatsappPhone: '0712345678' };
  await post('/api/onboarding/shop', { ...shop, slug: `${slug}-old` });
  await post('/api/onboarding/shop', { ...shop, slug });
  await post('/api/onboarding/product', {
    name: 'Kitenge wrap dress',
    price: 2500,
    sizes: ['M', 'L'],
    photos: [await photo()],
  });
  await post(
    '/api/onboarding/payment',
    opts.till ? { type: 'till', number: '5123456', accountName: 'E2E BOUTIQUE' } : { skip: true },
  );
  await post(
    '/api/products',
    { name: 'Woven kiondo bag', price: 1800, photos: [await photo()] },
    201,
  );
  await setDeliveryOptions(slug, {
    areas: opts.areas ?? [{ name: 'CBD', fee: 200, etaLabel: 'Same day' }],
    pickup: opts.pickup,
    freeDeliveryThreshold: opts.freeDeliveryThreshold,
    payOnDelivery: opts.till ? !!opts.payOnDelivery : true,
  });
  return slug;
}

/** Buyer: the bag (quick add) and the dress in M, then the cart (KES 4,300). */
export async function addDressAndBag(page: Page, slug: string) {
  await page.goto(`/${slug}?s=tt`);
  await page.getByRole('button', { name: 'Add Woven kiondo bag to cart' }).click();
  await page.getByRole('link', { name: /Kitenge wrap dress KES/ }).click();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Add to cart · KES 2,500' }).click();
  await page.getByRole('link', { name: 'View cart →' }).click();
  await expect(page.getByText('KES 4,300').first()).toBeVisible();
}

export async function fillDetails(page: Page) {
  await page.getByLabel('Your name').fill('Wanjiku Kamau');
  await page.getByLabel('Phone number').fill('712 345 678');
}

/** Buyer: a pay-now order of the dress and bag to CBD (KES 4,500); ends on its order page. */
export async function placePayNowOrder(page: Page, slug: string) {
  await addDressAndBag(page, slug);
  await page.goto(`/${slug}/checkout`);
  await fillDetails(page);
  await page.getByLabel('Area, street or building').fill('Moi Avenue, Bazaar Plaza');
  await page.getByRole('radio', { name: /Pay now with M-Pesa/ }).check();
  await page.getByRole('button', { name: 'Place order · KES 4,500' }).click();
  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
}
