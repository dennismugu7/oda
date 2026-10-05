import { z } from 'zod';
import {
  next,
  stepperSteps,
  type CancelReason,
  type Fulfilment,
  type OrderState,
  type OrderStatus,
  type PaymentMethod,
} from './orderMachine';
import { MAX_QTY } from './pricing';
import { kePhone } from './schemas/fields';

// Buyer checkout and order actions (M5, docs/m5-plan.md, decision #61). The client sends only
// what the buyer chose; prices, fees and totals come from the database through pricing.ts.

/** Strips links from free text a buyer types (names end up in seller notifications and emails). */
export function stripLinks(text: string): string {
  return text
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, '')
    .replace(
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|xyz|ke|io|co|me|ly|link|app)\b\S*/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const BUYER_NAME_MAX = 60;
export const ADDRESS_MAX = 300;
export const REPORT_MAX = 1000;

const buyerName = z
  .string({ error: 'Enter your name.' })
  .transform(stripLinks)
  .pipe(
    z
      .string()
      .min(2, { error: 'Enter your name.' })
      .max(BUYER_NAME_MAX, { error: `Your name can be at most ${BUYER_NAME_MAX} characters.` }),
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254, { error: 'That email is too long.' })
  .transform((v) => (v === '' ? null : v.toLowerCase()))
  .pipe(z.email({ error: 'Check the email address.' }).nullable())
  .nullish()
  .transform((v) => v ?? null);

const option = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((v) => v || null);

export const checkoutLine = z.strictObject({
  productId: z.uuid({ error: 'Unknown product.' }),
  qty: z
    .number()
    .int()
    .min(1)
    .max(MAX_QTY, { error: `At most ${MAX_QTY} of one item.` }),
  size: option,
  colour: option,
});
export type CheckoutLine = z.infer<typeof checkoutLine>;

export const checkoutFulfilment = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({ kind: z.literal('pickup') }),
    z.strictObject({
      kind: z.literal('delivery'),
      areaId: z.uuid({ error: 'Choose where to deliver.' }),
      addressText: z
        .string({ error: 'Enter the delivery address.' })
        .trim()
        .min(3, { error: 'Enter the delivery address.' })
        .max(ADDRESS_MAX, { error: `The address can be at most ${ADDRESS_MAX} characters.` }),
    }),
  ],
  { error: 'Choose delivery or pickup.' },
);

export const CHECKOUT_PAYMENTS = ['pay_now', 'pay_on_delivery'] as const;
export type CheckoutPayment = (typeof CHECKOUT_PAYMENTS)[number];

/** POST /api/shops/:slug/orders. `website` is the honeypot: people never see or fill it. */
export const checkoutInput = z.strictObject({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, { error: 'Refresh and try again.' }),
  buyer: z.strictObject({
    name: buyerName,
    phone: kePhone,
    whatsapp: z.boolean().default(true),
    email: optionalEmail,
  }),
  fulfilment: checkoutFulfilment,
  payment: z.enum(CHECKOUT_PAYMENTS, { error: 'Choose how you’ll pay.' }),
  lines: z
    .array(checkoutLine)
    .min(1, { error: 'Your cart is empty.' })
    .max(50, { error: 'Too many items in one order.' }),
  /** The total the buyer saw; a different server total means prices changed (409). */
  expectedTotal: z.number().int().min(0),
  /** The shared link's ?s= tag, kept on the device until the order. */
  source: z.string().max(20).nullish(),
  website: z.string().max(200).optional(),
});
export type CheckoutInput = z.input<typeof checkoutInput>;

/** POST /api/shops/:slug/quote: what each delivery option would cost for these lines. */
export const quoteInput = z.strictObject({
  lines: checkoutInput.shape.lines,
});

/** POST /api/o/:token/code: the bare code or the whole M-Pesa SMS. */
export const codeInput = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1, { error: 'Paste the M-Pesa message or type the code.' })
    .max(1000, { error: 'That message is too long. Paste just the M-Pesa SMS.' }),
});

/** POST /api/o/:token/report. */
export const reportInput = z.strictObject({
  message: z
    .string()
    .trim()
    .min(5, { error: 'Tell us what went wrong.' })
    .max(REPORT_MAX, { error: `At most ${REPORT_MAX} characters.` }),
  contactPhone: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .pipe(kePhone.nullable()),
  website: z.string().max(200).optional(),
});

/** Open orders count towards the cap of 20 per phone per shop (decision #61 d). */
export const OPEN_ORDER_STATUSES = [
  'awaiting_payment',
  'awaiting_acceptance',
  'payment_claimed',
] as const satisfies readonly OrderStatus[];
export const MAX_OPEN_ORDERS_PER_PHONE = 20;

