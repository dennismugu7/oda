import 'server-only';
import { and, asc, eq, lte, ne } from 'drizzle-orm';
import { EXPIRY_HOURS } from '@oda/shared';
import { schema, type Db } from '@oda/db';
import { afterOrderChange } from './afterOrder';
import { assertBearer } from './authz';
import type { Defer } from './checkout';
import { getDb } from './db';
import { serverEnv } from './env';
import { HttpError, toResponse } from './errors';
import { transitionOrder, type TransitionOutcome } from './orders';

// Scheduled jobs (data-model.md → Where logic runs; decision #69), called by GitHub Actions
// with `Authorization: Bearer <CRON_SECRET>`. Anything else — no secret configured, no header,
// a wrong one — is a plain 404, so the routes stay invisible.

const t = schema;

/** Batch size: the hourly run catches up over several runs if more are due. */
export const EXPIRE_BATCH = 100;

/** Constant-time check of the Bearer secret; 404 otherwise. */
export function assertCronSecret(request: Request, secret = serverEnv().CRON_SECRET): void {
  assertBearer(request, secret);
}

/**
 * Cancels buyer-placed pay-now orders still awaiting payment 48 h after they started waiting
 * (`awaiting_payment_since`), through transitionOrder() with the system's autoExpire. Manual
 * orders never expire (the machine refuses them too). An order changed meanwhile is skipped.
 */
export async function expireOrders(db: Db, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - EXPIRY_HOURS * 3_600_000);
  const due = await db
    .select({ id: t.orders.id })
    .from(t.orders)
    .where(
      and(
        eq(t.orders.status, 'awaiting_payment'),
        eq(t.orders.paymentStatus, 'unpaid'),
        ne(t.orders.source, 'manual'),
        lte(t.orders.awaitingPaymentSince, cutoff),
      ),
    )
    .orderBy(asc(t.orders.awaitingPaymentSince))
    .limit(EXPIRE_BATCH + 1);
  const expired: TransitionOutcome[] = [];
  let skipped = 0;
  for (const { id } of due.slice(0, EXPIRE_BATCH)) {
    try {
      expired.push(
        await transitionOrder(db, { kind: 'system', orderId: id }, { type: 'autoExpire' }),
      );
    } catch (error) {
      // Paid, cancelled or changed between the query and now: nothing to expire.
      if (error instanceof HttpError) skipped++;
      else throw error;
    }
  }
  return { expired, skipped, more: due.length > EXPIRE_BATCH };
}

/** POST /api/cron/expire-orders */
export async function postExpireOrders(request: Request, defer: Defer): Promise<Response> {
  try {
    assertCronSecret(request);
    const db = getDb();
    const { expired, skipped, more } = await expireOrders(db);
    for (const { order, sideEffects } of expired) {
      defer(() => afterOrderChange(db, order, sideEffects));
    }
    console.info(`[cron] expire-orders: ${expired.length} expired, ${skipped} skipped`);
    return Response.json(
      { expired: expired.length, skipped, more },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return toResponse(error);
  }
}
