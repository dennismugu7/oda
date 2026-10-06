import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  PricingError,
  extractMpesaCode,
  initialState,
  next,
  normalizeKePhone,
  priceOrder,
  type Action,
  type Actor,
  type CreationKind,
  type OrderSource,
  type OrderTimestamp,
  type SideEffect,
} from '@oda/shared';
import type { OrderTokenCtx, SellerCtx } from './authz';
import { ConflictError, NotFoundError, PriceChangedError, ValidationError } from './errors';
import { insertNotifications } from './notifications';
import { checkId } from './repos/util';

// Orders are created by insertOrder() and change status only through transitionOrder()
// (docs/data-model.md → Where logic runs). Both run in one transaction; the status guard
// trigger (migration 0002) rejects any other status UPDATE.

const t = schema;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type OrderRow = typeof t.orders.$inferSelect;

const TIMESTAMP_COLUMNS = {
  placed_at: 'placedAt',
  claimed_at: 'claimedAt',
  confirmed_at: 'confirmedAt',
  paid_at: 'paidAt',
  sent_at: 'sentAt',
  delivered_at: 'deliveredAt',
  cancelled_at: 'cancelledAt',
  refunded_at: 'refundedAt',
} as const satisfies Record<OrderTimestamp, keyof OrderRow>;

function stamps(list: OrderTimestamp[]) {
  return Object.fromEntries(list.map((ts) => [TIMESTAMP_COLUMNS[ts], sql`now()`]));
}

/** Lets this transaction change orders.status / payment_status (the guard checks it). */
async function allowTransition(tx: Tx) {
  await tx.execute(sql`select set_config('oda.transition', 'on', true)`);
}

/** The shop's next order number (1001, 1002, …). Call inside the order-insert transaction. */
export async function nextOrderNumber(tx: Tx | Db, shopId: string): Promise<number> {
  const [row] = await tx
    .update(t.shops)
    .set({ orderCounter: sql`${t.shops.orderCounter} + 1` })
    .where(eq(t.shops.id, shopId))
    .returning({ number: t.shops.orderCounter });
  if (!row) throw new NotFoundError("We couldn't find this shop.");
  return row.number;
}

// insertOrder -----------------------------------------------------------------------------

export interface NewOrderLine {
  productId: string;
  qty: number;
  size?: string | null;
  colour?: string | null;
}

export interface NewOrder {
  shopId: string;
  kind: CreationKind;
  /** Buyer orders: the link's ?s= tag (default `direct`). Manual orders are always `manual`. */
  source?: Exclude<OrderSource, 'manual'>;
  buyer: { name: string; phone: string; whatsapp?: boolean; email?: string | null };
  fulfilment: { kind: 'pickup' } | { kind: 'delivery'; areaId: string; addressText: string };
  lines: NewOrderLine[];
  /** Manual orders only (order-lifecycle.md → Money). */
  deliveryFeeOverride?: number;
  /** Checkout retries with the same key get the same order back. */
  idempotencyKey?: string;
  /** Checkout: the total the buyer saw. A different total refuses the order (409 price_changed). */
  expectedTotal?: number;
}

export interface InsertOrderResult {
  order: OrderRow;
  sideEffects: SideEffect[];
  /** True when an earlier request with the same idempotency key already created it. */
  replayed: boolean;
}

const MANUAL_KINDS: ReadonlySet<CreationKind> = new Set([
  'manual_paid',
  'manual_not_paid',
  'manual_pay_on_delivery',
]);

/**
 * Creates an order with prices, fees and the payment account read from the database.
 * Used by checkout (M5), manual orders (M6) and the seed.
 */
