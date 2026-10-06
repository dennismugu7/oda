import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { newSeller } from '@/test/sellerApi';
import { storeJpeg } from '@/test/storage';
import { getDb } from './db';
import { postDigest, sendDigest, SUPPORT_EMAIL } from './digest';
import { testOutbox } from './email/transport';
import { insertOrder } from './orders';

// M8a CP3: the daily support digest (decisions #72 b, #73 a, #74): one email with every new
// buyer report, seller feedback (screenshot link) and reported review; each item mailed
// once; nothing on a quiet day; a failed send marks nothing.

const db = () => getDb();
const t = schema;
const BASE = 'https://oda.test';
const CRON = 'cron-secret-for-tests-0123456789abcdef';

beforeEach(async () => {
  await truncateAll(db());
  testOutbox.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await truncateAll(db());
});

async function world() {
  const s = await newSeller();
  await db()
    .update(t.shops)
    .set({ acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'CBD' })
    .where(eq(t.shops.id, s.shopId));
  const [product] = await db()
    .insert(t.products)
    .values({ shopId: s.shopId, name: 'Kiondo bag', price: 1800 })
    .returning();
  const { order } = await insertOrder(db(), {
    shopId: s.shopId,
    kind: 'buyer_pay_on_delivery',
    source: 'wa',
    buyer: { name: 'Wanjiku Mwangi', phone: '0712 345 901', email: null },
    fulfilment: { kind: 'pickup' },
    lines: [{ productId: product!.id, qty: 1 }],
  });
  return { ...s, order };
}

async function news(w: Awaited<ReturnType<typeof world>>) {
  await db()
    .insert(t.reports)
    .values({ orderId: w.order.id, message: 'Paid but no reply', contactPhone: '+254712345901' });
  const shot = await storeJpeg(`feedback/${w.shopId}/shot.jpg`);
  await db().insert(t.feedback).values({
    shopId: w.shopId,
    kind: 'broken',
    message: 'The share button does nothing',
    screenshotPath: shot,
    replyOnWhatsapp: true,
  });
  const [item] = await db().select().from(t.orderItems).where(eq(t.orderItems.orderId, w.order.id));
  const [review] = await db()
    .insert(t.reviews)
    .values({
      orderId: w.order.id,
      shopId: w.shopId,
      buyerDisplayName: 'Wanjiku M.',
      rating: 1,
      editableUntil: new Date(Date.now() + 86_400_000),
      reportedAt: new Date(),
      reportReason: 'Not a real buyer',
    })
    .returning();
  await db()
    .insert(t.reviewItems)
    .values({ reviewId: review!.id, orderItemId: item!.id, rating: 1, text: 'Never arrived' });
  return { shot };
}

describe('support digest', () => {
  it('a quiet day sends nothing', async () => {
    await world();
    expect(await sendDigest(db(), { shopBaseUrl: BASE })).toEqual({
      sent: false,
      reports: 0,
      feedback: 0,
      reviews: 0,
      more: false,
    });
    expect(testOutbox.all()).toEqual([]);
  });

  it('mails every new item once, with the screenshot link, then nothing the next time', async () => {
    const w = await world();
    const { shot } = await news(w);
    expect(await sendDigest(db(), { shopBaseUrl: BASE })).toMatchObject({
      sent: true,
      reports: 1,
      feedback: 1,
      reviews: 1,
    });
    const mail = testOutbox.last(SUPPORT_EMAIL)!;
    expect(mail.kind).toBe('support-digest');
    expect(mail.subject).toBe('oda support: 1 buyer report, 1 feedback, 1 reported review');
    for (const text of [
      `Amani Styles · order #${w.order.number}`,
      'Paid but no reply',
      '0712 345 901',
      "Something's broken",
      'The share button does nothing',
      'Reply on WhatsApp: 0712 345 678',
      shot, // local driver: the signed link is the dev URL
      '★',
      'Never arrived',
      'Not a real buyer',
      'review-remove',
      `${BASE}/${w.slug}`,
    ]) {
      expect(mail.text, text).toContain(text);
    }
    expect(mail.html).toContain('Support digest');

    const [report] = await db().select().from(t.reports);
    const [feedback] = await db().select().from(t.feedback);
    const [review] = await db().select().from(t.reviews);
    expect(report!.notifiedAt).toBeInstanceOf(Date);
    expect(feedback!.notifiedAt).toBeInstanceOf(Date);
    expect(review!.reportNotifiedAt).toBeInstanceOf(Date);

    testOutbox.clear();
    expect((await sendDigest(db(), { shopBaseUrl: BASE })).sent).toBe(false);
    expect(testOutbox.all()).toEqual([]);

    // A new item later: only that one.
    await db().insert(t.reports).values({ orderId: w.order.id, message: 'Second report' });
    expect(await sendDigest(db(), { shopBaseUrl: BASE })).toMatchObject({
      sent: true,
      reports: 1,
      feedback: 0,
      reviews: 0,
    });
    expect(testOutbox.last()!.text).not.toContain('Paid but no reply');
  });

  it('when the email fails, nothing is marked and the next run sends it all', async () => {
    const w = await world();
    await news(w);
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');
    vi.stubEnv('RESEND_API_KEY', undefined);
    await expect(sendDigest(db(), { shopBaseUrl: BASE })).rejects.toThrow();
    vi.unstubAllEnvs();
    expect((await db().select().from(t.reports))[0]!.notifiedAt).toBeNull();
    expect(await sendDigest(db(), { shopBaseUrl: BASE })).toMatchObject({ sent: true, reports: 1 });
  });

  it('two runs at once mail each item once', async () => {
    const w = await world();
    await news(w);
    const results = await Promise.all([
      sendDigest(db(), { shopBaseUrl: BASE }),
      sendDigest(db(), { shopBaseUrl: BASE }),
    ]);
    expect(results.reduce((n, r) => n + r.reports + r.feedback + r.reviews, 0)).toBe(3);
  });

  it('the route needs the cron secret (404 otherwise)', async () => {
    const call = (auth?: string) =>
      postDigest(
        new Request('http://localhost:3000/api/cron/digest', {
          method: 'POST',
          headers: auth ? { authorization: auth } : {},
        }),
        BASE,
        CRON,
      );
    expect((await call()).status).toBe(404);
    expect((await call('Bearer nope')).status).toBe(404);
    const ok = await call(`Bearer ${CRON}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ sent: false });
  });
});
