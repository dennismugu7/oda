import { z } from 'zod';
import { normalizeKePhone } from './phone';
import {
  next,
  SELLER_CANCEL_REASONS,
  SENT_METHODS,
  todoGroup,
  type Action,
  type CancelReason,
  type OrderSource,
  type OrderState,
  type OrderStatus,
  type PaymentStatus,
  type SellerCancelReason,
  type TodoGroup,
} from './orderMachine';

// Seller order management (M6 CP2, spec §5.4): the list's tabs and query, the one actions
// endpoint's body, which actions the order detail offers (asked of the machine itself), and
// the labels both the app and the server use.

// The list ----------------------------------------------------------------------------------

export const ORDER_TABS = ['todo', 'all', 'done'] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** Done = finished orders; To do = an order waiting on the seller (order-lifecycle.md). */
export const DONE_STATUSES = ['delivered', 'cancelled'] as const satisfies readonly OrderStatus[];
export const TODO_STATUSES = [
  'payment_claimed',
  'awaiting_acceptance',
  'awaiting_payment',
  'confirmed',
] as const satisfies readonly OrderStatus[];

/** To-do groups in the order the list shows them (spec §5.4). */
export const TODO_GROUP_ORDER: readonly TodoGroup[] = [
  'confirm_payment',
  'new_to_accept',
  'new_awaiting_payment',
  'to_send',
];

export const TODO_GROUP_LABELS: Record<TodoGroup, string> = {
  confirm_payment: 'Confirm payment',
  new_to_accept: 'New, to accept',
  new_awaiting_payment: 'New, awaiting payment',
  to_send: 'To send',
};

export const ORDER_PAGE_SIZE = 30;

export const ordersQuery = z.strictObject({
  tab: z.enum(ORDER_TABS, { error: 'Unknown tab.' }).default('todo'),
  /** Buyer name, phone or order number. */
  q: z
    .string()
    .trim()
    .max(60, { error: 'Search for at most 60 characters.' })
    .optional()
    .transform((q) => q || undefined),
  /** The `next` value from the previous page. */
  cursor: z
    .string()
    .max(80)
    .regex(/^\d{13}_[0-9a-f-]{36}$/, { error: 'This page link is not valid.' })
    .optional(),
});
export type OrdersQuery = z.infer<typeof ordersQuery>;

/** How a search box text is matched: a name always, a phone and an order number when it can be. */
export function orderSearch(q: string): {
  name: string;
  phoneDigits: string | null;
  number: number | null;
} {
  const text = q.trim().replace(/^#/, '');
  const digits = text.replace(/[\s+-]/g, '');
  const isDigits = /^\d+$/.test(digits);
  // A phone search compares the national digits: 0712… and +254712… find the same buyer.
  const phoneDigits = isDigits && digits.length >= 4 ? digits.replace(/^(254|0)/, '') : null;
  const number = isDigits && digits.length <= 7 ? Number(digits) : null;
  return { name: text, phoneDigits: phoneDigits || null, number };
}

// Actions -----------------------------------------------------------------------------------

const riderPhone = z
  .string()
  .trim()
  .max(20)
  .transform((value, ctx) => {
    if (!value) return null;
    const e164 = normalizeKePhone(value);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: "Enter the rider's Kenyan mobile number." });
      return z.NEVER;
    }
    return e164;
  })
  .nullable()
  .optional();

/** POST /api/orders/:id/actions: one of the seller's actions in the machine. */
export const sellerActionInput = z.discriminatedUnion(
  'type',
  [
    z.strictObject({ type: z.literal('markPaid') }),
    z.strictObject({ type: z.literal('confirmPayment') }),
    z.strictObject({ type: z.literal('paymentNotFound') }),
    z.strictObject({ type: z.literal('accept') }),
    z.strictObject({
      type: z.literal('markSent'),
      sentMethod: z.enum(SENT_METHODS, { error: 'Pick rider, parcel service or pickup.' }),
      riderPhone,
    }),
    z.strictObject({ type: z.literal('markDelivered'), collected: z.boolean().optional() }),
    z.strictObject({
      type: z.literal('sellerCancel'),
      reason: z.enum(SELLER_CANCEL_REASONS, { error: 'Pick why you are cancelling.' }),
      note: z
        .string()
        .trim()
        .max(300, { error: 'Keep the note under 300 characters.' })
        .nullable()
        .optional()
        .transform((n) => n || null),
      receivedClaimed: z.boolean().optional(),
    }),
    z.strictObject({ type: z.literal('resolveClaim'), received: z.boolean() }),
    z.strictObject({ type: z.literal('markRefundSent') }),
  ],
  { error: 'Unknown action.' },
);
export type SellerActionInput = z.infer<typeof sellerActionInput>;
export type SellerActionType = SellerActionInput['type'];