export async function insertOrder(db: Db, input: NewOrder): Promise<InsertOrderResult> {
  checkId(input.shopId, 'shop');
  const manual = MANUAL_KINDS.has(input.kind);
  if (input.deliveryFeeOverride !== undefined && !manual) {
    throw new ValidationError('Only the seller can change the delivery fee.');
  }
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(db, input.shopId, input.idempotencyKey);
    if (existing) return { order: existing, sideEffects: [], replayed: true };
  }

  const buyerPhone = normalizeKePhone(input.buyer.phone);
  if (!buyerPhone) {
    throw new ValidationError('Enter a Kenyan mobile number, e.g. 0712 345 678.', {
      'buyer.phone': 'Enter a Kenyan mobile number, e.g. 0712 345 678.',
    });
  }
  const buyerName = input.buyer.name.trim();
  if (!buyerName)
    throw new ValidationError('Enter your name.', { 'buyer.name': 'Enter your name.' });

  try {
    return await db.transaction(async (tx) => {
      const shop = await tx.query.shops.findFirst({
        where: and(
          eq(t.shops.id, input.shopId),
          isNull(t.shops.deletedAt),
          isNull(t.shops.suspendedAt),
        ),
      });
      if (!shop) throw new NotFoundError("We couldn't find this shop.");

      const state = initialState(input.kind);
      const [account] = await tx
        .select()
        .from(t.paymentAccounts)
        .where(and(eq(t.paymentAccounts.shopId, shop.id), eq(t.paymentAccounts.isActive, true)));

      if (!manual) {
        if (shop.isPaused)
          throw new ConflictError('This shop is taking a break. Try again soon.', 'shop_paused');
        if (input.kind === 'buyer_pay_now' && !(shop.acceptsPayBefore && account)) {
          throw new ConflictError(
            "This shop isn't taking M-Pesa payments right now.",
            'pay_now_off',
          );
        }
        if (input.kind === 'buyer_pay_on_delivery' && !shop.acceptsPayOnDelivery) {
          throw new ConflictError("This shop doesn't take pay on delivery.", 'pay_on_delivery_off');
        }
      }

      const lines = await resolveLines(tx, shop.id, input.lines, manual);

      let delivery: Parameters<typeof priceOrder>[0]['delivery'] = { kind: 'pickup' };
      let area: typeof t.deliveryAreas.$inferSelect | undefined;
      if (input.fulfilment.kind === 'pickup') {
        if (!shop.pickupEnabled && !manual) {
          throw new ValidationError("This shop doesn't offer pickup.");
        }
      } else {
        [area] = await tx
          .select()
          .from(t.deliveryAreas)
          .where(
            and(
              eq(t.deliveryAreas.id, checkId(input.fulfilment.areaId, 'delivery area')),
              eq(t.deliveryAreas.shopId, shop.id),
              isNull(t.deliveryAreas.deletedAt),
            ),
          );
        if (!area) throw new NotFoundError("We couldn't find this delivery area.");
        if (!input.fulfilment.addressText.trim()) {
          throw new ValidationError('Enter the delivery address.', {
            addressText: 'Enter the delivery address.',
          });
        }
        delivery = { kind: 'area', fee: area.fee, freeDeliveryEligible: area.freeDeliveryEligible };
      }

      const price = priceOrder({
        lines: lines.map((l) => ({ unitPrice: l.product.price, qty: l.qty })),
        delivery,
        freeDeliveryThreshold: shop.freeDeliveryThreshold,
        ...(input.deliveryFeeOverride !== undefined
          ? { deliveryFeeOverride: input.deliveryFeeOverride }
          : {}),
      });

      if (input.expectedTotal !== undefined && input.expectedTotal !== price.total) {
        throw new PriceChangedError({
          lines: lines.map((l) => ({
            productId: l.product.id,
            size: l.size,
            colour: l.colour,
            name: l.product.name,
            unitPrice: l.product.price,
            qty: l.qty,
          })),
          subtotal: price.subtotal,
          deliveryFee: price.deliveryFee,
          total: price.total,
        });
      }

      const number = await nextOrderNumber(tx, shop.id);
      const paysBefore = state.paymentMethod === 'pay_before';
      const [order] = await tx
        .insert(t.orders)
        .values({
          shopId: shop.id,
          number,
          publicToken: randomBytes(9).toString('base64url'),
          idempotencyKey: input.idempotencyKey ?? null,
          status: state.status,
          paymentStatus: state.paymentStatus,
          paymentMethod: state.paymentMethod,
          buyerName,
          buyerPhone,
          buyerWhatsapp: input.buyer.whatsapp ?? true,
          buyerEmail: input.buyer.email?.trim() || null,
          fulfilment: input.fulfilment.kind,
          deliveryAreaId: area?.id ?? null,
          deliveryAreaName: area?.name ?? null,
          addressText:
            input.fulfilment.kind === 'delivery' ? input.fulfilment.addressText.trim() : null,
          subtotal: price.subtotal,
          deliveryFee: price.deliveryFee,
          total: price.total,
          paymentAccountSnapshot:
            paysBefore && account
              ? {
                  type: account.type,
                  number: account.number,
                  name: account.accountName,
                  accountRef:
                    account.accountRefMode === 'fixed'
                      ? account.accountRef
                      : account.accountRefMode === 'order_number'
                        ? String(number)
                        : null,
                }
              : null,
          source: manual ? 'manual' : (input.source ?? 'direct'),
          ...stamps(state.timestamps),
          awaitingPaymentSince: state.startsExpiryClock ? sql`now()` : null,
        })
        .returning();

      // One millisecond apart, so items list in the cart's order (ordered by created_at;
      // now() is the same for the whole transaction).
      const itemsAt = Date.now();
      await tx.insert(t.orderItems).values(
        lines.map((l, i) => ({
          createdAt: new Date(itemsAt + i),
          orderId: order!.id,
          productId: l.product.id,
          nameSnapshot: l.product.name,
          size: l.size,
          colour: l.colour,
          unitPrice: l.product.price,
          qty: l.qty,
          coverPathSnapshot: l.coverThumb,
        })),
      );
      await tx.insert(t.orderEvents).values({
        orderId: order!.id,
        fromStatus: null,
        toStatus: state.status,
        actor: manual ? 'seller' : 'buyer',
        meta: { action: 'create', kind: input.kind },
      });
      await insertNotifications(tx, order!, state.sideEffects);

      return { order: order!, sideEffects: state.sideEffects, replayed: false };
    });
  } catch (error) {
    if (error instanceof PricingError) throw new ValidationError(error.message);
    // Two requests with the same idempotency key at once: the loser returns the winner's order.
    if (input.idempotencyKey && isUniqueViolation(error, 'orders_idempotency_key_unique')) {
      const existing = await findByIdempotencyKey(db, input.shopId, input.idempotencyKey);
      if (existing) return { order: existing, sideEffects: [], replayed: true };
    }
    throw error;
  }
}

