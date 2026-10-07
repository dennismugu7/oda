import 'server-only';
import { and, count, eq, inArray } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  BUYER_LIMITS,
  checkoutInput,
  codeInput,
  MAX_OPEN_ORDERS_PER_PHONE,
  OPEN_ORDER_STATUSES,
  quoteInput,
  reportInput,
  visitSource,
} from '@oda/shared';
import { requireOrderToken, type OrderTokenCtx } from './authz';
import { getDb } from './db';
import { afterOrderChange } from './afterOrder';
import { serverEnv } from './env';
import {
  ConflictError,
  CrossSiteError,
  parseInput,
  toResponse,
  TooManyRequestsError,
  ValidationError,
} from './errors';
import { findByIdempotencyKey, insertOrder, quoteOrder, transitionOrder } from './orders';
import { orderLink } from './orderLink';
import { clientIp, hitLimit, secondsLeftInWindow, type Limit } from './rateLimit';
import { takingOrders } from './storefront';
import { body, findShop } from './storefrontRoutes';

// Buyer checkout and order actions (M5, docs/m5-plan.md, decision #61). Orders are created only
// by insertOrder() and change only through transitionOrder(); this file adds what the public
// endpoints need around them: the Origin check, the honeypot, rate limits, the open-orders cap,
// and the buyer emails and seller pushes after the response (afterOrder.ts).

const t = schema;
type Params<P> = { params: Promise<P> };

/** Runs work after the response is sent (Next's `after` in routes; tests run it directly). */
export type Defer = (work: () => Promise<void>) => void;

export { orderLink };

/**
 * Buyer writes must come from our own pages (m5-plan threats: cross-site form spam). Browsers
 * send Origin on every POST from a script; without it, Sec-Fetch-Site must say same-origin.
 */
