import { expect, test } from './test';
import { placePayNowOrder, sellerShop } from './shop';

// The buyer's order page (M5 CP3, CP5 acceptance; web 04b redesign, 05, 6): pay now end to end
// from the buyer's side (pay page → paste the SMS → I've paid → waiting → cancel with the
// refund copy), switching to pay on delivery, reporting a problem, unguessable order links,
// and the order rate limit.

const SMS =
  'SJK4X7PQ2M Confirmed. Ksh4,500.00 sent to E2E BOUTIQUE 5123456 on 5/10/26 at 10:15 AM.';

test('pay now: pay page → I’ve paid → waiting → cancel (refund copy)', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request, { till: true, payOnDelivery: true });
  await placePayNowOrder(page, slug);

  // Pay page: exact Till steps with copy buttons and the account name.
  await expect(page.getByRole('heading', { name: 'Pay KES 4,500 to E2E Boutique' })).toBeVisible();
  await expect(page.getByText('Buy Goods and Services')).toBeVisible();
  await expect(page.getByText('5123456')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy till number' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy amount' })).toBeVisible();
  await expect(page.getByText('E2E BOUTIQUE', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('04b-pay-390x844.png'), fullPage: true });

  // "I've paid" waits for a code; the code is read live from the pasted SMS.
  await expect(page.getByRole('button', { name: 'I’ve paid' })).toBeDisabled();
  await page.getByLabel('Paste your M-Pesa message or the code').fill('paid already');
  await expect(page.getByText('We can’t see a code yet')).toBeVisible();
  await page.getByLabel('Paste your M-Pesa message or the code').fill(SMS);
  await expect(page.getByText('✓ Code SJK4X7PQ2M')).toBeVisible();
  await page.getByRole('button', { name: 'I’ve paid' }).click();

  // Status page (05/6): waiting for the seller to confirm.
  await expect(page.getByRole('heading', { name: /^Order #\d+$/ })).toBeVisible();
  await expect(page.getByText('Order placed!')).toBeVisible();
  await expect(page.getByText('Waiting for E2E Boutique to confirm your payment')).toBeVisible();
  await expect(
    page.getByText('M-Pesa SJK4X7PQ2M · waiting for E2E Boutique to confirm'),
  ).toBeVisible();
  await expect(page.getByText('will send your money back on M-Pesa')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('6-status-390x844.png'), fullPage: true });

  // Cancel asks first; after a claim the copy mentions the refund.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('Order cancelled')).toBeVisible();
  await expect(page.getByText(/You cancelled it/)).toBeVisible();
  await expect(page.getByText('If your payment reached E2E Boutique')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
});

test('pay on delivery instead, and report a problem', async ({ page, request }) => {
  const slug = await sellerShop(request, { till: true, payOnDelivery: true });
  await placePayNowOrder(page, slug);
  await page.getByRole('button', { name: 'Pay on delivery instead' }).click();
  await expect(page.getByText('Waiting for E2E Boutique to accept')).toBeVisible();
  await expect(page.getByText('You pay KES 4,500 on delivery')).toBeVisible();

  await page.getByRole('button', { name: /Report a problem to oda/ }).click();
  await page.getByLabel('What went wrong?').fill('The seller is not answering.');
  await page.getByRole('button', { name: 'Send to oda' }).click();
  await expect(page.getByText('Thanks. oda will look into it')).toBeVisible();
});

test('order links can’t be guessed and never carry ids', async ({ page, request }) => {
  const slug = await sellerShop(request, { till: true });
  const orderResponses: string[] = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/orders') && r.request().method() === 'POST') {
      orderResponses.push(await r.text());
    }
  });
  await placePayNowOrder(page, slug);
  const token = page.url().split('/o/')[1]!;
  // Order pages stay out of search engines and never send their link on as a referrer.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  // The API answers with the token only: no order id (uuid) and no order number.
  expect(orderResponses).toEqual([JSON.stringify({ token })]);
  expect(page.url()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

  // One character changed, a sequential-looking path, or the order number: the same 404.
  const changed = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  for (const path of [`/o/${changed}`, '/o/1001', '/o/000000000001']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { name: /This page isn.t here/ })).toBeVisible();
  }
});

test('the order rate limit triggers (5 an hour per phone per shop)', async ({
  request,
  baseURL,
}) => {
  const slug = await sellerShop(request, { pickup: true });
  const cart = await request.get(`/${slug}`);
  const productId = /\/p\/([0-9a-f-]{36})/.exec(await cart.text())![1]!;
  const quote = await request.post(`/api/shops/${slug}/quote`, {
    data: { lines: [{ productId, qty: 1, size: 'M' }] },
  });
  const lines = quote.ok() ? [{ productId, qty: 1, size: 'M' }] : [{ productId, qty: 1 }];
  const priced = await (await request.post(`/api/shops/${slug}/quote`, { data: { lines } })).json();
  const total = priced.options.find((o: { kind: string }) => o.kind === 'pickup').total;
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await request.post(`/api/shops/${slug}/orders`, {
      headers: { origin: baseURL! },
      data: {
        idempotencyKey: `e2e-rate-limit-${slug}-${i}`,
        buyer: { name: 'Rate Limit', phone: '0712 999 000', whatsapp: true },
        fulfilment: { kind: 'pickup' },
        payment: 'pay_on_delivery',
        lines,
        expectedTotal: total,
      },
    });
    statuses.push(res.status());
  }
  expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
});
