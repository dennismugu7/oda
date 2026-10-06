import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { WRITE_SCHEMAS, type CreationKind, type OrderSource, type SentMethod } from '@oda/shared';
import { getAuth } from '../auth';
import { requireOrderToken, type SellerCtx } from '../authz';
import { parseInput } from '../errors';
import { insertOrder, transitionOrder, type TransitionAction } from '../orders';
import { sellerRepo } from '../repos/seller';
import { userRepo } from '../repos/user';
import {
  ADMIN,
  AREAS,
  CATEGORIES,
  OLD_PRODUCTS,
  PEOPLE,
  PRODUCTS,
  REGULARS,
  REPLIES,
  REVIEW_TAGS,
  REVIEW_TEXTS,
  SELLER,
  SHOP,
  TILL,
  type AreaKey,
  type PersonKey,
  type ProductKey,
} from './data';

// Builds the demo shop through the real code paths: Better Auth sign-ups, the seller
// repositories, insertOrder() and transitionOrder(), so triggers, events and counters are
// real. Timestamps are then moved into the past (they aren't guarded; status is).
// Deterministic apart from "now".

const t = schema;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NAIROBI_OFFSET = 3 * HOUR; // Africa/Nairobi is UTC+3 all year

/** Small deterministic PRNG (mulberry32), so every run builds the same shop. */
function prng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
  };
}

/** Monday 00:00 of the current week in Nairobi, as a UTC Date. */
function nairobiWeekStart(now: Date): Date {
  const local = new Date(now.getTime() + NAIROBI_OFFSET);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnight - daysSinceMonday * DAY - NAIROBI_OFFSET);
}

type Step =
  | TransitionAction['type']
  | { type: 'markSent'; sentMethod: SentMethod; riderPhone?: string }
  | { type: 'markDelivered'; collected?: boolean }
  | { type: 'sellerCancel'; reason: 'out_of_stock' | 'buyer_asked'; receivedClaimed?: boolean }
  | { type: 'resolveClaim'; received: boolean };

interface OrderSpec {
  at: Date;
  /** When the last step happened (default: spread over a few hours after `at`). */
  end?: Date;
  buyer: string;
  phone: string;
  source?: Exclude<OrderSource, 'manual'>;
  kind: CreationKind;
  fulfilment: 'pickup' | AreaKey;
  lines: { product: string; qty?: number; size?: string }[];
  steps?: Step[];
  code?: string;
  /** Review once delivered. */
  review?: {
    rating: 1 | 3 | 4 | 5;
    text: string;
    reply: string | null;
    productIndex?: number;
    at?: Date;
  };
}

export interface SeedSummary {
  products: number;
  orders: number;
  delivered: number;
  reviews: number;
  rating: string | null;
  orderNumbers: Record<string, number>;
}

