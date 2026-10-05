import { z } from 'zod';
import { checkoutFulfilment, checkoutInput } from './checkout';
import type { CreationKind, OrderSource } from './orderMachine';
import { shillings } from './schemas/fields';

// M6 CP3: Home (designs 15, 16), manual orders (17-new-order) and the notifications list.

// Manual orders -----------------------------------------------------------------------------

export const MANUAL_PAYMENTS = ['paid', 'not_paid', 'pay_on_delivery'] as const;
export type ManualPayment = (typeof MANUAL_PAYMENTS)[number];

export const MANUAL_PAYMENT_LABELS: Record<ManualPayment, string> = {
  paid: 'Already paid',
  not_paid: 'Not paid yet',
  pay_on_delivery: 'Pay on delivery',
};

export const MANUAL_KIND: Record<ManualPayment, CreationKind> = {
  paid: 'manual_paid',
  not_paid: 'manual_not_paid',
  pay_on_delivery: 'manual_pay_on_delivery',
};

/** POST /api/orders: an order the seller takes from a DM, a call or in person. */
export const manualOrderInput = z.strictObject({
  idempotencyKey: checkoutInput.shape.idempotencyKey,
  buyer: z.strictObject({
    name: checkoutInput.shape.buyer.shape.name,
    phone: checkoutInput.shape.buyer.shape.phone,
    whatsapp: z.boolean().default(true),
  }),
  lines: z
    .array(checkoutInput.shape.lines.element)
    .min(1, { error: 'Add at least one product.' })
    .max(50, { error: 'Too many items in one order.' }),
  fulfilment: checkoutFulfilment,
  /** The seller may change the delivery fee on a manual order (order-lifecycle.md → Money). */
  deliveryFeeOverride: shillings('Delivery fee', 100_000).optional(),
  payment: z.enum(MANUAL_PAYMENTS, { error: 'Choose how the buyer pays.' }),
});
export type ManualOrderInput = z.input<typeof manualOrderInput>;

/** POST /api/orders/quote: what a manual order of these lines costs with each option. */
export const manualQuoteInput = z.strictObject({
  lines: manualOrderInput.shape.lines,
  deliveryFeeOverride: manualOrderInput.shape.deliveryFeeOverride,
});

// Notifications -----------------------------------------------------------------------------

/** PATCH /api/notifications/read: these ids, or every unread one when `ids` is left out. */
export const notificationsReadInput = z.strictObject({
  ids: z
    .array(z.uuid({ error: 'Unknown notification.' }))
    .min(1)
    .max(200)
    .optional(),
});

export type NotificationsReadBody = z.infer<typeof notificationsReadInput>;

// Home ----------------------------------------------------------------------------------------

const OFFSET_MS = 3 * 60 * 60 * 1000;

/** "Good morning" / "Good afternoon" / "Good evening", by the Nairobi clock. */
export function greeting(now: Date = new Date()): string {
  const hour = new Date(now.getTime() + OFFSET_MS).getUTCHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "+22% vs last week"; null when there's nothing to compare with. */
export function weekChange(
  thisWeek: number,
  lastWeek: number,
): { text: string; up: boolean } | null {
  if (lastWeek <= 0) return null;
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs last week`, up: pct >= 0 };
}

/** Bar labels Mon–Sun, with today's bar called "Today". */
export function weekBarLabels(todayIndex: number): string[] {
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (i === todayIndex ? 'Today' : l));
}

const SOURCE_NAMES: Partial<Record<OrderSource, string>> = {
  wa: 'WhatsApp',
  status: 'WhatsApp Status',
  tt: 'TikTok',
  ig: 'Instagram',
  fb: 'Facebook',
  qr: 'your QR code',
  other: 'shared links',
};

/** "8 of 12 orders came from TikTok this week", or null without a tagged source. */
export function topSourceLine(
  top: { source: OrderSource; count: number } | null,
  total: number,
): string | null {
  if (!top || top.count === 0 || !SOURCE_NAMES[top.source]) return null;
  return `${top.count} of ${total} ${total === 1 ? 'order' : 'orders'} came from ${SOURCE_NAMES[top.source]} this week`;
}

/** Sources that tell where a buyer came from (not "direct" or the seller's manual orders). */
export const TAGGED_SOURCES = Object.keys(SOURCE_NAMES) as OrderSource[];
