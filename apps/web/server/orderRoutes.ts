import 'server-only';
import {
  hasWhatsAppStep,
  MANUAL_KIND,
  manualOrderInput,
  manualQuoteInput,
  ordersQuery,
  sellerActionInput,
  waLink,
  whatsappMessage,
} from '@oda/shared';
import { requireSeller } from './authz';
import { getDeliveryNames } from './repos/delivery';
import { afterOrderChange } from './afterOrder';
import type { Defer } from './checkout';
import { getDb } from './db';
import { parseInput } from './errors';
import { insertOrder, quoteOrder, transitionOrder } from './orders';
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
    defer(() => afterOrderChange(db, order, sideEffects));
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

/** POST /api/orders/quote — what a manual order of these lines costs with each option. */
export const quoteManualOrder = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const input = parseInput(manualQuoteInput, await body(request));
  const quote = await quoteOrder(db, ctx.shopId, input.lines, {
    manual: true,
    ...(input.deliveryFeeOverride !== undefined
      ? { deliveryFeeOverride: input.deliveryFeeOverride }
      : {}),
  });
  const names = await getDeliveryNames(db, ctx);
  return {
    ...quote,
    options: quote.options.map((o) => ({
      ...o,
      name: o.areaId ? (names[o.areaId] ?? '') : 'Pickup',
    })),
  };
});

/**
 * POST /api/orders — a manual order (17-new-order): priced from the database like any order
 * (the seller may only change the delivery fee), created by insertOrder() with the manual kind
 * for the payment choice. A retry with the same key returns the same order.
 */
export const createManualOrder = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const input = parseInput(manualOrderInput, await body(request));
  const { order } = await insertOrder(db, {
    shopId: ctx.shopId,
    kind: MANUAL_KIND[input.payment],
    buyer: { name: input.buyer.name, phone: input.buyer.phone, whatsapp: input.buyer.whatsapp },
    fulfilment: input.fulfilment,
    lines: input.lines.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      size: l.size,
      colour: l.colour,
    })),
    idempotencyKey: input.idempotencyKey,
    ...(input.deliveryFeeOverride !== undefined
      ? { deliveryFeeOverride: input.deliveryFeeOverride }
      : {}),
  });
  return sellerOrdersRepo(db, ctx).detail(order.id);
}, 201);