export interface OrderQuote {
  /** The current name and unit price of each line, in the order sent. */
  lines: {
    productId: string;
    size: string | null;
    colour: string | null;
    name: string;
    unitPrice: number;
    qty: number;
  }[];
  subtotal: number;
  /** One per delivery area (in the seller's order), then pickup when it's on. */
  options: {
    kind: 'delivery' | 'pickup';
    areaId: string | null;
    deliveryFee: number;
    total: number;
    freeDeliveryApplied: boolean;
  }[];
}

/**
 * What an order of these lines would cost with each delivery option, priced by pricing.ts
 * from the database (checkout shows it; placing the order prices it again).
 */
export async function quoteOrder(
  db: Db,
  shopId: string,
  input: NewOrderLine[],
  /** Manual orders (seller): any non-deleted product, pickup always, an optional fee override. */
  opts: { manual?: boolean; deliveryFeeOverride?: number } = {},
): Promise<OrderQuote> {
  checkId(shopId, 'shop');
  try {
    return await db.transaction(async (tx) => {
      const [shop] = await tx.select().from(t.shops).where(eq(t.shops.id, shopId));
      if (!shop) throw new NotFoundError("We couldn't find this shop.");
      const lines = await resolveLines(tx, shop.id, input, opts.manual ?? false);
      const areas = await tx
        .select()
        .from(t.deliveryAreas)
        .where(and(eq(t.deliveryAreas.shopId, shop.id), isNull(t.deliveryAreas.deletedAt)))
        .orderBy(t.deliveryAreas.position, t.deliveryAreas.createdAt);
      const priced = lines.map((l) => ({ unitPrice: l.product.price, qty: l.qty }));
      const price = (delivery: Parameters<typeof priceOrder>[0]['delivery']) =>
        priceOrder({
          lines: priced,
          delivery,
          freeDeliveryThreshold: shop.freeDeliveryThreshold,
          ...(opts.manual && opts.deliveryFeeOverride !== undefined
            ? { deliveryFeeOverride: opts.deliveryFeeOverride }
            : {}),
        });
      const options: OrderQuote['options'] = areas.map((a) => {
        const p = price({ kind: 'area', fee: a.fee, freeDeliveryEligible: a.freeDeliveryEligible });
        return {
          kind: 'delivery',
          areaId: a.id,
          deliveryFee: p.deliveryFee,
          total: p.total,
          freeDeliveryApplied: p.freeDeliveryApplied,
        };
      });
      const pickup = price({ kind: 'pickup' });
      if (shop.pickupEnabled || opts.manual) {
        options.push({
          kind: 'pickup',
          areaId: null,
          deliveryFee: pickup.deliveryFee,
          total: pickup.total,
          freeDeliveryApplied: false,
        });
      }
      return {
        lines: lines.map((l) => ({
          productId: l.product.id,
          size: l.size,
          colour: l.colour,
          name: l.product.name,
          unitPrice: l.product.price,
          qty: l.qty,
        })),
        subtotal: pickup.subtotal,
        options,
      };
    });
  } catch (error) {
    if (error instanceof PricingError) throw new ValidationError(error.message);
    throw error;
  }
}

