// The order state machine (docs/order-lifecycle.md). Pure: no I/O, no clock.
// The server runs every transition through it inside transitionOrder()
// (apps/web/server/orders.ts); both UIs use it to decide actions and labels.

export const ORDER_STATUSES = [
  'awaiting_payment',
  'awaiting_acceptance',
  'payment_claimed',
  'confirmed',
  'sent',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'claimed', 'paid', 'refund_due', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['pay_before', 'pay_on_delivery'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_SOURCES = [
  'wa',
  'status',
  'tt',
  'ig',
  'fb',
  'qr',
  'other',
  'direct',
  'manual',
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ACTORS = ['buyer', 'seller', 'system', 'admin'] as const;
export type Actor = (typeof ACTORS)[number];

export const SENT_METHODS = ['rider', 'parcel', 'pickup'] as const;
export type SentMethod = (typeof SENT_METHODS)[number];

export const CANCEL_REASONS = [
  'out_of_stock',
  'buyer_asked',
  'payment_not_received',
  'cant_deliver',
  'other',
  'expired',
  'buyer_cancelled',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/** Reasons a seller can pick; `expired` and `buyer_cancelled` are set by the system. */
export const SELLER_CANCEL_REASONS = [
  'out_of_stock',
  'buyer_asked',
  'payment_not_received',
  'cant_deliver',
  'other',
] as const satisfies readonly CancelReason[];
export type SellerCancelReason = (typeof SELLER_CANCEL_REASONS)[number];

/**
 * How the order reaches the buyer: a delivery area, pickup, or arranged between buyer and
 * seller when the shop lists neither (decision #110: delivery options are optional).
 */
export const FULFILMENTS = ['delivery', 'pickup', 'arranged'] as const;
export type Fulfilment = (typeof FULFILMENTS)[number];

export type OrderTimestamp =
  | 'placed_at'
  | 'claimed_at'
  | 'confirmed_at'
  | 'paid_at'
  | 'sent_at'
  | 'delivered_at'
  | 'cancelled_at'
  | 'refunded_at';

export type EmailTemplate =
  | 'receipt'
  | 'payment_confirmed'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'cancelled'
  | 'expired'
  | 'refunded';

export type PushType =
  'new_order' | 'payment_claimed' | 'switched_to_pod' | 'buyer_cancelled' | 'order_expired';

export type SideEffect =
  | { kind: 'push'; type: PushType }
  | { kind: 'email'; template: EmailTemplate }
  | { kind: 'whatsapp' }
  | { kind: 'buyer_banner'; banner: 'payment_not_found' }
  | { kind: 'review_unlocked' }
  | { kind: 'duplicate_code_check' }
  | { kind: 'order_link' };

/** What the machine needs to know about an order. */
export interface OrderState {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  source: OrderSource;
}

export type Action =
  | { type: 'submitCode'; code: string }
  | { type: 'switchToPod'; shopAcceptsPayOnDelivery: boolean }
  | { type: 'markPaid' }
  | { type: 'confirmPayment' }
  | { type: 'paymentNotFound' }
  | { type: 'accept' }
  | { type: 'markSent'; sentMethod: SentMethod; riderPhone?: string | null }
  | { type: 'markDelivered'; collected?: boolean }
  | { type: 'buyerCancel' }
  | {
      type: 'sellerCancel';
      reason: SellerCancelReason;
      note?: string | null;
      receivedClaimed?: boolean;
    }
  | { type: 'resolveClaim'; received: boolean }
  | { type: 'markRefundSent' }
  | { type: 'autoExpire' };

export type ActionType = Action['type'];

export const ACTION_TYPES = [
  'submitCode',
  'switchToPod',
  'markPaid',
  'confirmPayment',
  'paymentNotFound',
  'accept',
  'markSent',
  'markDelivered',
  'buyerCancel',
  'sellerCancel',
  'resolveClaim',
  'markRefundSent',
  'autoExpire',
] as const satisfies readonly ActionType[];

export interface Transition {
  ok: true;
  from: { status: OrderStatus; paymentStatus: PaymentStatus };
  to: { status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod: PaymentMethod };
  /** Timestamps to set to "now". */
  timestamps: OrderTimestamp[];
  /** True when the order (re-)enters awaiting_payment: the 48h expiry clock restarts. */
  restartsExpiryClock: boolean;
  cancel?: { reason: CancelReason; by: 'buyer' | 'seller' | 'system'; note: string | null };
  sideEffects: SideEffect[];
}

export type TransitionErrorCode =
  | 'forbidden_transition'
  | 'wrong_actor'
  | 'missing_answer'
  | 'not_collected'
  | 'pay_on_delivery_off'
  | 'manual_order_never_expires';

export interface TransitionError {
  ok: false;
  code: TransitionErrorCode;
  message: string;
}

export type TransitionResult = Transition | TransitionError;

const ACTION_ACTOR: Record<ActionType, Actor> = {
  submitCode: 'buyer',
  switchToPod: 'buyer',
  markPaid: 'seller',
  confirmPayment: 'seller',
  paymentNotFound: 'seller',
  accept: 'seller',
  markSent: 'seller',
  markDelivered: 'seller',
  buyerCancel: 'buyer',
  sellerCancel: 'seller',
  resolveClaim: 'seller',
  markRefundSent: 'seller',
  autoExpire: 'system',
};

const TERMINAL: ReadonlySet<OrderStatus> = new Set(['delivered', 'cancelled']);

function fail(code: TransitionErrorCode, message: string): TransitionError {
  return { ok: false, code, message };
}

function forbidden(order: OrderState, action: ActionType): TransitionError {
  return fail(
    'forbidden_transition',
    `This action (${action}) isn't possible while the order is ${order.status.replaceAll('_', ' ')} (payment ${order.paymentStatus.replaceAll('_', ' ')}).`,
  );
}

function ok(
  order: OrderState,
  to: Partial<Transition['to']>,
  rest: Omit<Transition, 'ok' | 'from' | 'to' | 'restartsExpiryClock'> & {
    restartsExpiryClock?: boolean;
  },
): Transition {
  return {
    ok: true,
    from: { status: order.status, paymentStatus: order.paymentStatus },
    to: {
      status: to.status ?? order.status,
      paymentStatus: to.paymentStatus ?? order.paymentStatus,
      paymentMethod: to.paymentMethod ?? order.paymentMethod,
    },
    restartsExpiryClock: rest.restartsExpiryClock ?? false,
    timestamps: rest.timestamps,
    sideEffects: rest.sideEffects,
    ...(rest.cancel ? { cancel: rest.cancel } : {}),
  };
}

/**
 * Applies `action` by `actor` to `order`. Anything not listed in
 * docs/order-lifecycle.md → Transitions is forbidden.
 */
export function next(order: OrderState, action: Action, actor: Actor): TransitionResult {
  if (ACTION_ACTOR[action.type] !== actor) {
    return fail('wrong_actor', `Only the ${ACTION_ACTOR[action.type]} can do this.`);
  }
  const { status, paymentStatus } = order;

  switch (action.type) {
    case 'submitCode':
      if (status !== 'awaiting_payment' || paymentStatus !== 'unpaid') break;
      return ok(
        order,
        { status: 'payment_claimed', paymentStatus: 'claimed' },
        {
          timestamps: ['claimed_at'],
          sideEffects: [
            { kind: 'push', type: 'payment_claimed' },
            { kind: 'duplicate_code_check' },
          ],
        },
      );

    case 'switchToPod':
      if (status !== 'awaiting_payment' || paymentStatus !== 'unpaid') break;
      if (!action.shopAcceptsPayOnDelivery) {
        return fail('pay_on_delivery_off', "This shop doesn't take pay on delivery.");
      }
      return ok(
        order,
        { status: 'awaiting_acceptance', paymentMethod: 'pay_on_delivery' },
        { timestamps: [], sideEffects: [{ kind: 'push', type: 'switched_to_pod' }] },
      );

    case 'markPaid':
      if (status !== 'awaiting_payment' || paymentStatus !== 'unpaid') break;
      return ok(
        order,
        { status: 'confirmed', paymentStatus: 'paid' },
        {
          timestamps: ['confirmed_at', 'paid_at'],
          sideEffects: [{ kind: 'email', template: 'payment_confirmed' }],
        },
      );

    case 'confirmPayment':
      if (status !== 'payment_claimed' || paymentStatus !== 'claimed') break;
      return ok(
        order,
        { status: 'confirmed', paymentStatus: 'paid' },
        {
          timestamps: ['confirmed_at', 'paid_at'],
          sideEffects: [{ kind: 'email', template: 'payment_confirmed' }, { kind: 'whatsapp' }],
        },
      );

    case 'paymentNotFound':
      if (status !== 'payment_claimed' || paymentStatus !== 'claimed') break;
      return ok(
        order,
        { status: 'awaiting_payment', paymentStatus: 'unpaid' },
        {
          timestamps: [],
          restartsExpiryClock: true,
          sideEffects: [
            { kind: 'buyer_banner', banner: 'payment_not_found' },
            { kind: 'whatsapp' },
          ],
        },
      );

    case 'accept':
      if (status !== 'awaiting_acceptance' || paymentStatus !== 'unpaid') break;
      return ok(
        order,
        { status: 'confirmed' },
        { timestamps: ['confirmed_at'], sideEffects: [{ kind: 'email', template: 'accepted' }] },
      );

    case 'markSent':
      if (status !== 'confirmed') break;
      return ok(
        order,
        { status: 'sent' },
        {
          timestamps: ['sent_at'],
          sideEffects: [{ kind: 'email', template: 'sent' }, { kind: 'whatsapp' }],
        },
      );

    case 'markDelivered': {
      if (status !== 'sent') break;
      const podCollect = order.paymentMethod === 'pay_on_delivery' && paymentStatus === 'unpaid';
      if (podCollect && action.collected !== true) {
        return fail(
          'not_collected',
          'Tick "I\'ve collected the money" to mark a pay-on-delivery order delivered.',
        );
      }
      return ok(
        order,
        { status: 'delivered', ...(podCollect ? { paymentStatus: 'paid' as const } : {}) },
        {
          timestamps: podCollect ? ['delivered_at', 'paid_at'] : ['delivered_at'],
          sideEffects: [
            { kind: 'review_unlocked' },
            { kind: 'email', template: 'delivered' },
            { kind: 'whatsapp' },
          ],
        },
      );
    }

    case 'buyerCancel':
      if (
        status !== 'awaiting_payment' &&
        status !== 'awaiting_acceptance' &&
        status !== 'payment_claimed'
      ) {
        break;
      }
      // A claimed payment stays `claimed`: the seller resolves it (resolveClaim).
      return ok(
        order,
        { status: 'cancelled' },
        {
          timestamps: ['cancelled_at'],
          cancel: { reason: 'buyer_cancelled', by: 'buyer', note: null },
          sideEffects: [
            { kind: 'push', type: 'buyer_cancelled' },
            { kind: 'email', template: 'cancelled' },
          ],
        },
      );

    case 'sellerCancel': {
      if (TERMINAL.has(status)) break;
      let nextPayment: PaymentStatus = paymentStatus;
      if (paymentStatus === 'claimed') {
        if (action.receivedClaimed === undefined) {
          return fail(
            'missing_answer',
            'Did you receive the money in M-Pesa? Answer before cancelling.',
          );
        }
        nextPayment = action.receivedClaimed ? 'refund_due' : 'unpaid';
      } else if (paymentStatus === 'paid') {
        nextPayment = 'refund_due';
      }
      return ok(
        order,
        { status: 'cancelled', paymentStatus: nextPayment },
        {
          timestamps: ['cancelled_at'],
          cancel: { reason: action.reason, by: 'seller', note: action.note ?? null },
          sideEffects: [{ kind: 'email', template: 'cancelled' }, { kind: 'whatsapp' }],
        },
      );
    }

    case 'resolveClaim':
      if (status !== 'cancelled' || paymentStatus !== 'claimed') break;
      return ok(
        order,
        { paymentStatus: action.received ? 'refund_due' : 'unpaid' },
        { timestamps: [], sideEffects: [] },
      );

    case 'markRefundSent':
      if (paymentStatus !== 'refund_due') break;
      return ok(
        order,
        { paymentStatus: 'refunded' },
        { timestamps: ['refunded_at'], sideEffects: [{ kind: 'email', template: 'refunded' }] },
      );

    case 'autoExpire':
      if (status !== 'awaiting_payment' || paymentStatus !== 'unpaid') break;
      if (order.source === 'manual') {
        return fail('manual_order_never_expires', 'Manual orders are never auto-expired.');
      }
      return ok(
        order,
        { status: 'cancelled' },
        {
          timestamps: ['cancelled_at'],
          cancel: { reason: 'expired', by: 'system', note: null },
          sideEffects: [
            { kind: 'push', type: 'order_expired' },
            { kind: 'email', template: 'expired' },
          ],
        },
      );
  }
  return forbidden(order, action.type);
}

/** How an order is created (docs/order-lifecycle.md, rows starting with "—"). */
export type CreationKind =
  | 'buyer_pay_now'
  | 'buyer_pay_on_delivery'
  | 'manual_paid'
  | 'manual_not_paid'
  | 'manual_pay_on_delivery';

export interface InitialState {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  timestamps: OrderTimestamp[];
  startsExpiryClock: boolean;
  sideEffects: SideEffect[];
}

export function initialState(kind: CreationKind): InitialState {
  switch (kind) {
    case 'buyer_pay_now':
      return {
        status: 'awaiting_payment',
        paymentStatus: 'unpaid',
        paymentMethod: 'pay_before',
        timestamps: ['placed_at'],
        startsExpiryClock: true,
        sideEffects: [
          { kind: 'push', type: 'new_order' },
          { kind: 'email', template: 'receipt' },
        ],
      };
    case 'buyer_pay_on_delivery':
      return {
        status: 'awaiting_acceptance',
        paymentStatus: 'unpaid',
        paymentMethod: 'pay_on_delivery',
        timestamps: ['placed_at'],
        startsExpiryClock: false,
        sideEffects: [
          { kind: 'push', type: 'new_order' },
          { kind: 'email', template: 'receipt' },
        ],
      };
    case 'manual_paid':
      return {
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'pay_before',
        timestamps: ['placed_at', 'confirmed_at', 'paid_at'],
        startsExpiryClock: false,
        sideEffects: [],
      };
    case 'manual_not_paid':
      // Exempt from auto-expire (source = manual), but the clock column is still set
      // so it reflects when the order started waiting.
      return {
        status: 'awaiting_payment',
        paymentStatus: 'unpaid',
        paymentMethod: 'pay_before',
        timestamps: ['placed_at'],
        startsExpiryClock: true,
        sideEffects: [{ kind: 'order_link' }],
      };
    case 'manual_pay_on_delivery':
      return {
        status: 'confirmed',
        paymentStatus: 'unpaid',
        paymentMethod: 'pay_on_delivery',
        timestamps: ['placed_at', 'confirmed_at'],
        startsExpiryClock: false,
        sideEffects: [],
      };
  }
}

/** Hours an unpaid buyer-placed order waits before auto-expiry. */
export const EXPIRY_HOURS = 48;

/** An order is a sale while confirmed, sent or delivered (order-lifecycle.md). */
export function isSale(status: OrderStatus): boolean {
  return status === 'confirmed' || status === 'sent' || status === 'delivered';
}

export type TodoGroup = 'confirm_payment' | 'new_to_accept' | 'new_awaiting_payment' | 'to_send';

/** The seller's "To do" group, or null when nothing is waiting on the seller. */
export function todoGroup(status: OrderStatus): TodoGroup | null {
  switch (status) {
    case 'payment_claimed':
      return 'confirm_payment';
    case 'awaiting_acceptance':
      return 'new_to_accept';
    case 'awaiting_payment':
      return 'new_awaiting_payment';
    case 'confirmed':
      return 'to_send';
    default:
      return null;
  }
}

const STATUS_RANK: Record<OrderStatus, number> = {
  awaiting_payment: 1,
  awaiting_acceptance: 1,
  payment_claimed: 2,
  confirmed: 3,
  sent: 4,
  delivered: 5,
  cancelled: 0,
};

export interface StepperStep {
  step: 1 | 2 | 3 | 4;
  buyerLabel: string;
  sellerLabel: string;
  state: 'done' | 'in_progress' | 'todo';
}

/**
 * The four stepper steps shared by both apps (order-lifecycle.md → Stepper labels).
 * A cancelled order keeps only "Order placed" done; callers show the cancelled state.
 * Step 3 is "Ready for pickup" for pickup orders, and "Ready to collect" for an arranged order
 * the seller marked "Buyer collects" (decision #110 d).
 */
export function stepperSteps(
  order: Pick<OrderState, 'status' | 'paymentMethod'> & { sentMethod?: SentMethod | null },
  fulfilment: Fulfilment,
  shopName: string,
): StepperStep[] {
  const rank = order.status === 'cancelled' ? 1 : STATUS_RANK[order.status];
  const pod = order.paymentMethod === 'pay_on_delivery';
  const pickup = fulfilment === 'pickup';
  const collect = fulfilment === 'arranged' && order.sentMethod === 'pickup';
  const steps: Omit<StepperStep, 'state'>[] = [
    { step: 1, buyerLabel: 'Order placed', sellerLabel: 'Received' },
    {
      step: 2,
      buyerLabel: pod ? `Accepted by ${shopName}` : 'Paid & confirmed',
      sellerLabel: pod ? 'Accepted' : 'Payment',
    },
    {
      step: 3,
      buyerLabel: pickup ? 'Ready for pickup' : collect ? 'Ready to collect' : 'Sent out',
      sellerLabel: pickup ? 'Ready for pickup' : collect ? 'Ready to collect' : 'Sent',
    },
    { step: 4, buyerLabel: 'Delivered', sellerLabel: 'Delivered' },
  ];
  const doneAt = { 1: 1, 2: 3, 3: 4, 4: 5 } as const;
  return steps.map((s) => ({
    ...s,
    state:
      rank >= doneAt[s.step]
        ? 'done'
        : s.step === 2 && order.status === 'payment_claimed'
          ? 'in_progress'
          : 'todo',
  }));
}
