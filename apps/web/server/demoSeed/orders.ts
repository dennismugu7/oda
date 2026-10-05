// Demo Duka's sample orders (M5, docs/m5-plan.md → Demo shop): one order in each state the
// buyer pages show, made only through insertOrder() / transitionOrder() (the same machine as
// real orders), and replaced on every run so they're always in their intended state.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import type { SellerCtx } from '../authz';
import { insertOrder, transitionOrder, type NewOrder, type TransitionAction } from '../orders';
import { DEMO_DELIVERY_AREAS, DEMO_PRODUCTS } from './data';

const t = schema;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Sample orders are recognised by this test-only buyer number. */
export const SAMPLE_BUYER_PHONE = '+254700000001';
const RIDER_PHONE = '+254700000002';

type Step = TransitionAction & { by: 'buyer' | 'seller' | 'system' };

interface Sample {
  label: string;
  buyer: string;
  kind: 'buyer_pay_now' | 'buyer_pay_on_delivery';
  pickup?: boolean;
  product: string;
  size?: string;
  colour?: string;
  steps: Step[];
  /** How long ago it was placed; later steps are spread after it. */
  placedAgo: number;
}

const code = (c: string) =>
  `${c} Confirmed. Ksh2,700.00 sent to DEMO DUKA TEST ONLY 000000 on 1/10/26 at 10:15 AM.`;

const SAMPLES: Sample[] = [
  {
    label: 'Awaiting payment (pay page)',
    buyer: 'Achieng (demo buyer)',
    kind: 'buyer_pay_now',
    product: 'Demo wrap dress',
    size: 'M',
    colour: 'Maroon',
    steps: [],
    placedAgo: 1 * HOUR,
  },
  {
    label: 'Payment claimed (waiting for the seller)',
    buyer: 'Baraka (demo buyer)',
    kind: 'buyer_pay_now',
    product: 'Demo wrap dress',
    size: 'L',
    colour: 'Navy',
    steps: [{ by: 'buyer', type: 'submitCode', message: code('SDM0DEMO01') }],
    placedAgo: 2 * HOUR,
  },
  {
    label: 'Payment not found (banner on the pay page)',
    buyer: 'Chebet (demo buyer)',
    kind: 'buyer_pay_now',
    product: 'Demo wrap dress',
    size: 'S',
    colour: 'Maroon',
    steps: [
      { by: 'buyer', type: 'submitCode', message: code('SDM0DEMO02') },
      { by: 'seller', type: 'paymentNotFound' },
    ],
    placedAgo: 5 * HOUR,
  },
  {
    label: 'Confirmed (pay on delivery, accepted)',
    buyer: 'Daudi (demo buyer)',
    kind: 'buyer_pay_on_delivery',
    product: 'Demo maxi dress',
    size: 'M',
    steps: [{ by: 'seller', type: 'accept' }],
    placedAgo: 1 * DAY,
  },
  {
    label: 'Sent with a rider (rider phone)',
    buyer: 'Esther (demo buyer)',
    kind: 'buyer_pay_now',
    product: 'Demo wrap dress',
    size: 'M',
    colour: 'Navy',
    steps: [
      { by: 'buyer', type: 'submitCode', message: code('SDM0DEMO03') },
      { by: 'seller', type: 'confirmPayment' },
      { by: 'seller', type: 'markSent', sentMethod: 'rider', riderPhone: RIDER_PHONE },
    ],
    placedAgo: 2 * DAY,
  },
  {
    label: 'Ready for pickup',
    buyer: 'Fatuma (demo buyer)',
    kind: 'buyer_pay_on_delivery',
    pickup: true,
    product: 'Demo maxi dress',
    size: 'L',
    steps: [
      { by: 'seller', type: 'accept' },
      { by: 'seller', type: 'markSent', sentMethod: 'pickup' },
    ],
    placedAgo: 2 * DAY,
  },
  {
    label: 'Delivered (rate card, reviews open soon)',
    buyer: 'Gitau (demo buyer)',
    kind: 'buyer_pay_on_delivery',
    product: 'Demo wrap dress',
    size: 'XL',
    colour: 'Maroon',
    steps: [
      { by: 'seller', type: 'accept' },
      { by: 'seller', type: 'markSent', sentMethod: 'rider' },
      { by: 'seller', type: 'markDelivered', collected: true },
    ],
    placedAgo: 5 * DAY,
  },
  {
    label: 'Cancelled by the seller (reason: out of stock)',
    buyer: 'Halima (demo buyer)',
    kind: 'buyer_pay_on_delivery',
    product: 'Demo maxi dress',
    size: 'M',
    steps: [
      {
        by: 'seller',
        type: 'sellerCancel',
        reason: 'out_of_stock',
        // Never shown to the buyer (decision #38 b): the page shows the reason label only.
        note: 'Private seller note: must not appear on the order page',
      },
    ],
    placedAgo: 3 * DAY,
  },
  {
    label: 'Expired (not paid within 48 hours)',
    buyer: 'Imani (demo buyer)',
    kind: 'buyer_pay_now',
    product: 'Demo wrap dress',
    size: 'S',
    colour: 'Navy',
    steps: [{ by: 'system', type: 'autoExpire' }],
    placedAgo: 3 * DAY,
  },
];