export async function seed(db: Db, opts: { password: string; now?: Date }): Promise<SeedSummary> {
  const now = opts.now ?? new Date();
  const rnd = prng(20261002);
  const auth = getAuth();
  const [existing] = await db.select({ id: t.shops.id }).from(t.shops).limit(1);
  if (existing)
    throw new Error('The database already has data: run `pnpm db:reset` to seed from zero');

  // Users -------------------------------------------------------------------------------
  const sellerSignUp = await auth.api.signUpEmail({
    body: { name: SELLER.name, email: SELLER.email, password: opts.password },
  });
  const adminSignUp = await auth.api.signUpEmail({
    body: { name: ADMIN.name, email: ADMIN.email, password: opts.password },
  });
  // Seed accounts skip the emailed code (decision #43): mark both emails verified.
  await db
    .update(t.authUser)
    .set({ emailVerified: true })
    .where(inArray(t.authUser.id, [sellerSignUp.user.id, adminSignUp.user.id]));
  await db.update(t.profiles).set({ isAdmin: true }).where(eq(t.profiles.id, adminSignUp.user.id));
  const sellerUserId = sellerSignUp.user.id;
  const userCtx = { userId: sellerUserId } as Parameters<typeof userRepo>[1];
  await userRepo(db, userCtx).updateProfile(
    parseInput(WRITE_SCHEMAS.profileUpdate, {
      firstName: 'Amani',
      lastName: 'Wairimu',
      recoveryPhone: SHOP.whatsappPhone,
    }),
  );

  // Shop --------------------------------------------------------------------------------
  const shop = await userRepo(db, userCtx).createShop(
    parseInput(WRITE_SCHEMAS.shopCreate, {
      name: SHOP.name,
      slug: SHOP.slug,
      whatsappPhone: SHOP.whatsappPhone,
      businessType: SHOP.businessType,
      channels: SHOP.channels,
    }),
  );
  const ctx = { userId: sellerUserId, shopId: shop.id } as SellerCtx;
  const repo = sellerRepo(db, ctx);
  await repo.updateShop(
    parseInput(WRITE_SCHEMAS.shopUpdate, {
      about: SHOP.about,
      locationLabel: SHOP.locationLabel,
      callsEnabled: SHOP.callsEnabled,
      tiktokHandle: SHOP.tiktokHandle,
      acceptsPayBefore: SHOP.acceptsPayBefore,
      acceptsPayOnDelivery: SHOP.acceptsPayOnDelivery,
      pickupEnabled: SHOP.pickupEnabled,
      pickupLocation: SHOP.pickupLocation,
      pickupHours: SHOP.pickupHours,
      freeDeliveryThreshold: SHOP.freeDeliveryThreshold,
      onboardingStep: 6,
      // 5 of 7 on "Finish your shop": no logo, WhatsApp link not tested yet.
      checklist: { shared_link: true },
    }),
  );
  await db
    .update(t.shops)
    .set({
      onboardingCompletedAt: new Date(now.getTime() - 130 * DAY),
      createdAt: new Date(now.getTime() - 130 * DAY),
    })
    .where(eq(t.shops.id, shop.id));

  const account = await repo.createPaymentAccount(
    parseInput(WRITE_SCHEMAS.paymentAccountInput, TILL),
  );
  await db
    .update(t.paymentAccounts)
    .set({
      verificationStatus: 'verified',
      verifiedBy: adminSignUp.user.id,
      verifiedAt: new Date(now.getTime() - 128 * DAY),
    })
    .where(eq(t.paymentAccounts.id, account.id));

  const areas = {} as Record<AreaKey, string>;
  let position = 0;
  for (const [key, a] of Object.entries(AREAS) as [AreaKey, (typeof AREAS)[AreaKey]][]) {
    const row = await repo.createDeliveryArea(
      parseInput(WRITE_SCHEMAS.deliveryAreaInput, {
        name: a.name,
        fee: a.fee,
        method: a.method,
        etaLabel: a.etaLabel,
        freeDeliveryEligible: a.free,
        position: position++,
      }),
    );
    areas[key] = row.id;
  }

  const categories = {} as Record<string, string>;
  for (const [i, name] of CATEGORIES.entries()) {
    categories[name] = (await repo.createCategory({ name, isVisible: true, position: i })).id;
  }

  // Products: the 13 visible ones, newest first, and the older (soft-deleted) stock -------
  const products = {} as Record<string, string>;
  const visible = Object.entries(PRODUCTS) as [ProductKey, (typeof PRODUCTS)[ProductKey]][];
  for (const [i, [key, p]] of visible.entries()) {
    const row = await repo.createProduct(
      parseInput(WRITE_SCHEMAS.productInput, {
        name: p.name,
        price: p.price,
        compareAtPrice: 'compareAtPrice' in p ? p.compareAtPrice : null,
        categoryId: categories[p.category],
        sizes: 'sizes' in p ? p.sizes : [],
        position: i,
      }),
    );
    // Created available so orders can use it; the final status is set after the orders.
    products[key] = row.id;
    await db
      .update(t.products)
      .set({ createdAt: new Date(now.getTime() - (20 + i * 7) * DAY) })
      .where(eq(t.products.id, row.id));
  }
  for (const [i, p] of OLD_PRODUCTS.entries()) {
    const row = await repo.createProduct(
      parseInput(WRITE_SCHEMAS.productInput, {
        name: p.name,
        price: p.price,
        categoryId: categories[p.category],
      }),
    );
    products[`old${i}`] = row.id;
  }

  // Orders ------------------------------------------------------------------------------
  const phones = new Map<string, string>();
  const phoneOf = (name: string) => {
    if (!phones.has(name))
      phones.set(name, `+2547${String(10000000 + phones.size * 7919).slice(-8)}`);
    return phones.get(name)!;
  };
  const person = (key: PersonKey) => ({ buyer: PEOPLE[key], phone: phoneOf(PEOPLE[key]) });
  const code = () => {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let c = rnd.pick([...letters]);
    for (let i = 0; i < 9; i++) c += rnd.pick([...chars]);
    return c;
  };

  const specs: (OrderSpec & { label?: string })[] = [];
  const ago = (ms: number) => new Date(now.getTime() - ms);

  // History: 123 delivered orders on the older stock, ~120 to 8 days ago.
  // The designs' repeat buyers also bought before.
  const repeaters: Record<number, PersonKey> = {
    7: 'njeri',
    27: 'njeri',
    47: 'wanjiku',
    67: 'achieng',
    87: 'kevin',
  };
  const sources: Exclude<OrderSource, 'manual'>[] = [
    'tt',
    'tt',
    'tt',
    'tt',
    'tt',
    'wa',
    'wa',
    'ig',
    'ig',
    'status',
    'fb',
    'qr',
  ];
  const ratings: (1 | 3 | 4 | 5)[] = [...Array<5>(32).fill(5), 4, 4, 3, 1];
  const ratingSlots = new Set<number>();
  while (ratingSlots.size < ratings.length) ratingSlots.add(rnd.int(0, 122));
  const slotOrder = [...ratingSlots].sort((a, b) => a - b);
  for (let i = 0; i < 123; i++) {
    const at = ago((120 - (i * 112) / 123) * DAY - rnd.int(9, 18) * HOUR);
    const repeater = repeaters[i];
    const who = repeater ? person(repeater) : null;
    const name = who?.buyer ?? rnd.pick(REGULARS);
    const style = rnd.next();
    const kind: CreationKind =
      style < 0.75 ? 'buyer_pay_now' : style < 0.9 ? 'buyer_pay_on_delivery' : 'manual_paid';
    const fulfilment = rnd.pick([
      'near',
      'near',
      'nairobi',
      'nairobi',
      'outside',
      'pickup',
    ] as const);
    const lineCount = rnd.next() < 0.25 ? 2 : 1;
    const lines = Array.from({ length: lineCount }, () => ({
      product: `old${rnd.int(0, OLD_PRODUCTS.length - 1)}`,
      qty: rnd.next() < 0.15 ? 2 : 1,
    }));
    const unique = lines.filter((l, j) => lines.findIndex((m) => m.product === l.product) === j);
    const sent: Step = {
      type: 'markSent',
      sentMethod:
        fulfilment === 'pickup' ? 'pickup' : fulfilment === 'outside' ? 'parcel' : 'rider',
    };
    const steps: Step[] =
      kind === 'buyer_pay_now'
        ? ['submitCode', 'confirmPayment', sent, { type: 'markDelivered' }]
        : kind === 'buyer_pay_on_delivery'
          ? ['accept', sent, { type: 'markDelivered', collected: true }]
          : [sent, { type: 'markDelivered' }];
    const slot = slotOrder.indexOf(i);
    const rating = slot >= 0 ? ratings[(slot * 7) % ratings.length]! : null;
    specs.push({
      at,
      end: new Date(at.getTime() + rnd.int(18, 40) * HOUR),
      buyer: name,
      phone: phoneOf(name),
      source: rnd.pick(sources),
      kind,
      fulfilment,
      lines: unique,
      steps,
      code: kind === 'buyer_pay_now' ? code() : undefined,
      ...(rating
        ? {
            review: {
              rating,
              text: rnd.pick(REVIEW_TEXTS[rating]),
              // Everything has a reply except one (with Njeri's below: "Needs reply 2").
              reply: rating === 1 && slot >= 0 ? null : rnd.pick(REPLIES.slice(0, 3)),
            },
          }
        : {}),
    });
  }

  // Recent orders: the designs' to-do list, sales and every other state.
  const weekStart = nairobiWeekStart(now);
  const span = Math.max(now.getTime() - weekStart.getTime() - 2 * HOUR, HOUR);
  const thisWeek = (fraction: number) => new Date(weekStart.getTime() + span * fraction);
  const refundedCode = code();

  specs.push(
    // Delivered before this week, on the visible products (their sold counts).
    {
      ...person('mercy'),
      at: ago(12 * DAY),
      end: ago(11 * DAY),
      source: 'ig',
      kind: 'buyer_pay_now',
      fulfilment: 'nairobi',
      lines: [{ product: 'ankara', size: 'M' }, { product: 'kiondo' }],
      steps: [
        'submitCode',
        'confirmPayment',
        { type: 'markSent', sentMethod: 'rider' },
        { type: 'markDelivered' },
      ],
      code: code(),
    },
    {
      ...person('wanjiku'),
      at: ago(10 * DAY),
      end: ago(3 * DAY + 4 * HOUR),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'nairobi',
      lines: [
        { product: 'ankara', size: 'M' },
        { product: 'kitengeTop', size: 'S' },
      ],
      steps: [
        'submitCode',
        'confirmPayment',
        { type: 'markSent', sentMethod: 'rider' },
        { type: 'markDelivered' },
      ],
      code: code(),
      review: {
        rating: 4,
        text: 'Beautiful dress. The rider came a bit late but Amani kept me updated.',
        reply: "Asante Wanjiku! Sorry about the wait, we've found a faster rider.",
        productIndex: 0,
        at: ago(3 * DAY),
      },
    },
    {
      ...person('njeri'),
      at: ago(9 * DAY),
      end: ago(1 * DAY + 3 * HOUR),
      source: 'wa',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [
        { product: 'kitengeTop', size: 'L' },
        { product: 'linenShirt', size: 'L' },
      ],
      steps: [
        'submitCode',
        'confirmPayment',
        { type: 'markSent', sentMethod: 'rider' },
        { type: 'markDelivered' },
      ],
      code: code(),
      review: {
        rating: 5,
        text: 'Fits perfectly and the fabric is so soft. Delivered the same day to Westlands!',
        reply: null,
        productIndex: 0,
        at: ago(1 * DAY),
      },
    },
    // Cancelled, refunds and an unresolved claim (not sales).
    {
      buyer: REGULARS[3],
      phone: phoneOf(REGULARS[3]),
      at: ago(16 * DAY),
      end: ago(14 * DAY),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [{ product: 'shiftDress', size: 'M' }],
      steps: [
        'submitCode',
        'confirmPayment',
        { type: 'sellerCancel', reason: 'out_of_stock' },
        'markRefundSent',
      ],
      code: refundedCode,
    },
    {
      buyer: REGULARS[8],
      phone: phoneOf(REGULARS[8]),
      at: ago(13 * DAY),
      end: ago(13 * DAY - 2 * HOUR),
      kind: 'manual_paid',
      fulfilment: 'pickup',
      lines: [{ product: 'loafers', size: '39' }],
      steps: [{ type: 'sellerCancel', reason: 'out_of_stock' }],
    },
    {
      buyer: REGULARS[12],
      phone: phoneOf(REGULARS[12]),
      at: ago(11 * DAY),
      end: ago(9 * DAY),
      source: 'ig',
      kind: 'buyer_pay_now',
      fulfilment: 'outside',
      lines: [{ product: 'tote' }],
      steps: ['autoExpire'],
    },
    {
      buyer: REGULARS[17],
      phone: phoneOf(REGULARS[17]),
      at: ago(8 * DAY),
      end: ago(8 * DAY - 3 * HOUR),
      source: 'fb',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [{ product: 'maxiDress', size: 'L' }],
      // Same code as the refunded order above: flagged as a duplicate. The buyer then cancelled.
      steps: ['submitCode', 'buyerCancel'],
      code: refundedCode,
    },
    // This week: sent, to send (4), to confirm (2), new (3) and a buyer cancel.
    {
      ...person('grace'),
      at: thisWeek(0.05),
      end: thisWeek(0.2),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'outside',
      lines: [{ product: 'ankara', qty: 2, size: 'L' }],
      steps: ['submitCode', 'confirmPayment', { type: 'markSent', sentMethod: 'parcel' }],
      code: code(),
    },
    {
      ...person('faith'),
      at: thisWeek(0.1),
      end: thisWeek(0.25),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'pickup',
      lines: [{ product: 'kiondo' }],
      steps: ['submitCode', 'confirmPayment', { type: 'markSent', sentMethod: 'pickup' }],
      code: code(),
    },
    {
      ...person('linet'),
      at: thisWeek(0.2),
      end: thisWeek(0.3),
      source: 'wa',
      kind: 'buyer_pay_on_delivery',
      fulfilment: 'near',
      lines: [{ product: 'linenShirt', size: 'M' }],
      steps: ['accept'],
    },
    {
      ...person('joy'),
      at: thisWeek(0.3),
      end: thisWeek(0.4),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [{ product: 'kiondo', qty: 2 }],
      steps: ['submitCode', 'confirmPayment'],
      code: code(),
    },
    {
      buyer: REGULARS[5],
      phone: phoneOf(REGULARS[5]),
      at: thisWeek(0.4),
      end: thisWeek(0.45),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [{ product: 'earrings' }],
      steps: ['buyerCancel'],
    },
    {
      ...person('njeri'),
      label: 'njeri-manual',
      at: thisWeek(0.6),
      kind: 'manual_paid',
      fulfilment: 'pickup',
      lines: [
        { product: 'kitengeTop', size: 'M' },
        { product: 'ankara', size: 'XL' },
      ],
    },
    {
      ...person('otieno'),
      label: 'otieno',
      at: thisWeek(0.8),
      end: thisWeek(0.85),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'pickup',
      lines: [{ product: 'maxiDress', size: 'M' }],
      steps: ['submitCode', 'confirmPayment'],
      code: code(),
    },
    {
      ...person('peter'),
      at: thisWeek(0.65),
      kind: 'manual_not_paid',
      fulfilment: 'pickup',
      lines: [{ product: 'linenShirt', size: 'L' }],
    },
    {
      ...person('kevin'),
      at: thisWeek(0.55),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [{ product: 'sandals', size: '41' }],
    },
    {
      ...person('achieng'),
      label: 'achieng',
      at: ago(30 * MIN),
      source: 'ig',
      kind: 'buyer_pay_on_delivery',
      fulfilment: 'near',
      lines: [
        { product: 'linenShirt', size: 'M' },
        { product: 'kitengeTop', size: 'S' },
      ],
    },
    {
      ...person('wanjiku'),
      label: 'wanjiku',
      at: ago(70 * MIN),
      end: ago(12 * MIN),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'near',
      lines: [{ product: 'kitengeTop', size: 'L' }, { product: 'earrings' }],
      steps: ['submitCode'],
      code: 'TIG4K7XQ2P',
    },
    {
      ...person('brian'),
      label: 'brian',
      at: ago(50 * MIN),
      end: ago(40 * MIN),
      source: 'tt',
      kind: 'buyer_pay_now',
      fulfilment: 'pickup',
      lines: [{ product: 'kitengeTop', size: 'M' }],
      steps: ['submitCode'],
      code: code(),
    },
  );

  // Numbers follow time, so place the orders in time order.
  specs.sort((a, b) => a.at.getTime() - b.at.getTime());

  const orderNumbers: Record<string, number> = {};
  const deliveredReviews: { orderId: string; spec: OrderSpec; deliveredAt: Date }[] = [];
  for (const spec of specs) {
    const { order } = await insertOrder(db, {
      shopId: shop.id,
      kind: spec.kind,
      ...(spec.source ? { source: spec.source } : {}),
      buyer: { name: spec.buyer, phone: spec.phone },
      fulfilment:
        spec.fulfilment === 'pickup'
          ? { kind: 'pickup' }
          : {
              kind: 'delivery',
              areaId: areas[spec.fulfilment],
              addressText: 'Near the main road, gate B',
            },
      lines: spec.lines.map((l) => ({
        productId: products[l.product]!,
        qty: l.qty ?? 1,
        size: l.size ?? null,
      })),
    });
    if (spec.label) orderNumbers[spec.label] = order.number;

    const steps = spec.steps ?? [];
    for (const step of steps) {
      const action = (typeof step === 'string' ? { type: step } : step) as TransitionAction;
      if (action.type === 'submitCode') (action as { message: string }).message = spec.code!;
      const scope =
        action.type === 'submitCode' ||
        action.type === 'buyerCancel' ||
        action.type === 'switchToPod'
          ? { kind: 'buyer' as const, ctx: await requireOrderToken(order.publicToken, db) }
          : action.type === 'autoExpire'
            ? { kind: 'system' as const, orderId: order.id }
            : { kind: 'seller' as const, ctx, orderId: order.id };
      await transitionOrder(db, scope, action);
    }

    const times = await backdate(db, order.id, spec, steps, now);
    if (spec.review && times.deliveredAt) {
      deliveredReviews.push({ orderId: order.id, spec, deliveredAt: times.deliveredAt });
    }
  }

  // Reviews -----------------------------------------------------------------------------
  for (const { orderId, spec, deliveredAt } of deliveredReviews) {
    const r = spec.review!;
    const at =
      r.at ??
      new Date(Math.min(deliveredAt.getTime() + rnd.int(3, 30) * HOUR, now.getTime() - HOUR));
    const items = await db
      .select()
      .from(t.orderItems)
      .where(eq(t.orderItems.orderId, orderId))
      .orderBy(asc(t.orderItems.createdAt));
    const [first] = spec.buyer.split(' ');
    const [review] = await db
      .insert(t.reviews)
      .values({
        orderId,
        shopId: shop.id,
        buyerDisplayName: `${first} ${spec.buyer.split(' ')[1]?.[0] ?? ''}.`,
        rating: r.rating,
        tags: REVIEW_TAGS.filter(() => rnd.next() < (r.rating >= 4 ? 0.5 : 0.1)),
        sellerReply: r.reply,
        repliedAt: r.reply
          ? new Date(Math.min(at.getTime() + 5 * HOUR, now.getTime() - 30 * MIN))
          : null,
        editableUntil: new Date(at.getTime() + 7 * DAY),
        createdAt: at,
      })
      .returning();
    const reviewed = r.productIndex ?? 0;
    await db.insert(t.reviewItems).values(
      items.map((item, i) => ({
        reviewId: review!.id,
        orderItemId: item.id,
        productId: item.productId,
        rating: i === reviewed ? r.rating : null,
        text: i === reviewed ? r.text : null,
      })),
    );
  }

  // Final product states, then retire the older stock -----------------------------------
  for (const [key, p] of visible) {
    if ('status' in p && p.status) {
      await db
        .update(t.products)
        .set({ status: p.status })
        .where(eq(t.products.id, products[key]!));
    }
  }
  const oldIds = OLD_PRODUCTS.map((_, i) => products[`old${i}`]!);
  await db
    .update(t.products)
    .set({ deletedAt: new Date(now.getTime() - 7 * DAY) })
    .where(inArray(t.products.id, oldIds));

  // A few unread notifications for the bell.
  const recent = await db
    .select()
    .from(t.orders)
    .where(
      inArray(t.orders.number, [orderNumbers.wanjiku!, orderNumbers.brian!, orderNumbers.achieng!]),
    );
  await db.insert(t.notifications).values(
    recent.map((o) => ({
      shopId: shop.id,
      type: o.status === 'payment_claimed' ? ('payment_claimed' as const) : ('new_order' as const),
      orderId: o.id,
      title:
        o.status === 'payment_claimed'
          ? `${o.buyerName.split(' ')[0]} says they paid`
          : `New order #${o.number}`,
      body: `#${o.number} · KSh ${o.total.toLocaleString('en-KE')}`,
      createdAt: o.claimedAt ?? o.placedAt,
    })),
  );

  // Shop visits for Insights (M8b): the last 35 Nairobi days, by source.
  const visitSources = ['tt', 'wa', 'ig', 'direct', 'status'] as const;
  const visitRows = [];
  for (let d = 0; d < 35; d++) {
    const day = new Date(now.getTime() + 3 * HOUR - d * DAY).toISOString().slice(0, 10);
    for (const source of visitSources) {
      const visits = rnd.int(0, source === 'tt' ? 30 : 12);
      if (visits) visitRows.push({ shopId: shop.id, day, source, visits });
    }
  }
  await db.insert(t.shopVisitsDaily).values(visitRows);

  const [final] = await db.select().from(t.shops).where(eq(t.shops.id, shop.id));
  return {
    products: visible.length,
    orders: specs.length,
    delivered: final!.deliveredCount,
    reviews: final!.ratingCount,
    rating: final!.ratingAvg,
    orderNumbers,
  };
}

