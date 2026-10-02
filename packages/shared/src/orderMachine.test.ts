import { describe, expect, it } from 'vitest';
import {
  ACTION_TYPES,
  ACTORS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  initialState,
  isSale,
  next,
  stepperSteps,
  todoGroup,
  type Action,
  type ActionType,
  type Actor,
  type OrderSource,
  type OrderState,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type Transition,
} from './orderMachine';

// Written from docs/order-lifecycle.md → Transitions, independently of the implementation.
// payment '*' = any payment status; to-payment '=' = unchanged.
type Row = {
  status: OrderStatus | OrderStatus[] | 'non_terminal';
  payment: PaymentStatus | '*';
  action: ActionType;
  actor: Actor;
  toStatus: OrderStatus | '=';
  toPayment: PaymentStatus | '=' | ((o: OrderState) => PaymentStatus);
  toMethod?: PaymentMethod;
  onlyIf?: (o: OrderState) => boolean;
};

const ALLOWED: Row[] = [
  {
    status: 'awaiting_payment',
    payment: 'unpaid',
    action: 'submitCode',
    actor: 'buyer',
    toStatus: 'payment_claimed',
    toPayment: 'claimed',
  },
  {
    status: 'awaiting_payment',
    payment: 'unpaid',
    action: 'switchToPod',
    actor: 'buyer',
    toStatus: 'awaiting_acceptance',
    toPayment: '=',
    toMethod: 'pay_on_delivery',
  },
  {
    status: 'awaiting_payment',
    payment: 'unpaid',
    action: 'markPaid',
    actor: 'seller',
    toStatus: 'confirmed',
    toPayment: 'paid',
  },
  {
    status: 'payment_claimed',
    payment: 'claimed',
    action: 'confirmPayment',
    actor: 'seller',
    toStatus: 'confirmed',
    toPayment: 'paid',
  },
  {
    status: 'payment_claimed',
    payment: 'claimed',
    action: 'paymentNotFound',
    actor: 'seller',
    toStatus: 'awaiting_payment',
    toPayment: 'unpaid',
  },
  {
    status: 'awaiting_acceptance',
    payment: 'unpaid',
    action: 'accept',
    actor: 'seller',
    toStatus: 'confirmed',
    toPayment: '=',
  },
  {
    status: 'confirmed',
    payment: '*',
    action: 'markSent',
    actor: 'seller',
    toStatus: 'sent',
    toPayment: '=',
  },
  {
    status: 'sent',
    payment: '*',
    action: 'markDelivered',
    actor: 'seller',
    toStatus: 'delivered',
    toPayment: (o) =>
      o.paymentMethod === 'pay_on_delivery' && o.paymentStatus === 'unpaid'
        ? 'paid'
        : o.paymentStatus,
  },
  {
    status: ['awaiting_payment', 'awaiting_acceptance', 'payment_claimed'],
    payment: '*',
    action: 'buyerCancel',
    actor: 'buyer',
    toStatus: 'cancelled',
    toPayment: '=',
  },
  {
    status: 'non_terminal',
    payment: '*',
    action: 'sellerCancel',
    actor: 'seller',
    toStatus: 'cancelled',
    // Test params answer "yes, I received it" for a claimed payment.
    toPayment: (o) =>
      o.paymentStatus === 'claimed' || o.paymentStatus === 'paid' ? 'refund_due' : o.paymentStatus,
  },
  {
    status: 'cancelled',
    payment: 'claimed',
    action: 'resolveClaim',
    actor: 'seller',
    toStatus: '=',
    toPayment: 'refund_due',
  },
  {
    status: ORDER_STATUSES.slice(),
    payment: 'refund_due',
    action: 'markRefundSent',
    actor: 'seller',
    toStatus: '=',
    toPayment: 'refunded',
  },
  {
    status: 'awaiting_payment',
    payment: 'unpaid',
    action: 'autoExpire',
    actor: 'system',
    toStatus: 'cancelled',
    toPayment: '=',
    onlyIf: (o) => o.source !== 'manual',
  },
];

