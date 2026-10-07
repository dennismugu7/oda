import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type APIRequestContext, type Page } from './test';
import { addDressAndBag, fillDetails, sellerHeaders, sellerShop } from './shop';

// Reviews from the buyer's side (M7 CP2, decision #73): a delivered order is rated with a
// photo (resized in the browser) and shows on the product page with its average; edits within
// 7 days change it; an order that isn't delivered has no review link and the API refuses.

/** A real, decodable PNG (the byte-check fixtures aren't images a browser can draw). */
function realPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([217, 74, 39], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Buyer: a pay-on-delivery order of the dress and bag to CBD; ends on its order page. */
async function placePodOrder(page: Page, slug: string) {
  await addDressAndBag(page, slug);
  await page.goto(`/${slug}/checkout`);
  await fillDetails(page);
  await page.getByLabel('Area, street or building').fill('Moi Avenue, Bazaar Plaza');
  await page.getByRole('radio', { name: /Pay on delivery/ }).check();
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
  return page.url().split('/o/')[1]!;
}

/** Seller: accept → sent with a rider → delivered (money collected), through the seller API. */
async function deliverLatest(request: APIRequestContext, slug: string) {
  const headers = sellerHeaders.get(slug)!;
  const list = await request.get('/api/orders?tab=all', { headers });
  const { orders } = (await list.json()) as { orders: { id: string }[] };
  const id = orders[0]!.id;
  for (const action of [
    { type: 'accept' },
    { type: 'markSent', sentMethod: 'rider' },
    { type: 'markDelivered', collected: true },
  ]) {
    const res = await request.post(`/api/orders/${id}/actions`, { headers, data: action });
    expect(res.status(), action.type).toBe(200);
  }
}

test('delivered order → review with a photo → on the product page; edit within 7 days', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request, { payOnDelivery: true });
  const token = await placePodOrder(page, slug);
  // Not delivered yet: no review prompt.
  await expect(page.getByRole('link', { name: 'Rate your order' })).toHaveCount(0);

  await deliverLatest(request, slug);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'How was your order?' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('05c-delivered-390x844.png'),
    fullPage: true,
  });

  // Tapping the 4th star opens the review page with 4 stars chosen.
  await page.getByRole('link', { name: 'Rate 4 out of 5' }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${token}/review\\?stars=4$`));
  await expect(page.getByRole('heading', { name: 'Rate your order' })).toBeVisible();
  await expect(page.getByText('Good', { exact: true })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Your rating', exact: true })
    .getByLabel('Rate 5 out of 5')
    .click();
  await expect(page.getByText('Loved it!')).toBeVisible();
  await page.getByRole('button', { name: 'Well packed' }).click();
  await expect(page.getByRole('button', { name: '✓ Well packed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The dress: 4 stars, text (a phone number is removed by the server), a photo.
  await page
    .getByRole('radiogroup', { name: 'Your rating for Kitenge wrap dress' })
    .getByLabel('Rate 4 out of 5')
    .click();
  await page
    .getByLabel('What did you think of Kitenge wrap dress?')
    .fill('Fits perfectly, call me 0712 345 678');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add a photo of Kitenge wrap dress' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'dress.png',
    mimeType: 'image/png',
    buffer: realPng(1800, 1200),
  });
  await expect(page.getByRole('img', { name: 'Your photo of Kitenge wrap dress' })).toBeVisible();
  await expect(page.getByText('Shows as')).toContainText('Wanjiku K. · Verified buyer');
  await page.screenshot({ path: test.info().outputPath('5d-review-390x844.png'), fullPage: true });
  await page.getByRole('button', { name: 'Submit review' }).click();

  // Back on the order page: thanks, edit link, the timeline's last step done.
  await expect(page).toHaveURL(new RegExp(`/o/${token}$`));
  await expect(page.getByRole('heading', { name: 'Thanks for your review' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit your review' })).toBeVisible();
  await expect(page.getByText('Done: Rate your order')).toBeAttached();

  // The product page: the average and the review with its photo; the bag shows no rating.
  await page.goto(`/${slug}`);
  await page.getByRole('link', { name: 'New Kitenge wrap dress ★ 4.0 (1) KES 2,500' }).click();
  await expect(page.getByRole('link', { name: '1 review' })).toBeVisible();
  const reviews = page.getByRole('region', { name: 'Reviews' });
  await expect(reviews.getByText('Fits perfectly, call me')).toBeVisible();
  await expect(reviews.getByText('0712')).toHaveCount(0);
  await expect(reviews.getByText('Wanjiku K.')).toBeVisible();
  await expect(reviews.getByRole('img', { name: 'Photo from Wanjiku K.' })).toBeVisible();
  await expect(reviews.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('02-reviews-390x844.png'), fullPage: true });

  // Edit within 7 days: the dress drops to 2 stars, the photo is removed.
  await page.goto(`/o/${token}`);
  await page.getByRole('link', { name: 'Edit your review' }).click();
  await expect(page.getByRole('heading', { name: 'Edit your review' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Your rating for Kitenge wrap dress' })
    .getByLabel('Rate 2 out of 5')
    .click();
  await page.getByRole('button', { name: 'Remove the photo of Kitenge wrap dress' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Thanks for your review' })).toBeVisible();
  await page.goto(`/${slug}`);
  await page.getByRole('link', { name: /Kitenge wrap dress ★ 2\.0 \(1\)/ }).click();
  await expect(page.getByText('2.0', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Reviews' }).getByRole('img', { name: /^Photo from/ }),
  ).toHaveCount(0);
});

test('an order that isn’t delivered can’t be reviewed', async ({ page, request }) => {
  const slug = await sellerShop(request, { payOnDelivery: true });
  const token = await placePodOrder(page, slug);
  await page.goto(`/o/${token}/review`);
  await expect(page.getByRole('heading', { name: 'Not delivered yet' })).toBeVisible();
  await expect(page.getByText('You can rate your order once it’s delivered.')).toBeVisible();
  const res = await page.request.post(`/api/o/${token}/review`, {
    data: { rating: 5 },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('not_delivered');
});