/** Probe actions: the details don't change whether the machine allows the action. */
const PROBES: Record<SellerActionType, Action> = {
  markPaid: { type: 'markPaid' },
  confirmPayment: { type: 'confirmPayment' },
  paymentNotFound: { type: 'paymentNotFound' },
  accept: { type: 'accept' },
  markSent: { type: 'markSent', sentMethod: 'rider' },
  markDelivered: { type: 'markDelivered', collected: true },
  sellerCancel: { type: 'sellerCancel', reason: 'other', receivedClaimed: false },
  resolveClaim: { type: 'resolveClaim', received: false },
  markRefundSent: { type: 'markRefundSent' },
};

/** The seller actions the machine allows on this order right now, in the order shown. */
export function sellerActions(order: OrderState): SellerActionType[] {
  return (Object.keys(PROBES) as SellerActionType[]).filter(
    (type) => next(order, PROBES[type], 'seller').ok,
  );
}

/** The one big button at the bottom of the order detail, if any. */
export function primaryAction(actions: readonly SellerActionType[]): SellerActionType | null {
  const order: SellerActionType[] = [
    'confirmPayment',
    'accept',
    'markSent',
    'markDelivered',
    'markRefundSent',
  ];
  return order.find((a) => actions.includes(a)) ?? null;
}

// Labels ------------------------------------------------------------------------------------

/** The cancel chips (17b-cancel-order). */
export const SELLER_CANCEL_LABELS: Record<SellerCancelReason, string> = {
  out_of_stock: 'Out of stock',
  buyer_asked: 'Buyer asked to cancel',
  payment_not_received: 'Payment didn’t arrive',
  cant_deliver: 'Can’t deliver there',
  other: 'Something else',
};

/** How the seller sees why an order was cancelled. */
export const SELLER_CANCELLED_LABELS: Record<CancelReason, string> = {
  ...SELLER_CANCEL_LABELS,
  expired: 'Not paid within 48 hours',
  buyer_cancelled: 'The buyer cancelled',
};

/** "via TikTok" on an order; null when the buyer came straight to the shop. */
export function sourceLabel(source: OrderSource): string | null {
  const labels: Record<OrderSource, string | null> = {
    wa: 'via WhatsApp',
    status: 'via WhatsApp Status',
    tt: 'via TikTok',
    ig: 'via Instagram',
    fb: 'via Facebook',
    qr: 'via QR code',
    other: 'via a shared link',
    direct: null,
    manual: 'Manual order',
  };
  return labels[source];
}

/** A short status chip for list rows outside To do. */
export function orderStatusLabel(o: { status: OrderStatus; paymentStatus: PaymentStatus }): string {
  if (o.paymentStatus === 'refund_due') return 'Refund due';
  if (o.status === 'cancelled' && o.paymentStatus === 'claimed') return 'Check payment';
  const labels: Record<OrderStatus, string> = {
    awaiting_payment: 'Awaiting payment',
    awaiting_acceptance: 'To accept',
    payment_claimed: 'Says paid',
    confirmed: 'To send',
    sent: 'Sent',
    delivered: 'Delivered',
    cancelled: o.paymentStatus === 'refunded' ? 'Refunded' : 'Cancelled',
  };
  return labels[o.status];
}

/** A cancelled order still needing the seller: a claim to answer or a refund to send. */
export function needsMoneyAction(o: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}): boolean {
  return (
    o.paymentStatus === 'refund_due' || (o.status === 'cancelled' && o.paymentStatus === 'claimed')
  );
}

export { todoGroup };

/** "Kitenge top + 1 more". */
export function itemsSummary(names: readonly string[]): string {
  if (names.length === 0) return '';
  return names.length === 1 ? names[0]! : `${names[0]} + ${names.length - 1} more`;
}

/** "Wanjiku" from "Wanjiku Mwangi". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
