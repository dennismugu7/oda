import 'server-only';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { formatKePhone } from '@oda/shared';
import { assertCronSecret } from './cron';
import { getDb } from './db';
import { serverEnv } from './env';
import { supportDigestEmail, type DigestData } from './email/templates';
import { sendEmail } from './email/transport';
import { toResponse } from './errors';
import { getPrivateStorage } from './storage';

// The daily support digest (/api/cron/digest; decisions #72 b, #73 a, #74 e): one email to the
// oda team with every buyer report, seller feedback item and reported review not mailed yet,
// and nothing at all on a quiet day. The items are locked, mailed and marked (notified_at) in
// one transaction: if the email fails, nothing is marked and the next run sends them; two
// runs at once never mail the same item. Logs: counts only.

const t = schema;

export const SUPPORT_EMAIL = 'support@mugu-labs.com';
/** At most this many of each kind per email; the rest go in the next run. */
export const DIGEST_BATCH = 100;
/** Screenshot links in the email stay open this long (decision #74 b). */
export const SCREENSHOT_LINK_SECONDS = 7 * 86_400;

export interface DigestResult {
  sent: boolean;
  reports: number;
  feedback: number;
  reviews: number;
  more: boolean;
}

export async function sendDigest(
  db: Db,
  opts: { to?: string; shopBaseUrl: string },
): Promise<DigestResult> {
  return db.transaction(async (tx) => {
    const reports = await tx
      .select({
        id: t.reports.id,
        message: t.reports.message,
        contactPhone: t.reports.contactPhone,
        createdAt: t.reports.createdAt,
        number: t.orders.number,
        shopName: t.shops.name,
        slug: t.shops.slug,
      })
      .from(t.reports)
      .innerJoin(t.orders, eq(t.orders.id, t.reports.orderId))
      .innerJoin(t.shops, eq(t.shops.id, t.orders.shopId))
      .where(isNull(t.reports.notifiedAt))
      .orderBy(asc(t.reports.createdAt))
      .limit(DIGEST_BATCH + 1)
      .for('update', { of: t.reports, skipLocked: true });
    const feedback = await tx
      .select({
        id: t.feedback.id,
        kind: t.feedback.kind,
        message: t.feedback.message,
        replyOnWhatsapp: t.feedback.replyOnWhatsapp,
        screenshotPath: t.feedback.screenshotPath,
        createdAt: t.feedback.createdAt,
        shopName: t.shops.name,
        slug: t.shops.slug,
        whatsappPhone: t.shops.whatsappPhone,
      })
      .from(t.feedback)
      .innerJoin(t.shops, eq(t.shops.id, t.feedback.shopId))
      .where(isNull(t.feedback.notifiedAt))
      .orderBy(asc(t.feedback.createdAt))
      .limit(DIGEST_BATCH + 1)
      .for('update', { of: t.feedback, skipLocked: true });
    const reviews = await tx
      .select({
        id: t.reviews.id,
        rating: t.reviews.rating,
        reportReason: t.reviews.reportReason,
        reportedAt: t.reviews.reportedAt,
        displayName: t.reviews.buyerDisplayName,
        number: t.orders.number,
        shopName: t.shops.name,
        slug: t.shops.slug,
        text: sql<
          string | null
        >`(select string_agg(ri.text, ' · ') from review_items ri where ri.review_id = ${t.reviews.id} and ri.text is not null)`,
      })
      .from(t.reviews)
      .innerJoin(t.orders, eq(t.orders.id, t.reviews.orderId))
      .innerJoin(t.shops, eq(t.shops.id, t.reviews.shopId))
      .where(and(isNotNull(t.reviews.reportedAt), isNull(t.reviews.reportNotifiedAt)))
      .orderBy(asc(t.reviews.reportedAt))
      .limit(DIGEST_BATCH + 1)
      .for('update', { of: t.reviews, skipLocked: true });

    const more = [reports, feedback, reviews].some((list) => list.length > DIGEST_BATCH);
    const r = reports.slice(0, DIGEST_BATCH);
    const f = feedback.slice(0, DIGEST_BATCH);
    const v = reviews.slice(0, DIGEST_BATCH);
    if (r.length + f.length + v.length === 0) {
      return { sent: false, reports: 0, feedback: 0, reviews: 0, more: false };
    }

    const store = getPrivateStorage();
    const shop = (slug: string) => `${opts.shopBaseUrl}/${slug}`;
    const data: DigestData = {
      reports: r.map((x) => ({
        shopName: x.shopName,
        shopUrl: shop(x.slug),
        number: x.number,
        message: x.message,
        contactPhone: x.contactPhone ? formatKePhone(x.contactPhone) : null,
        at: x.createdAt,
      })),
      feedback: await Promise.all(
        f.map(async (x) => ({
          shopName: x.shopName,
          shopUrl: shop(x.slug),
          kind: x.kind,
          message: x.message,
          replyOnWhatsapp: x.replyOnWhatsapp ? formatKePhone(x.whatsappPhone) : null,
          screenshotUrl:
            x.screenshotPath && store
              ? await store
                  .signedReadUrl(x.screenshotPath, SCREENSHOT_LINK_SECONDS)
                  .catch(() => null)
              : null,
          hasScreenshot: !!x.screenshotPath,
          at: x.createdAt,
        })),
      ),
      reviews: v.map((x) => ({
        shopName: x.shopName,
        shopUrl: shop(x.slug),
        number: x.number,
        rating: x.rating,
        displayName: x.displayName,
        text: x.text,
        reason: x.reportReason,
        at: x.reportedAt!,
      })),
    };
    // Throws when the email can't be sent: the transaction rolls back, nothing is marked.
    await sendEmail(supportDigestEmail(opts.to ?? SUPPORT_EMAIL, data));

    const now = new Date();
    if (r.length) {
      await tx
        .update(t.reports)
        .set({ notifiedAt: now })
        .where(
          inArray(
            t.reports.id,
            r.map((x) => x.id),
          ),
        );
    }
    if (f.length) {
      await tx
        .update(t.feedback)
        .set({ notifiedAt: now })
        .where(
          inArray(
            t.feedback.id,
            f.map((x) => x.id),
          ),
        );
    }
    if (v.length) {
      await tx
        .update(t.reviews)
        .set({ reportNotifiedAt: now })
        .where(
          inArray(
            t.reviews.id,
            v.map((x) => x.id),
          ),
        );
    }
    return { sent: true, reports: r.length, feedback: f.length, reviews: v.length, more };
  });
}

/** POST /api/cron/digest (Bearer CRON_SECRET): daily at 08:00 Nairobi, and by hand. */
export async function postDigest(
  request: Request,
  shopBaseUrl: string,
  secret = serverEnv().CRON_SECRET,
): Promise<Response> {
  try {
    assertCronSecret(request, secret);
    const result = await sendDigest(getDb(), { shopBaseUrl });
    console.info(
      `[cron] digest: ${result.sent ? 'sent' : 'nothing new'} (${result.reports} reports, ${result.feedback} feedback, ${result.reviews} reported reviews)`,
    );
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