/** Rate limits (decision #61 d), in seconds and hits per window. */
export const BUYER_LIMITS = {
  ordersPerIpPerShop: { window: 3600, max: 30 },
  ordersPerPhonePerShop: { window: 3600, max: 5 },
  codesPerOrder: { window: 3600, max: 10 },
  orderLookupsPerIp: { window: 60, max: 60 },
  reportsPerOrder: { window: 86_400, max: 3 },
  reportsPerIp: { window: 86_400, max: 10 },
  emailsPerAddress: { window: 86_400, max: 5 },
  quotesPerIp: { window: 60, max: 120 },
} as const;

export type BuyerAction = 'submitCode' | 'switchToPod' | 'cancel';

/**
 * What the buyer can do on their order page right now, asked of the machine itself so the
 * page never offers something the server would refuse. A closed (deleted) shop allows only
 * "Report a problem", which isn't a transition.
 */
export function buyerActions(
  order: OrderState,
  shop: { acceptsPayOnDelivery: boolean; closed: boolean },
): BuyerAction[] {
  if (shop.closed) return [];
  const actions: BuyerAction[] = [];
  if (next(order, { type: 'submitCode', code: 'X' }, 'buyer').ok) actions.push('submitCode');
  if (
    next(
      order,
      { type: 'switchToPod', shopAcceptsPayOnDelivery: shop.acceptsPayOnDelivery },
      'buyer',
    ).ok
  ) {
    actions.push('switchToPod');
  }
  if (next(order, { type: 'buyerCancel' }, 'buyer').ok) actions.push('cancel');
  return actions;
}

/**
 * The cancel reason as the buyer sees it (decision #38 b): a label, never the seller's note.
 */
export const BUYER_CANCEL_LABELS: Record<CancelReason, string> = {
  out_of_stock: 'Out of stock',
  buyer_asked: 'Cancelled at your request',
  payment_not_received: 'Payment not received',
  cant_deliver: 'The seller can’t deliver to you',
  other: 'Cancelled by the seller',
  expired: 'Not paid within 48 hours',
  buyer_cancelled: 'You cancelled it',
};

export interface TimelineOrder {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  fulfilment: Fulfilment;
  placedAt: Date | null;
  claimedAt: Date | null;
  confirmedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
}

export interface TimelineStep {
  key: 'placed' | 'confirmed' | 'sent' | 'delivered' | 'rate';
  label: string;
  /** A second line, e.g. "Usually within a few hours". */
  note: string | null;
  state: 'done' | 'current' | 'todo';
  at: Date | null;
}

/**
 * The buyer's "Order status" card (web 6, 05c): the shared stepper's four steps
 * (order-lifecycle.md → Stepper labels), with times, the step being waited on, and "Rate your
 * order" last (it unlocks at delivered; reviews are M7). Not for cancelled orders.
 */
export function buyerTimeline(order: TimelineOrder, shopName: string): TimelineStep[] {
  const steps = stepperSteps(order, order.fulfilment, shopName);
  const pod = order.paymentMethod === 'pay_on_delivery';
  const pickup = order.fulfilment === 'pickup';
  const at = [order.placedAt, order.confirmedAt, order.sentAt, order.deliveredAt];
  const keys = ['placed', 'confirmed', 'sent', 'delivered'] as const;
  const firstTodo = steps.findIndex((s) => s.state !== 'done');
  const timeline: TimelineStep[] = steps.map((s, i) => {
    const state = s.state === 'done' ? 'done' : i === firstTodo ? 'current' : 'todo';
    let label = s.buyerLabel;
    let note: string | null = null;
    if (s.step === 1) {
      note = pod
        ? 'Pay on delivery'
        : order.status === 'awaiting_payment'
          ? 'Waiting for your payment'
          : null;
    } else if (s.step === 2 && state === 'current') {
      label =
        order.status === 'payment_claimed'
          ? `Waiting for ${shopName} to confirm your payment`
          : order.status === 'awaiting_payment'
            ? `Pay ${shopName}, then ${shopName} confirms`
            : `Waiting for ${shopName} to accept`;
      note = 'Usually within a few hours';
    } else if (s.step === 3 && state !== 'done') {
      note = pickup
        ? `${shopName} will tell you when it’s ready`
        : `${shopName} will WhatsApp you to arrange delivery`;
    }
    return { key: keys[i]!, label, note, state, at: state === 'done' ? (at[i] ?? null) : null };
  });
  timeline.push({
    key: 'rate',
    label: 'Rate your order',
    note: order.status === 'delivered' ? 'Reviews open soon' : 'Unlocks once it’s delivered',
    state: 'todo',
    at: null,
  });
  return timeline;
}
