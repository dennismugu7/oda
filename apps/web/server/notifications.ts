import 'server-only';
import { formatKes, type PushType, type SideEffect } from '@oda/shared';
import { schema, type Db } from '@oda/db';

// In-app notification rows for the seller (decision #61 e): written from the machine's push
// side effects in the same transaction as the order change. Push sending is M6.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type OrderRow = typeof schema.orders.$inferSelect;

/** The seller's notification text. The buyer's name is link-free (checkout strips links). */
export function notificationText(order: OrderRow, type: PushType): { title: string; body: string } {
  const n = `#${order.number}`;
  const total = formatKes(order.total);
  const buyer = order.buyerName;
  switch (type) {
    case 'new_order':
      return {
        title: `New order ${n}`,
        body: `${buyer} · ${total} · ${
          order.paymentMethod === 'pay_on_delivery' ? 'Pay on delivery' : 'Pay now with M-Pesa'
        }`,
      };
    case 'payment_claimed':
      return {
        title: `${buyer} says they paid ${n}`,
        body: `${total} · M-Pesa code ${order.mpesaCode ?? '—'}. Check your M-Pesa, then confirm.`,
      };
    case 'switched_to_pod':
      return {
        title: `${n} is now pay on delivery`,
        body: `${buyer} will pay ${total} on delivery. Accept the order when you're ready.`,
      };
    case 'buyer_cancelled':
      return {
        title: `${buyer} cancelled ${n}`,
        body:
          order.paymentStatus === 'claimed'
            ? `They had said they paid ${total}. Check your M-Pesa and refund it if it came in.`
            : `${total}. Nothing to do.`,
      };
    case 'order_expired':
      return {
        title: `${n} expired`,
        body: `${buyer} didn't pay ${total} within 48 hours, so oda cancelled it.`,
      };
  }
}

export async function insertNotifications(
  tx: Tx,
  order: OrderRow,
  sideEffects: readonly SideEffect[],
): Promise<void> {
  const rows = sideEffects
    .filter((e): e is Extract<SideEffect, { kind: 'push' }> => e.kind === 'push')
    .map((e) => ({
      shopId: order.shopId,
      type: e.type,
      orderId: order.id,
      ...notificationText(order, e.type),
    }));
  if (rows.length) await tx.insert(schema.notifications).values(rows);
}
