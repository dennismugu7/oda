import 'server-only';
import {
  hasWhatsAppStep,
  ordersQuery,
  sellerActionInput,
  waLink,
  whatsappMessage,
} from '@oda/shared';
import { requireSeller } from './authz';
import { sendOrderEmails, type Defer } from './checkout';
import { getDb } from './db';
import { parseInput } from './errors';
import { transitionOrder } from './orders';
import { sellerOrdersRepo } from './repos/sellerOrders';
import { body, handle } from './routeHandler';

// The seller's orders (M6 CP2): GET /api/orders, GET /api/orders/:id and the one actions
// endpoint. Every status change goes through transitionOrder() (a lost race is 409 "This order
// changed"); buyer emails go out after the response, and the answer carries the WhatsApp
// prefill when the action has a WhatsApp step (the seller's phone opens it; oda never sends).

/** GET /api/orders?tab=todo|all|done&q=…&cursor=… */
export const listOrders = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const query = parseInput(
    ordersQuery,
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  return sellerOrdersRepo(db, ctx).list(query);
});

/** GET /api/orders/:id */
export const getOrder = handle(async (request, id) => {
  const db = getDb();
  return sellerOrdersRepo(db, await requireSeller(request, db)).detail(id!);
});

/** POST /api/orders/:id/actions — body: one seller action of the machine. */
export function postOrderAction(defer: Defer) {
  return handle(async (request, id) => {
    const db = getDb();
    const ctx = await requireSeller(request, db);
    const action = parseInput(sellerActionInput, await body(request));
    const { order, sideEffects } = await transitionOrder(
      db,
      { kind: 'seller', ctx, orderId: id! },
      action,
    );
    defer(() => sendOrderEmails(db, order, sideEffects));
    const detail = await sellerOrdersRepo(db, ctx).detail(order.id);
    const text = hasWhatsAppStep(sideEffects)
      ? whatsappMessage(
          action.type,
          {
            buyerName: order.buyerName,
            number: order.number,
            total: order.total,
            shopName: detail.shop.name,
            link: detail.link,
            paymentStatus: order.paymentStatus,
            sentMethod: order.sentMethod,
            riderPhone: order.riderPhone,
            pickupLocation: detail.shop.pickupLocation,
            pickupHours: detail.shop.pickupHours,
          },
          order.cancelReason,
        )
      : null;
    return { order: detail, whatsapp: text ? { url: waLink(order.buyerPhone, text), text } : null };
  });
}
