import 'server-only';
import type { Db } from '@oda/db';
import type { schema } from '@oda/db';
import type { SideEffect } from '@oda/shared';
import { sendOrderEmails } from './email/orderEmails';
import { sendOrderPushes } from './push';

type OrderRow = typeof schema.orders.$inferSelect;

/**
 * What happens after an order is created or changes, once the response is on its way: the
 * buyer's emails and the seller's pushes (both never throw). Called through Next's `after()`.
 */
export async function afterOrderChange(
  db: Db,
  order: OrderRow,
  sideEffects: readonly SideEffect[],
): Promise<void> {
  await Promise.allSettled([
    sendOrderEmails(db, order, sideEffects),
    sendOrderPushes(db, order, sideEffects),
  ]);
}