// Parameters that satisfy every precondition, so only status/payment/actor decide.
function actionFor(type: ActionType): Action {
  switch (type) {
    case 'submitCode':
      return { type, code: 'TIG4K7XQ2P' };
    case 'switchToPod':
      return { type, shopAcceptsPayOnDelivery: true };
    case 'markSent':
      return { type, sentMethod: 'rider', riderPhone: null };
    case 'markDelivered':
      return { type, collected: true };
    case 'sellerCancel':
      return { type, reason: 'out_of_stock', receivedClaimed: true };
    case 'resolveClaim':
      return { type, received: true };
    default:
      return { type } as Action;
  }
}

function matches(row: Row, o: OrderState, action: ActionType, actor: Actor): boolean {
  const statusOk =
    row.status === 'non_terminal'
      ? o.status !== 'delivered' && o.status !== 'cancelled'
      : Array.isArray(row.status)
        ? row.status.includes(o.status)
        : row.status === o.status;
  return (
    statusOk &&
    (row.payment === '*' || row.payment === o.paymentStatus) &&
    row.action === action &&
    row.actor === actor &&
    (row.onlyIf?.(o) ?? true)
  );
}

const SOURCES: OrderSource[] = ['tt', 'manual'];

describe('order machine: exhaustive', () => {
  it('allows exactly the transitions in order-lifecycle.md and forbids everything else', () => {
    let allowed = 0;
    let checked = 0;
    for (const status of ORDER_STATUSES)
      for (const paymentStatus of PAYMENT_STATUSES)
        for (const paymentMethod of PAYMENT_METHODS)
          for (const source of SOURCES)
            for (const type of ACTION_TYPES)
              for (const actor of ACTORS) {
                const order: OrderState = { status, paymentStatus, paymentMethod, source };
                const result = next(order, actionFor(type), actor);
                const row = ALLOWED.find((r) => matches(r, order, type, actor));
                checked++;
                const label = `${type} by ${actor} on ${status}/${paymentStatus}/${paymentMethod}/${source}`;
                if (!row) {
                  expect(result.ok, label).toBe(false);
                  if (!result.ok) expect(result.message.length, label).toBeGreaterThan(0);
                  continue;
                }
                allowed++;
                expect(result.ok, label).toBe(true);
                const t = result as Transition;
                expect(t.to.status, label).toBe(row.toStatus === '=' ? status : row.toStatus);
                const wantPayment =
                  typeof row.toPayment === 'function'
                    ? row.toPayment(order)
                    : row.toPayment === '='
                      ? paymentStatus
                      : row.toPayment;
                expect(t.to.paymentStatus, label).toBe(wantPayment);
                expect(t.to.paymentMethod, label).toBe(row.toMethod ?? paymentMethod);
              }
    expect(checked).toBe(7 * 5 * 2 * 2 * 13 * 4);
    expect(allowed).toBeGreaterThan(0);
  });

  it('rejects the right action by the wrong actor with wrong_actor', () => {
    const order: OrderState = {
      status: 'payment_claimed',
      paymentStatus: 'claimed',
      paymentMethod: 'pay_before',
      source: 'tt',
    };
    const r = next(order, { type: 'confirmPayment' }, 'buyer');
    expect(r).toMatchObject({ ok: false, code: 'wrong_actor' });
    expect(next(order, { type: 'confirmPayment' }, 'admin')).toMatchObject({
      ok: false,
      code: 'wrong_actor',
    });
  });

  it('gives a readable message for a forbidden transition', () => {
    const order: OrderState = {
      status: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: 'pay_before',
      source: 'tt',
    };
    const r = next(order, { type: 'markSent', sentMethod: 'rider' }, 'seller');
    expect(r).toMatchObject({ ok: false, code: 'forbidden_transition' });
    if (!r.ok) expect(r.message).toContain('delivered');
  });
});