const STEP_COLUMNS = {
  submitCode: ['claimedAt'],
  confirmPayment: ['confirmedAt', 'paidAt'],
  accept: ['confirmedAt'],
  markSent: ['sentAt'],
  markDelivered: ['deliveredAt', 'paidAt'],
  sellerCancel: ['cancelledAt'],
  autoExpire: ['cancelledAt'],
} as const;

/**
 * Deletes the previous sample orders and makes them again. Returns each one's label and
 * order token. Sale aggregates are recounted afterwards (deleting an order doesn't undo them).
 */
export async function resetSampleOrders(
  db: Db,
  shopId: string,
  ownerId: string,
): Promise<{ label: string; token: string }[]> {
  await db
    .delete(t.orders)
    .where(and(eq(t.orders.shopId, shopId), eq(t.orders.buyerPhone, SAMPLE_BUYER_PHONE)));

  const products = await db
    .select({ id: t.products.id, name: t.products.name })
    .from(t.products)
    .where(eq(t.products.shopId, shopId));
  const [cbd] = await db
    .select({ id: t.deliveryAreas.id })
    .from(t.deliveryAreas)
    .where(
      and(
        eq(t.deliveryAreas.shopId, shopId),
        eq(t.deliveryAreas.name, DEMO_DELIVERY_AREAS[0]!.name),
        sql`${t.deliveryAreas.deletedAt} is null`,
      ),
    );
  const ctx = { userId: ownerId, shopId } as SellerCtx;

  const made: { label: string; token: string }[] = [];
  for (const s of SAMPLES) {
    const product = products.find((p) => p.name === s.product);
    if (!product) throw new Error(`Demo product missing: ${s.product}`);
    const input: NewOrder = {
      shopId,
      kind: s.kind,
      source: 'wa',
      buyer: { name: s.buyer, phone: SAMPLE_BUYER_PHONE, whatsapp: true, email: null },
      fulfilment: s.pickup
        ? { kind: 'pickup' }
        : { kind: 'delivery', areaId: cbd!.id, addressText: 'Demo street 1, Demo town' },
      lines: [{ productId: product.id, qty: 1, size: s.size ?? null, colour: s.colour ?? null }],
    };
    const { order } = await insertOrder(db, input);
    for (const step of s.steps) {
      const { by, ...action } = step;
      await transitionOrder(
        db,
        by === 'seller'
          ? { kind: 'seller', ctx, orderId: order.id }
          : by === 'system'
            ? { kind: 'system', orderId: order.id }
            : { kind: 'buyer', ctx: { order } as never },
        action as TransitionAction,
      );
    }
    // Spread the times out so the timeline reads like a real order (timestamps aren't
    // guarded; status is only ever changed by transitionOrder above).
    const placed = new Date(Date.now() - s.placedAgo);
    const times: Record<string, Date> = {
      placedAt: placed,
      awaitingPaymentSince: placed,
    };
    s.steps.forEach((step, i) => {
      const at = new Date(placed.getTime() + ((i + 1) * s.placedAgo) / (s.steps.length + 1));
      for (const col of STEP_COLUMNS[step.type as keyof typeof STEP_COLUMNS] ?? []) {
        times[col] = at;
      }
    });
    await db.update(t.orders).set(times).where(eq(t.orders.id, order.id));
    made.push({ label: s.label, token: order.publicToken });
  }

  // Recount Demo Duka's sale aggregates: the demo's starting numbers plus real sales.
  for (const p of DEMO_PRODUCTS) {
    const id = products.find((x) => x.name === p.name)?.id;
    if (!id) continue;
    const [row] = await db
      .select({ qty: sql<number>`coalesce(sum(${t.orderItems.qty}), 0)::int` })
      .from(t.orderItems)
      .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
      .where(
        and(
          eq(t.orderItems.productId, id),
          inArray(t.orders.status, ['confirmed', 'sent', 'delivered']),
        ),
      );
    await db
      .update(t.products)
      .set({ unitsSold: (p.unitsSold ?? 0) + (row?.qty ?? 0) })
      .where(eq(t.products.id, id));
  }
  const [delivered] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.shopId, shopId), eq(t.orders.status, 'delivered')));
  await db
    .update(t.shops)
    .set({ deliveredCount: delivered?.n ?? 0 })
    .where(eq(t.shops.id, shopId));

  return made;
}