export async function findByIdempotencyKey(db: Db, shopId: string, key: string) {
  const [row] = await db
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.idempotencyKey, key), eq(t.orders.shopId, shopId)));
  return row;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pg = ((error as { cause?: unknown })?.cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return pg?.code === '23505' && pg.constraint === constraint;
}

async function resolveLines(tx: Tx, shopId: string, lines: NewOrderLine[], manual: boolean) {
  if (lines.length === 0) throw new ValidationError('An order needs at least one item.');
  const ids = [...new Set(lines.map((l) => checkId(l.productId, 'product')))];
  const products = await tx
    .select()
    .from(t.products)
    .where(
      and(
        inArray(t.products.id, ids),
        eq(t.products.shopId, shopId),
        isNull(t.products.deletedAt),
        manual ? undefined : eq(t.products.status, 'available'),
      ),
    );
  const covers = await tx
    .select({ productId: t.productPhotos.productId, thumbKey: t.productPhotos.thumbKey })
    .from(t.productPhotos)
    .where(and(inArray(t.productPhotos.productId, ids), eq(t.productPhotos.position, 0)));

  return lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) {
      throw new ConflictError(
        manual
          ? "We couldn't find one of these products."
          : 'One of these items is no longer available.',
        'item_unavailable',
      );
    }
    const size = line.size?.trim() || null;
    const colour = line.colour?.trim() || null;
    const colourNames = (product.colours as { name: string }[]).map((c) => c.name);
    if (size ? !product.sizes.includes(size) : product.sizes.length > 0) {
      throw new ValidationError(`Pick a size for ${product.name}.`);
    }
    if (colour ? !colourNames.includes(colour) : colourNames.length > 0) {
      throw new ValidationError(`Pick a colour for ${product.name}.`);
    }
    return {
      product,
      qty: line.qty,
      size,
      colour,
      coverThumb: covers.find((c) => c.productId === product.id)?.thumbKey ?? null,
    };
  });
}

// transitionOrder -------------------------------------------------------------------------

/** Who is acting, and on which order. The actor follows from the scope. */
export type TransitionScope =
  | { kind: 'seller'; ctx: SellerCtx; orderId: string }
  | { kind: 'buyer'; ctx: OrderTokenCtx }
  | { kind: 'system'; orderId: string };

/** Actions as callers send them; the server fills in what it must not take from a client. */
export type TransitionAction =
  | Exclude<Action, { type: 'submitCode' } | { type: 'switchToPod' }>
  /** The buyer's input: the bare code or the whole M-Pesa SMS. */
  | { type: 'submitCode'; message: string }
  | { type: 'switchToPod' };

export interface TransitionOutcome {
  order: OrderRow;
  sideEffects: SideEffect[];
  /** submitCode: an earlier order of this shop with the same M-Pesa code (flag, don't block). */
  duplicateOfOrderNumber?: number;
}

const SCOPE_ACTOR: Record<TransitionScope['kind'], Actor> = {
  seller: 'seller',
  buyer: 'buyer',
  system: 'system',
};