const base = (o: Partial<OrderState>): OrderState => ({
  status: 'awaiting_payment',
  paymentStatus: 'unpaid',
  paymentMethod: 'pay_before',
  source: 'tt',
  ...o,
});

describe('order machine: rules with parameters', () => {
  it('submitCode claims the payment, stamps claimed_at and asks for the duplicate check', () => {
    const t = next(base({}), { type: 'submitCode', code: 'TIG4K7XQ2P' }, 'buyer') as Transition;
    expect(t.timestamps).toEqual(['claimed_at']);
    expect(t.sideEffects).toContainEqual({ kind: 'push', type: 'payment_claimed' });
    expect(t.sideEffects).toContainEqual({ kind: 'duplicate_code_check' });
  });

  it('switchToPod needs the shop to accept pay on delivery', () => {
    expect(
      next(base({}), { type: 'switchToPod', shopAcceptsPayOnDelivery: false }, 'buyer'),
    ).toMatchObject({
      ok: false,
      code: 'pay_on_delivery_off',
    });
    const t = next(
      base({}),
      { type: 'switchToPod', shopAcceptsPayOnDelivery: true },
      'buyer',
    ) as Transition;
    expect(t.sideEffects).toContainEqual({ kind: 'push', type: 'switched_to_pod' });
  });

  it('paymentNotFound returns to awaiting_payment and restarts the expiry clock', () => {
    const t = next(
      base({ status: 'payment_claimed', paymentStatus: 'claimed' }),
      { type: 'paymentNotFound' },
      'seller',
    ) as Transition;
    expect(t.to).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
    expect(t.restartsExpiryClock).toBe(true);
    expect(t.sideEffects).toContainEqual({ kind: 'buyer_banner', banner: 'payment_not_found' });
  });

  it('confirmPayment and markPaid stamp confirmed_at and paid_at', () => {
    const c = next(
      base({ status: 'payment_claimed', paymentStatus: 'claimed' }),
      { type: 'confirmPayment' },
      'seller',
    ) as Transition;
    expect(c.timestamps).toEqual(['confirmed_at', 'paid_at']);
    expect(c.restartsExpiryClock).toBe(false);
    const m = next(base({}), { type: 'markPaid' }, 'seller') as Transition;
    expect(m.timestamps).toEqual(['confirmed_at', 'paid_at']);
  });

  it('pay on delivery: delivering needs "I\'ve collected" and marks it paid', () => {
    const pod = base({ status: 'sent', paymentStatus: 'unpaid', paymentMethod: 'pay_on_delivery' });
    expect(next(pod, { type: 'markDelivered' }, 'seller')).toMatchObject({
      ok: false,
      code: 'not_collected',
    });
    expect(next(pod, { type: 'markDelivered', collected: false }, 'seller')).toMatchObject({
      ok: false,
      code: 'not_collected',
    });
    const t = next(pod, { type: 'markDelivered', collected: true }, 'seller') as Transition;
    expect(t.to).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(t.timestamps).toEqual(['delivered_at', 'paid_at']);
    expect(t.sideEffects).toContainEqual({ kind: 'review_unlocked' });
  });

  it('pay before: delivering a paid order needs no collection tick', () => {
    const t = next(
      base({ status: 'sent', paymentStatus: 'paid' }),
      { type: 'markDelivered' },
      'seller',
    ) as Transition;
    expect(t.to).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(t.timestamps).toEqual(['delivered_at']);
  });

  it('seller cancel on a claimed payment must ask whether the money arrived', () => {
    const claimed = base({ status: 'payment_claimed', paymentStatus: 'claimed' });
    expect(next(claimed, { type: 'sellerCancel', reason: 'out_of_stock' }, 'seller')).toMatchObject(
      {
        ok: false,
        code: 'missing_answer',
      },
    );
    const yes = next(
      claimed,
      { type: 'sellerCancel', reason: 'out_of_stock', receivedClaimed: true },
      'seller',
    ) as Transition;
    expect(yes.to.paymentStatus).toBe('refund_due');
    const no = next(
      claimed,
      { type: 'sellerCancel', reason: 'payment_not_received', receivedClaimed: false },
      'seller',
    ) as Transition;
    expect(no.to.paymentStatus).toBe('unpaid');
  });

  it('seller cancel on a paid order creates a refund; on unpaid nothing to refund', () => {
    const paid = next(
      base({ status: 'sent', paymentStatus: 'paid' }),
      { type: 'sellerCancel', reason: 'cant_deliver' },
      'seller',
    ) as Transition;
    expect(paid.to).toMatchObject({ status: 'cancelled', paymentStatus: 'refund_due' });
    expect(paid.cancel).toEqual({ reason: 'cant_deliver', by: 'seller', note: null });
    const unpaid = next(
      base({ status: 'awaiting_acceptance', paymentMethod: 'pay_on_delivery' }),
      { type: 'sellerCancel', reason: 'other', note: 'Closed for Easter' },
      'seller',
    ) as Transition;
    expect(unpaid.to.paymentStatus).toBe('unpaid');
    expect(unpaid.cancel?.note).toBe('Closed for Easter');
  });

  it('buyer cancel keeps a claimed payment claimed for the seller to resolve', () => {
    const t = next(
      base({ status: 'payment_claimed', paymentStatus: 'claimed' }),
      { type: 'buyerCancel' },
      'buyer',
    ) as Transition;
    expect(t.to).toMatchObject({ status: 'cancelled', paymentStatus: 'claimed' });
    expect(t.cancel).toEqual({ reason: 'buyer_cancelled', by: 'buyer', note: null });
    expect(t.sideEffects).toContainEqual({ kind: 'push', type: 'buyer_cancelled' });
  });

  it('resolveClaim: received → refund_due, not received → unpaid; only on cancelled + claimed', () => {
    const c = base({ status: 'cancelled', paymentStatus: 'claimed' });
    expect(
      (next(c, { type: 'resolveClaim', received: true }, 'seller') as Transition).to.paymentStatus,
    ).toBe('refund_due');
    expect(
      (next(c, { type: 'resolveClaim', received: false }, 'seller') as Transition).to.paymentStatus,
    ).toBe('unpaid');
    expect(
      next(
        base({ status: 'payment_claimed', paymentStatus: 'claimed' }),
        { type: 'resolveClaim', received: true },
        'seller',
      ).ok,
    ).toBe(false);
  });

  it('markRefundSent only from refund_due, stamping refunded_at', () => {
    const t = next(
      base({ status: 'cancelled', paymentStatus: 'refund_due' }),
      { type: 'markRefundSent' },
      'seller',
    ) as Transition;
    expect(t.to.paymentStatus).toBe('refunded');
    expect(t.timestamps).toEqual(['refunded_at']);
    expect(
      next(
        base({ status: 'cancelled', paymentStatus: 'refunded' }),
        { type: 'markRefundSent' },
        'seller',
      ).ok,
    ).toBe(false);
  });

  it('autoExpire cancels buyer orders as expired, never manual ones', () => {
    const t = next(base({ source: 'wa' }), { type: 'autoExpire' }, 'system') as Transition;
    expect(t.cancel).toEqual({ reason: 'expired', by: 'system', note: null });
    expect(t.sideEffects).toContainEqual({ kind: 'push', type: 'order_expired' });
    expect(next(base({ source: 'manual' }), { type: 'autoExpire' }, 'system')).toMatchObject({
      ok: false,
      code: 'manual_order_never_expires',
    });
  });

  it('markSent keeps the payment state (pay on delivery stays unpaid until delivered)', () => {
    const t = next(
      base({ status: 'confirmed', paymentMethod: 'pay_on_delivery' }),
      { type: 'markSent', sentMethod: 'pickup' },
      'seller',
    ) as Transition;
    expect(t.to).toMatchObject({ status: 'sent', paymentStatus: 'unpaid' });
  });
});

