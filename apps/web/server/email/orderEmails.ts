import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { BUYER_LIMITS, type SideEffect } from '@oda/shared';
import { orderLink } from '../orderLink';
import { hitLimit } from '../rateLimit';
import {
  orderCancelledEmail,
  orderReceiptEmail,
  orderUpdateEmail,
  type OrderEmailData,
  type OrderUpdateFacts,
} from './templates';
import { sendEmail } from './transport';

// The buyer's order emails (order-lifecycle.md "email" side effects): sent after the response,
// never undoing an order or an action, a few a day per address. Logged by kind and domain only.

const t = schema;
type OrderRow = typeof t.orders.$inferSelect;

/**
 * Sends the buyer emails among these side effects: the receipt and "you cancelled" (M5) and
 * the seller-triggered updates (M6). Never throws: an email problem must not undo an order or
 * an action. A few emails per address a day, so nobody can bomb someone else's inbox.
 */
export async function sendOrderEmails(
  db: Db,
  order: OrderRow,
  sideEffects: readonly SideEffect[],
): Promise<void> {
  const templates = sideEffects.flatMap((e) => (e.kind === 'email' ? [e.template] : []));
  if (!order.buyerEmail || templates.length === 0) return;
  try {
    const [shop] = await db
      .select({
        name: t.shops.name,
        pickupLocation: t.shops.pickupLocation,
        pickupHours: t.shops.pickupHours,
      })
      .from(t.shops)
      .where(eq(t.shops.id, order.shopId));
    const items = await db
      .select({
        name: t.orderItems.nameSnapshot,
        size: t.orderItems.size,
        colour: t.orderItems.colour,
        qty: t.orderItems.qty,
        unitPrice: t.orderItems.unitPrice,
      })
      .from(t.orderItems)
      .where(eq(t.orderItems.orderId, order.id))
      .orderBy(asc(t.orderItems.createdAt));
    const data: OrderEmailData = {
      to: order.buyerEmail,
      shopName: shop?.name ?? 'the shop',
      number: order.number,
      buyerName: order.buyerName,
      paymentMethod: order.paymentMethod,
      fulfilment: order.fulfilment,
      deliveryAreaName: order.deliveryAreaName,
      items,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      link: orderLink(order.publicToken),
    };
    const facts: OrderUpdateFacts = {
      paymentStatus: order.paymentStatus,
      sentMethod: order.sentMethod,
      riderPhone: order.riderPhone,
      pickupLocation: shop?.pickupLocation ?? null,
      pickupHours: shop?.pickupHours ?? null,
      cancelReason: order.cancelReason,
    };
    const build = (template: (typeof templates)[number]) => {
      if (template === 'receipt') return orderReceiptEmail(data);
      if (template === 'cancelled') {
        return order.cancelledBy === 'buyer'
          ? orderCancelledEmail({ ...data, claimed: order.paymentStatus === 'claimed' })
          : orderUpdateEmail('seller_cancelled', data, facts);
      }
      return orderUpdateEmail(template, data, facts);
    };
    for (const template of templates) {
      if (!(await hitLimit(db, `order-email:${order.buyerEmail}`, BUYER_LIMITS.emailsPerAddress))) {
        console.warn(`[email] order emails to @${order.buyerEmail.split('@')[1]} limited today`);
        return;
      }
      await sendEmail(build(template));
    }
  } catch (error) {
    // sendEmail already logged the failure without secrets; anything else, by name only.
    if (!(error instanceof Error && error.name === 'EmailSendError')) {
      console.error('[email] order email failed', error instanceof Error ? error.name : 'unknown');
    }
  }
}