/** Moves an order's timestamps (and its events and claims) to the spec's times. */
async function backdate(db: Db, orderId: string, spec: OrderSpec, steps: Step[], now: Date) {
  const cap = (d: Date) => new Date(Math.min(d.getTime(), now.getTime() - MIN));
  const at = cap(spec.at);
  const end = cap(spec.end ?? new Date(at.getTime() + Math.max(steps.length, 1) * 2 * HOUR));
  const stepAt = (i: number) =>
    new Date(at.getTime() + ((end.getTime() - at.getTime()) * (i + 1)) / steps.length);

  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
  type TimestampColumn =
    | 'placedAt'
    | 'createdAt'
    | 'claimedAt'
    | 'confirmedAt'
    | 'paidAt'
    | 'sentAt'
    | 'deliveredAt'
    | 'cancelledAt'
    | 'refundedAt'
    | 'awaitingPaymentSince';
  const set: Partial<Record<TimestampColumn, Date>> = {
    placedAt: at,
    createdAt: at,
  };
  // Timestamps set at creation (manual already-paid orders) sit at `at`.
  if (order!.confirmedAt) set.confirmedAt = at;
  if (order!.paidAt) set.paidAt = at;
  if (order!.awaitingPaymentSince) set.awaitingPaymentSince = at;

  let claimAt: Date | undefined;
  steps.forEach((step, i) => {
    const type = typeof step === 'string' ? step : step.type;
    const when = stepAt(i);
    if (type === 'submitCode') set.claimedAt = claimAt = when;
    if (type === 'confirmPayment' || type === 'markPaid') set.confirmedAt = set.paidAt = when;
    if (type === 'accept') set.confirmedAt = when;
    if (type === 'markSent') set.sentAt = when;
    if (type === 'markDelivered') {
      set.deliveredAt = when;
      if (order!.paymentMethod === 'pay_on_delivery') set.paidAt = when;
    }
    if (type === 'sellerCancel' || type === 'buyerCancel' || type === 'autoExpire')
      set.cancelledAt = when;
    if (type === 'markRefundSent') set.refundedAt = when;
    if (type === 'paymentNotFound') set.awaitingPaymentSince = when;
  });
  if (steps.some((s) => s === 'autoExpire')) {
    // Expired orders waited the full 48 hours.
    set.awaitingPaymentSince = at;
    set.cancelledAt = cap(new Date(at.getTime() + 48 * HOUR + 20 * MIN));
  }
  await db.update(t.orders).set(set).where(eq(t.orders.id, orderId));

  const events = await db
    .select()
    .from(t.orderEvents)
    .where(eq(t.orderEvents.orderId, orderId))
    .orderBy(asc(t.orderEvents.createdAt));
  for (const [i, e] of events.entries()) {
    await db
      .update(t.orderEvents)
      .set({ createdAt: i === 0 ? at : stepAt(i - 1) })
      .where(eq(t.orderEvents.id, e.id));
  }
  if (claimAt) {
    await db
      .update(t.paymentClaims)
      .set({ createdAt: claimAt })
      .where(eq(t.paymentClaims.orderId, orderId));
  }
  return { deliveredAt: set.deliveredAt ?? null };
}