export async function transitionOrder(
  db: Db,
  scope: TransitionScope,
  action: TransitionAction,
): Promise<TransitionOutcome> {
  const actor = SCOPE_ACTOR[scope.kind];
  return db.transaction(async (tx) => {
    // 1. The order, within the caller's scope.
    const where =
      scope.kind === 'seller'
        ? and(
            eq(t.orders.id, checkId(scope.orderId, 'order')),
            eq(t.orders.shopId, scope.ctx.shopId),
          )
        : scope.kind === 'buyer'
          ? and(
              eq(t.orders.id, scope.ctx.order.id),
              eq(t.orders.publicToken, scope.ctx.order.publicToken),
            )
          : eq(t.orders.id, checkId(scope.orderId, 'order'));
    const [order] = await tx.select().from(t.orders).where(where);
    if (!order) throw new NotFoundError("We couldn't find this order.");

    // 2. The machine decides; the server supplies facts the client can't be trusted with.
    let code: string | null = null;
    let machineAction: Action;
    if (action.type === 'submitCode') {
      code = extractMpesaCode(action.message);
      if (!code) {
        throw new ValidationError(
          "We couldn't find an M-Pesa code. It looks like SFK7Q2M9TX.",
          { code: 'Paste the M-Pesa message or type the 10-character code.' },
          'invalid_code',
        );
      }
      machineAction = { type: 'submitCode', code };
    } else if (action.type === 'switchToPod') {
      const [shop] = await tx
        .select({ acceptsPayOnDelivery: t.shops.acceptsPayOnDelivery })
        .from(t.shops)
        .where(eq(t.shops.id, order.shopId));
      machineAction = {
        type: 'switchToPod',
        shopAcceptsPayOnDelivery: !!shop?.acceptsPayOnDelivery,
      };
    } else {
      machineAction = action;
    }
    const result = next(order, machineAction, actor);
    if (!result.ok) throw new ValidationError(result.message, undefined, result.code);

    let riderPhone: string | null | undefined;
    if (action.type === 'markSent' && action.riderPhone) {
      riderPhone = normalizeKePhone(action.riderPhone);
      if (!riderPhone) {
        throw new ValidationError("Enter the rider's Kenyan mobile number.", {
          riderPhone: "Enter the rider's Kenyan mobile number.",
        });
      }
    }

    // 3–4. Apply it, only if nobody changed the order since we read it.
    await allowTransition(tx);
    const [updated] = await tx
      .update(t.orders)
      .set({
        status: result.to.status,
        paymentStatus: result.to.paymentStatus,
        paymentMethod: result.to.paymentMethod,
        ...stamps(result.timestamps),
        ...(result.restartsExpiryClock ? { awaitingPaymentSince: sql`now()` } : {}),
        ...(result.cancel
          ? {
              cancelReason: result.cancel.reason,
              cancelledBy: result.cancel.by,
              cancelNote: result.cancel.note?.trim() || null,
            }
          : {}),
        ...(code ? { mpesaCode: code } : {}),
        ...(action.type === 'markSent'
          ? { sentMethod: action.sentMethod, riderPhone: riderPhone ?? null }
          : {}),
      })
      .where(
        and(
          eq(t.orders.id, order.id),
          eq(t.orders.status, order.status),
          eq(t.orders.paymentStatus, order.paymentStatus),
        ),
      )
      .returning();
    if (!updated) throw new ConflictError('This order changed. Refresh and try again.');

    // 5. The audit log.
    await tx.insert(t.orderEvents).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: updated.status,
      actor,
      meta: {
        action: action.type,
        ...(order.paymentStatus !== updated.paymentStatus
          ? { paymentFrom: order.paymentStatus, paymentTo: updated.paymentStatus }
          : {}),
        ...(result.cancel ? { reason: result.cancel.reason } : {}),
      },
    });

    // 6. Payment claims: a new one on submit, the outcome once the seller answers.
    let duplicateOfOrderNumber: number | undefined;
    if (action.type === 'submitCode' && code) {
      const [earlier] = await tx
        .select({ number: t.orders.number })
        .from(t.paymentClaims)
        .innerJoin(t.orders, eq(t.orders.id, t.paymentClaims.orderId))
        .where(
          and(
            eq(t.paymentClaims.shopId, order.shopId),
            eq(t.paymentClaims.mpesaCode, code),
            ne(t.paymentClaims.orderId, order.id),
          ),
        )
        .orderBy(t.paymentClaims.createdAt)
        .limit(1);
      duplicateOfOrderNumber = earlier?.number;
      await tx.insert(t.paymentClaims).values({
        orderId: order.id,
        shopId: order.shopId,
        mpesaCode: code,
        rawMessage:
          action.message.trim().toUpperCase() === code
            ? null
            : action.message.trim().slice(0, 1000),
      });
    } else {
      const outcome = claimOutcome(action, order.paymentStatus, updated.paymentStatus);
      if (outcome) {
        const [pending] = await tx
          .select({ id: t.paymentClaims.id })
          .from(t.paymentClaims)
          .where(and(eq(t.paymentClaims.orderId, order.id), eq(t.paymentClaims.outcome, 'pending')))
          .orderBy(desc(t.paymentClaims.createdAt))
          .limit(1);
        if (pending) {
          await tx
            .update(t.paymentClaims)
            .set({ outcome })
            .where(eq(t.paymentClaims.id, pending.id));
        }
      }
    }

    // 7. In-app notification rows now; push (M6) and emails are sent by the caller.
    await insertNotifications(tx, updated, result.sideEffects);
    return {
      order: updated,
      sideEffects: result.sideEffects,
      ...(duplicateOfOrderNumber !== undefined ? { duplicateOfOrderNumber } : {}),
    };
  });
}

/** How the seller's answer settles the latest pending claim, if it does. */
function claimOutcome(
  action: TransitionAction,
  from: OrderRow['paymentStatus'],
  to: OrderRow['paymentStatus'],
): 'confirmed' | 'not_found' | null {
  if (from !== 'claimed' || to === 'claimed') return null;
  if (action.type === 'paymentNotFound') return 'not_found';
  // confirmPayment, or a cancel / resolveClaim answering "Did you receive the money?"
  return to === 'unpaid' ? 'not_found' : 'confirmed';
}
