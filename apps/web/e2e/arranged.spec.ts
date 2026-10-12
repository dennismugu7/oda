import { expect, test } from './test';
import { lastEmailTo } from './outbox';
import { addDressAndBag, fillDetails, sellerShop } from './shop';

// Delivery options are optional (decision #110): a shop with no delivery area and pickup off
// still takes orders; checkout has no delivery choice, the seller arranges delivery with the
// buyer, who may leave a note. At 360 px, the narrowest phone the buyer pages support.

test.use({ viewport: { width: 360, height: 780 } });

test('no delivery options: checkout, order page and receipt for an arranged order', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request, { areas: [], freeDeliveryThreshold: 3000 });

  // The shop and product pages say how delivery works; no promise of free delivery.
  await page.goto(`/${slug}`);
  await expect(page.getByText('Delivery arranged with the seller after you order')).toBeVisible();
  await expect(page.getByText(/Not taking orders yet/)).toHaveCount(0);
  await addDressAndBag(page, slug);
  await expect(page.getByText('Arranged with the seller')).toBeVisible();
  await expect(page.getByText(/more for free delivery/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByText('The seller will contact you to arrange delivery')).toBeVisible();
  // No delivery choice and no address.
  await expect(page.getByRole('radio', { name: /CBD|Pickup/ })).toHaveCount(0);
  await expect(page.getByLabel('Area, street or building')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Pay on delivery/ })).toBeChecked();
  await expect(page.getByText('Pay when you get your order.')).toBeVisible();
  await expect(page.getByText('Not included')).toBeVisible();
  await fillDetails(page);
  await page.getByRole('button', { name: /Add email/ }).click();
  await page.getByLabel('Email for a receipt (optional)').fill('wanjiku@example.test');
  await page
    .getByLabel('Note for the seller (optional)')
    .fill('Near Yaya Centre, after 5pm is best');
  await page.screenshot({
    path: test.info().outputPath('1-checkout-arranged-360.png'),
    fullPage: true,
  });
  // The fee is 0, so the total is the items alone.
  await page.getByRole('button', { name: 'Place order · KSh 4,300' }).click();

  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
  await expect(
    page.getByText(
      'E2E Boutique will contact you to arrange delivery. You pay KSh 4,300 when you get your order.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Delivery · arranged with E2E Boutique')).toBeVisible();
  await expect(page.getByText('Your note: Near Yaya Centre, after 5pm is best')).toBeVisible();
  await expect(page.getByText('Pay when you get your order')).toBeVisible();
  const message = page.getByRole('link', { name: /Message E2E Boutique to arrange delivery/ });
  await expect(message).toHaveAttribute('href', /about%20delivery%20for%20my%20order/);
  await page.screenshot({
    path: test.info().outputPath('2-order-page-arranged-360.png'),
    fullPage: true,
  });

  // The receipt, as the buyer's mail app shows it.
  const mail = await lastEmailTo('wanjiku@example.test');
  expect(mail.text).toContain('Delivery (arranged with E2E Boutique): Not included');
  expect(mail.text).toContain('E2E Boutique will contact you to arrange delivery.');
  // In a blank page of its own, like a mail app: the site's CSP doesn't apply to emails.
  const inbox = await page.context().newPage();
  await inbox.setContent(mail.html!);
  await inbox.screenshot({
    path: test.info().outputPath('3-email-arranged-360.png'),
    fullPage: true,
  });
});

test('no delivery options, pay now: the pay page says delivery is arranged', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request, { areas: [], till: true });
  await addDressAndBag(page, slug);
  await page.goto(`/${slug}/checkout`);
  await fillDetails(page);
  await expect(page.getByRole('radio', { name: /Pay now with M-Pesa/ })).toBeChecked();
  await page.getByRole('button', { name: 'Place order · KSh 4,300' }).click();
  await expect(page.getByRole('heading', { name: 'Pay KSh 4,300 to E2E Boutique' })).toBeVisible();
  await expect(
    page.getByText('Delivery isn’t included: arrange it with E2E Boutique.', { exact: false }),
  ).toBeVisible();
});

test('a shop with delivery areas keeps its delivery choice (unchanged)', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request, {
    areas: [
      { name: 'CBD', fee: 200, etaLabel: 'Same day' },
      { name: 'Westlands', fee: 300, etaLabel: 'Next day' },
    ],
    pickup: true,
  });
  await addDressAndBag(page, slug);
  await page.goto(`/${slug}/checkout`);
  await expect(page.getByText('The seller will contact you to arrange delivery')).toHaveCount(0);
  await expect(page.getByLabel('Note for the seller (optional)')).toHaveCount(0);
  await fillDetails(page);
  await page.getByRole('radio', { name: /CBD/ }).check();
  await page.getByLabel('Area, street or building').fill('Moi Avenue, Bazaar Plaza');
  await expect(page.getByRole('radio', { name: /Westlands/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Pickup/ })).toBeVisible();
  await expect(page.getByText('Pay when it arrives.')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('4-checkout-areas-360.png'),
    fullPage: true,
  });
  await expect(page.getByRole('button', { name: 'Place order · KSh 4,500' })).toBeVisible();
});