export function assertSameOrigin(request: Request): void {
  const allowed = new Set<string>([new URL(request.url).origin]);
  allowed.add(new URL(serverEnv().PUBLIC_SHOP_BASE_URL).origin);
  const proto =
    request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.slice(0, -1);
  for (const host of [request.headers.get('x-forwarded-host'), request.headers.get('host')]) {
    if (host) allowed.add(`${proto}://${host}`);
  }
  const origin = request.headers.get('origin');
  if (origin) {
    if (!allowed.has(origin)) throw new CrossSiteError();
    return;
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') throw new CrossSiteError();
}

async function limit(db: Db, key: string, l: Limit, message: string) {
  if (!(await hitLimit(db, key, l))) {
    throw new TooManyRequestsError(message, secondsLeftInWindow(l));
  }
}

// Checkout ------------------------------------------------------------------------------------

/** POST /api/shops/:slug/orders — place an order. 201 { token } (200 for a repeat). */
export async function postOrder(
  request: Request,
  { params }: Params<{ slug: string }>,
  defer: Defer,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const raw = (await body(request)) as Record<string, unknown> | null;
    if (raw && typeof raw.website === 'string' && raw.website.trim() !== '') {
      console.warn('[checkout] honeypot filled, order refused');
      throw new ValidationError("We couldn't place this order. Refresh the page and try again.");
    }
    const input = parseInput(checkoutInput, raw);
    const shop = await findShop((await params).slug);

    // A retry of an order that went through gets it back, without counting against limits.
    const existing = await findByIdempotencyKey(db, shop.id, input.idempotencyKey);
    if (existing) return Response.json({ token: existing.publicToken }, { status: 200 });

    if (shop.isPaused) {
      throw new ConflictError(`${shop.name} is taking a break. Try again soon.`, 'shop_paused');
    }
    if (!takingOrders(shop)) {
      throw new ConflictError(`${shop.name} isn't taking orders yet.`, 'not_taking_orders');
    }

    const phone = input.buyer.phone;
    await limit(
      db,
      `order-phone:${shop.id}:${phone}`,
      BUYER_LIMITS.ordersPerPhonePerShop,
      'You’ve placed several orders in the last hour. Try again later, or message the seller.',
    );
    await limit(
      db,
      `order-ip:${shop.id}:${clientIp(request.headers)}`,
      BUYER_LIMITS.ordersPerIpPerShop,
      'Too many orders from this connection. Try again later.',
    );
    const [open] = await db
      .select({ n: count() })
      .from(t.orders)
      .where(
        and(
          eq(t.orders.shopId, shop.id),
          eq(t.orders.buyerPhone, phone),
          inArray(t.orders.status, [...OPEN_ORDER_STATUSES]),
        ),
      );
    if ((open?.n ?? 0) >= MAX_OPEN_ORDERS_PER_PHONE) {
      throw new ConflictError(
        `You have ${MAX_OPEN_ORDERS_PER_PHONE} open orders with ${shop.name}. Finish or cancel some first.`,
        'too_many_open_orders',
      );
    }

    const result = await insertOrder(db, {
      shopId: shop.id,
      kind: input.payment === 'pay_now' ? 'buyer_pay_now' : 'buyer_pay_on_delivery',
      source: visitSource(input.source) as Exclude<ReturnType<typeof visitSource>, 'manual'>,
      buyer: input.buyer,
      fulfilment: input.fulfilment,
      lines: input.lines,
      idempotencyKey: input.idempotencyKey,
      expectedTotal: input.expectedTotal,
    });
    if (!result.replayed) defer(() => afterOrderChange(db, result.order, result.sideEffects));
    return Response.json(
      { token: result.order.publicToken },
      { status: result.replayed ? 200 : 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return toResponse(error);
  }
}

/** POST /api/shops/:slug/quote — subtotal and total for each delivery option. */
export async function postQuote(
  request: Request,
  { params }: Params<{ slug: string }>,
): Promise<Response> {
  try {
    const db = getDb();
    await limit(
      db,
      `quote-ip:${clientIp(request.headers)}`,
      BUYER_LIMITS.quotesPerIp,
      'Too many requests.',
    );
    const shop = await findShop((await params).slug);
    const { lines } = parseInput(quoteInput, await body(request));
    const quote = await quoteOrder(db, shop.id, lines);
    return Response.json(quote, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}

// The buyer's order -------------------------------------------------------------------------

/**
 * Opens an order by its token, counting one lookup per IP (guessing links is slow). A
 * malformed or unknown token is the same 404.
 */
export async function openOrder(db: Db, token: unknown, headers: Headers): Promise<OrderTokenCtx> {
  await limit(
    db,
    `order-lookup-ip:${clientIp(headers)}`,
    BUYER_LIMITS.orderLookupsPerIp,
    'Too many requests. Wait a minute and try again.',
  );
  return requireOrderToken(token, db);
}

/**
 * The order's shop as the buyer pages need it: `closed` = deleted (decision #38 c);
 * `browsable` = its shop page is open (not deleted, not suspended). A suspended shop's orders
 * carry on as usual: the seller finishes them (decision #81 d).
 */
export async function orderShop(db: Db, ctx: OrderTokenCtx) {
  const [shop] = await db
    .select({
      deletedAt: t.shops.deletedAt,
      suspendedAt: t.shops.suspendedAt,
      acceptsPayOnDelivery: t.shops.acceptsPayOnDelivery,
    })
    .from(t.shops)
    .where(eq(t.shops.id, ctx.order.shopId));
  const closed = !shop || !!shop.deletedAt;
  return {
    closed,
    browsable: !closed && !shop.suspendedAt,
    acceptsPayOnDelivery: !!shop?.acceptsPayOnDelivery,
  };
}

function assertOpenShop(shop: { closed: boolean }) {
  if (shop.closed) {
    throw new ConflictError(
      'This shop has closed, so the order can’t change. You can still report a problem.',
      'shop_closed',
    );
  }
}

type BuyerActionKind = 'code' | 'switch-to-pod' | 'cancel';

async function buyerAction(
  request: Request,
  { params }: Params<{ token: string }>,
  kind: BuyerActionKind,
  defer: Defer,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const ctx = await openOrder(db, (await params).token, request.headers);
    assertOpenShop(await orderShop(db, ctx));
    const scope = { kind: 'buyer' as const, ctx };
    let outcome;
    if (kind === 'code') {
      await limit(
        db,
        `order-code:${ctx.order.id}`,
        BUYER_LIMITS.codesPerOrder,
        'Too many tries. Wait a while, or message the seller.',
      );
      const { message } = parseInput(codeInput, await body(request));
      outcome = await transitionOrder(db, scope, { type: 'submitCode', message });
    } else if (kind === 'switch-to-pod') {
      outcome = await transitionOrder(db, scope, { type: 'switchToPod' });
    } else {
      outcome = await transitionOrder(db, scope, { type: 'buyerCancel' });
    }
    const { order, sideEffects } = outcome;
    defer(() => afterOrderChange(db, order, sideEffects));
    return Response.json({ status: order.status }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}

/** POST /api/o/:token/code — "I've paid" with the M-Pesa SMS or code. */
export const postOrderCode = (r: Request, p: Params<{ token: string }>, defer: Defer) =>
  buyerAction(r, p, 'code', defer);
/** POST /api/o/:token/switch-to-pod — "Pay on delivery instead". */
export const postSwitchToPod = (r: Request, p: Params<{ token: string }>, defer: Defer) =>
  buyerAction(r, p, 'switch-to-pod', defer);
/** POST /api/o/:token/cancel — the buyer cancels. */
export const postBuyerCancel = (r: Request, p: Params<{ token: string }>, defer: Defer) =>
  buyerAction(r, p, 'cancel', defer);

/** POST /api/o/:token/report — "Report a problem to oda" (also for a closed shop). */
export async function postReport(
  request: Request,
  { params }: Params<{ token: string }>,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const raw = (await body(request)) as Record<string, unknown> | null;
    if (raw && typeof raw.website === 'string' && raw.website.trim() !== '') {
      console.warn('[report] honeypot filled, report refused');
      throw new ValidationError("We couldn't send this. Refresh the page and try again.");
    }
    const ctx = await openOrder(db, (await params).token, request.headers);
    const input = parseInput(reportInput, raw);
    await limit(
      db,
      `report-order:${ctx.order.id}`,
      BUYER_LIMITS.reportsPerOrder,
      'You’ve already reported this order today. We’ll look into it.',
    );
    await limit(
      db,
      `report-ip:${clientIp(request.headers)}`,
      BUYER_LIMITS.reportsPerIp,
      'Too many reports today. Try again tomorrow.',
    );
    await db
      .insert(t.reports)
      .values({ orderId: ctx.order.id, message: input.message, contactPhone: input.contactPhone });
    return Response.json({ ok: true }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
