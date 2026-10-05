import { describe, expect, it } from 'vitest';
import type { OrderState } from './orderMachine';
import {
  itemsSummary,
  needsMoneyAction,
  orderSearch,
  ordersQuery,
  orderStatusLabel,
  primaryAction,
  sellerActionInput,
  sellerActions,
  sellerTodoGroup,
  TODO_GROUP_ORDER,
  sourceLabel,
} from './sellerOrders';

const order = (o: Partial<OrderState>): OrderState => ({
  status: 'awaiting_payment',
  paymentStatus: 'unpaid',
  paymentMethod: 'pay_before',
  source: 'tt',
  ...o,
});

describe('seller actions offered on the order detail', () => {
  it('follow the machine for every state', () => {
    expect(sellerActions(order({}))).toEqual(['markPaid', 'sellerCancel']);
    expect(sellerActions(order({ status: 'payment_claimed', paymentStatus: 'claimed' }))).toEqual([
      'confirmPayment',
      'paymentNotFound',
      'sellerCancel',
    ]);
    expect(
      sellerActions(order({ status: 'awaiting_acceptance', paymentMethod: 'pay_on_delivery' })),
    ).toEqual(['accept', 'sellerCancel']);
    expect(sellerActions(order({ status: 'confirmed', paymentStatus: 'paid' }))).toEqual([
      'markSent',
      'sellerCancel',
    ]);
    expect(sellerActions(order({ status: 'sent', paymentStatus: 'paid' }))).toEqual([
      'markDelivered',
      'sellerCancel',
    ]);
    expect(sellerActions(order({ status: 'delivered', paymentStatus: 'paid' }))).toEqual([]);
    expect(sellerActions(order({ status: 'cancelled', paymentStatus: 'claimed' }))).toEqual([
      'resolveClaim',
    ]);
    expect(sellerActions(order({ status: 'cancelled', paymentStatus: 'refund_due' }))).toEqual([
      'markRefundSent',
    ]);
    expect(sellerActions(order({ status: 'cancelled', paymentStatus: 'refunded' }))).toEqual([]);
  });

  it('pick one primary button', () => {
    expect(primaryAction(['confirmPayment', 'paymentNotFound', 'sellerCancel'])).toBe(
      'confirmPayment',
    );
    expect(primaryAction(['markPaid', 'sellerCancel'])).toBeNull();
    expect(primaryAction(['markRefundSent'])).toBe('markRefundSent');
  });
});

describe('action bodies', () => {
  it('whitelist each action’s fields', () => {
    expect(sellerActionInput.safeParse({ type: 'accept' }).success).toBe(true);
    expect(sellerActionInput.safeParse({ type: 'accept', status: 'delivered' }).success).toBe(
      false,
    );
    expect(sellerActionInput.safeParse({ type: 'autoExpire' }).success).toBe(false);
    expect(sellerActionInput.safeParse({ type: 'submitCode', message: 'X' }).success).toBe(false);
    expect(
      sellerActionInput.parse({
        type: 'markSent',
        sentMethod: 'rider',
        riderPhone: '0712 345 678',
      }),
    ).toEqual({ type: 'markSent', sentMethod: 'rider', riderPhone: '+254712345678' });
    expect(
      sellerActionInput.parse({ type: 'markSent', sentMethod: 'pickup', riderPhone: '' }),
    ).toEqual({ type: 'markSent', sentMethod: 'pickup', riderPhone: null });
    expect(
      sellerActionInput.safeParse({ type: 'markSent', sentMethod: 'rider', riderPhone: '123' })
        .success,
    ).toBe(false);
    expect(sellerActionInput.safeParse({ type: 'sellerCancel', reason: 'expired' }).success).toBe(
      false,
    );
    expect(sellerActionInput.parse({ type: 'sellerCancel', reason: 'other', note: '  ' })).toEqual({
      type: 'sellerCancel',
      reason: 'other',
      note: null,
    });
  });
});

describe('the list', () => {
  it('defaults to the To do tab and checks the cursor', () => {
    expect(ordersQuery.parse({})).toEqual({ tab: 'todo' });
    expect(ordersQuery.parse({ tab: 'all', q: '  ' })).toEqual({ tab: 'all' });
    expect(ordersQuery.safeParse({ cursor: 'x' }).success).toBe(false);
    expect(
      ordersQuery.safeParse({ cursor: '1759650000000_7f0c9a52-3c1b-4a5e-9a49-1d2b3c4d5e6f' })
        .success,
    ).toBe(true);
  });

  it('searches by name, phone digits and order number', () => {
    expect(orderSearch('Wanjiku')).toEqual({ name: 'Wanjiku', phoneDigits: null, number: null });
    expect(orderSearch('#1042')).toEqual({ name: '1042', phoneDigits: '1042', number: 1042 });
    expect(orderSearch('0712 345')).toMatchObject({ phoneDigits: '712345', number: 712345 });
    expect(orderSearch('+254712345901')).toMatchObject({ phoneDigits: '712345901', number: null });
  });

  it('labels rows', () => {
    expect(itemsSummary(['Kitenge top', 'Earrings'])).toBe('Kitenge top + 1 more');
    expect(itemsSummary(['Maxi dress'])).toBe('Maxi dress');
    expect(sourceLabel('tt')).toBe('via TikTok');
    expect(sourceLabel('direct')).toBeNull();
    expect(orderStatusLabel({ status: 'cancelled', paymentStatus: 'refund_due' })).toBe(
      'Refund due',
    );
    expect(orderStatusLabel({ status: 'cancelled', paymentStatus: 'claimed' })).toBe(
      'Check payment',
    );
    expect(orderStatusLabel({ status: 'sent', paymentStatus: 'paid' })).toBe('Sent');
    expect(needsMoneyAction({ status: 'cancelled', paymentStatus: 'unpaid' })).toBe(false);
    expect(needsMoneyAction({ status: 'cancelled', paymentStatus: 'claimed' })).toBe(true);
  });
});

describe('To-do groups (decision #67)', () => {
  it('"Needs attention" comes first: cancelled orders with a claim or a refund due', () => {
    expect(TODO_GROUP_ORDER[0]).toBe('needs_attention');
    expect(sellerTodoGroup({ status: 'cancelled', paymentStatus: 'claimed' })).toBe(
      'needs_attention',
    );
    expect(sellerTodoGroup({ status: 'cancelled', paymentStatus: 'refund_due' })).toBe(
      'needs_attention',
    );
    expect(sellerTodoGroup({ status: 'cancelled', paymentStatus: 'refunded' })).toBeNull();
    expect(sellerTodoGroup({ status: 'cancelled', paymentStatus: 'unpaid' })).toBeNull();
    expect(sellerTodoGroup({ status: 'payment_claimed', paymentStatus: 'claimed' })).toBe(
      'confirm_payment',
    );
    expect(sellerTodoGroup({ status: 'delivered', paymentStatus: 'paid' })).toBeNull();
  });
});