describe('initialState', () => {
  it.each([
    ['buyer_pay_now', 'awaiting_payment', 'unpaid', 'pay_before', true],
    ['buyer_pay_on_delivery', 'awaiting_acceptance', 'unpaid', 'pay_on_delivery', false],
    ['manual_paid', 'confirmed', 'paid', 'pay_before', false],
    ['manual_not_paid', 'awaiting_payment', 'unpaid', 'pay_before', true],
    ['manual_pay_on_delivery', 'confirmed', 'unpaid', 'pay_on_delivery', false],
  ] as const)('%s → %s / %s / %s', (kind, status, payment, method, clock) => {
    const s = initialState(kind);
    expect(s).toMatchObject({
      status,
      paymentStatus: payment,
      paymentMethod: method,
      startsExpiryClock: clock,
    });
    expect(s.timestamps).toContain('placed_at');
  });

  it('buyer orders notify the seller; manual ones do not', () => {
    expect(initialState('buyer_pay_now').sideEffects).toContainEqual({
      kind: 'push',
      type: 'new_order',
    });
    expect(initialState('manual_paid').sideEffects).toEqual([]);
    expect(initialState('manual_not_paid').sideEffects).toEqual([{ kind: 'order_link' }]);
  });
});

describe('helpers', () => {
  it('isSale is confirmed, sent and delivered only', () => {
    expect(ORDER_STATUSES.filter(isSale)).toEqual(['confirmed', 'sent', 'delivered']);
  });

  it('todoGroup follows the seller To do groups', () => {
    expect(todoGroup('payment_claimed')).toBe('confirm_payment');
    expect(todoGroup('awaiting_acceptance')).toBe('new_to_accept');
    expect(todoGroup('awaiting_payment')).toBe('new_awaiting_payment');
    expect(todoGroup('confirmed')).toBe('to_send');
    expect(todoGroup('sent')).toBeNull();
    expect(todoGroup('cancelled')).toBeNull();
  });

  it('stepper: labels for delivery vs pickup and pay before vs pay on delivery', () => {
    const delivery = stepperSteps(
      { status: 'sent', paymentMethod: 'pay_before' },
      'delivery',
      'Amani Styles',
    );
    expect(delivery.map((s) => s.buyerLabel)).toEqual([
      'Order placed',
      'Paid & confirmed',
      'Sent out',
      'Delivered',
    ]);
    expect(delivery.map((s) => s.sellerLabel)).toEqual([
      'Received',
      'Payment',
      'Sent',
      'Delivered',
    ]);
    expect(delivery.map((s) => s.state)).toEqual(['done', 'done', 'done', 'todo']);

    const pickup = stepperSteps(
      { status: 'confirmed', paymentMethod: 'pay_on_delivery' },
      'pickup',
      'Amani Styles',
    );
    expect(pickup[1]).toMatchObject({
      buyerLabel: 'Accepted by Amani Styles',
      sellerLabel: 'Accepted',
      state: 'done',
    });
    expect(pickup[2]).toMatchObject({
      buyerLabel: 'Ready for pickup',
      sellerLabel: 'Ready for pickup',
      state: 'todo',
    });
  });

  it('stepper: a claimed payment shows step 2 in progress; cancelled keeps only step 1', () => {
    const claimed = stepperSteps(
      { status: 'payment_claimed', paymentMethod: 'pay_before' },
      'delivery',
      'X',
    );
    expect(claimed.map((s) => s.state)).toEqual(['done', 'in_progress', 'todo', 'todo']);
    const cancelled = stepperSteps(
      { status: 'cancelled', paymentMethod: 'pay_before' },
      'delivery',
      'X',
    );
    expect(cancelled.map((s) => s.state)).toEqual(['done', 'todo', 'todo', 'todo']);
    const delivered = stepperSteps(
      { status: 'delivered', paymentMethod: 'pay_before' },
      'delivery',
      'X',
    );
    expect(delivered.every((s) => s.state === 'done')).toBe(true);
  });
});
