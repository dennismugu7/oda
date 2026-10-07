import { setSuspended } from '../test/e2eShop';
import { placePayNowOrder, sellerShop } from './shop';
import { expect, test } from './test';

// Decision #83: a suspended shop's unpaid pay-now order shows no payment details and no
// "I've paid", only "Don't send money" and Cancel; unsuspending brings the pay page back.

test('suspended shop: no pay details, cancel only; unsuspended: the pay page is back', async ({
  page,
  request,
}) => {
  const slug = await sellerShop(request, { till: true, payOnDelivery: true });
  await placePayNowOrder(page, slug);
  await expect(page.getByText('5123456')).toBeVisible();
  const orderUrl = page.url();

  await setSuspended(slug, true);
  await page.reload();
  await expect(
    page.getByText(
      'This shop can’t take payments right now. Don’t send money. You can cancel this order.',
    ),
  ).toBeVisible();
  await expect(page.getByText('5123456')).toHaveCount(0);
  await expect(page.getByText('Buy Goods and Services')).toHaveCount(0);
  await expect(page.getByLabel('Paste your M-Pesa message or the code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'I’ve paid' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pay on delivery instead' })).toHaveCount(0);
  await expect(page.getByText(/Pay E2E Boutique, then/)).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('suspended-pay-390x844.png'),
    fullPage: true,
  });

  // Unsuspended: the normal pay page again.
  await setSuspended(slug, false);
  await page.goto(orderUrl);
  await expect(page.getByRole('heading', { name: 'Pay KES 4,500 to E2E Boutique' })).toBeVisible();
  await expect(page.getByText('5123456')).toBeVisible();

  // Suspended again: the buyer can still cancel.
  await setSuspended(slug, true);
  await page.reload();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('Order cancelled')).toBeVisible();
});
