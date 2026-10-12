import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ActionResult, OrderDetail } from '@/orders/api';
import type { ApiError } from '@/api';
import OrderDetailScreen from '../../../app/orders/[id]';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockGet = jest.fn<(id: string) => Answer<OrderDetail>>();
const mockAct = jest.fn<(id: string, action: unknown) => Answer<ActionResult>>();

jest.mock('@/orders/api', () => {
  const details = new Map<string, unknown>();
  return {
    ordersApi: {
      get: (id: string) => mockGet(id),
      act: (id: string, action: unknown) => mockAct(id, action),
    },
    ordersCache: {
      detail: (id: string) => details.get(id) ?? null,
      setDetail: (value: { id: string }) => details.set(value.id, value),
      clear: () => details.clear(),
    },
  };
});

function podOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'ord_1',
    number: 1042,
    status: 'awaiting_acceptance',
    paymentStatus: 'unpaid',
    paymentMethod: 'pay_on_delivery',
    source: 'wa',
    placedAt: new Date().toISOString(),
    claimedAt: null,
    confirmedAt: null,
    paidAt: null,
    sentAt: null,
    deliveredAt: null,
    cancelledAt: null,
    refundedAt: null,
    buyer: { name: 'Wanjiku Kamau', phone: '+254712345678', whatsapp: true, hasEmail: false },
    fulfilment: 'delivery',
    deliveryAreaName: 'Westlands',
    addressText: 'Sarit Centre, gate B',
    sentMethod: null,
    riderPhone: null,
    subtotal: 2500,
    deliveryFee: 200,
    total: 2700,
    paymentAccount: null,
    mpesaCode: null,
    cancel: null,
    actions: ['accept', 'sellerCancel'],
    shop: { name: 'Amani Styles', pickupLocation: null, pickupHours: null },
    items: [
      {
        id: 'it_1',
        name: 'Ankara dress',
        size: 'M',
        colour: null,
        qty: 1,
        unitPrice: 2500,
        thumbUrl: null,
      },
    ],
    claims: [],
    link: 'https://example.test/o/abc',
    ...overrides,
  };
}

let nextId = 0;
beforeEach(() => {
  jest.clearAllMocks();
  // A fresh id per test, so the screen's saved copy from an earlier test is never used.
  nextId += 1;
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: `ord_${nextId}` });
});

describe('Order detail', () => {
  it('shows only the loading state, then the order', async () => {
    const id = `ord_${nextId}`;
    let answer: (value: { data: OrderDetail; error: null }) => void = () => {};
    mockGet.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render(<OrderDetailScreen />);
    expect(screen.queryByText('Order #1042')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    answer({ data: podOrder({ id }), error: null });
    expect(await screen.findByText('Order #1042')).toBeTruthy();
    expect(screen.getByText('New order · pay on delivery')).toBeTruthy();
    expect(screen.getByText('Wanjiku Kamau')).toBeTruthy();
    expect(screen.getByText('Ankara dress')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(id);
  });

  it('accepts a pay-on-delivery order from the main button', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({ data: podOrder({ id }), error: null });
    mockAct.mockResolvedValue({
      data: {
        order: podOrder({ id, status: 'confirmed', actions: ['markSent', 'sellerCancel'] }),
        whatsapp: null,
      },
      error: null,
    });
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    await user.press(await screen.findByRole('button', { name: 'Accept order' }));
    expect(mockAct).toHaveBeenCalledWith(id, { type: 'accept' });
    expect(await screen.findByText('Accepted · Wanjiku pays KSh 2,700 on delivery')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark as sent' })).toBeTruthy();
  });

  it('says when the order no longer exists, with a way back', async () => {
    mockGet.mockResolvedValue({
      data: null,
      error: { status: 404, code: 'not_found', message: 'Order not found' },
    });
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    expect(await screen.findByText('This order no longer exists.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Back to orders' }));
    expect(router.replace).toHaveBeenCalledWith('/orders');
  });

  it('offline with nothing saved: says so and offers Try again', async () => {
    mockGet.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    await render(<OrderDetailScreen />);
    expect(await screen.findByText('You’re offline. Connect to load this.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  });
});

/** The answer to an action: the order after it, and no WhatsApp step. */
function after(order: OrderDetail) {
  return { data: { order, whatsapp: null }, error: null };
}

/** A pay-before order whose buyer sent an M-Pesa code. */
function claimedOrder(id: string): OrderDetail {
  return podOrder({
    id,
    status: 'payment_claimed',
    paymentStatus: 'claimed',
    paymentMethod: 'pay_before',
    claimedAt: new Date().toISOString(),
    mpesaCode: 'SGK7Y2ZQ1P',
    paymentAccount: { type: 'till', number: '123456', accountRef: null, name: 'Amani Styles' },
    actions: ['confirmPayment', 'paymentNotFound', 'sellerCancel'],
  });
}

describe('Order detail · actions', () => {
  it('confirms a claimed payment only after the tick', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({ data: claimedOrder(id), error: null });
    mockAct.mockResolvedValue(
      after(
        podOrder({
          id,
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentMethod: 'pay_before',
          actions: ['markSent', 'sellerCancel'],
        }),
      ),
    );
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    expect(await screen.findByText('Wanjiku says they paid KSh 2,700')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Confirm payment' }));
    expect(await screen.findByText('Confirm payment?')).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Confirm payment' }).at(-1)!;
    expect(confirm).toBeDisabled();
    await user.press(
      screen.getByRole('checkbox', { name: 'The amount and code match my M-Pesa message' }),
    );
    expect(confirm).toBeEnabled();
    await user.press(confirm);
    expect(mockAct).toHaveBeenCalledWith(id, { type: 'confirmPayment' });
    expect(await screen.findByText('Paid · KSh 2,700 confirmed')).toBeTruthy();
    expect(screen.queryByText('Confirm payment?')).toBeNull();
  });

  it('“Payment isn’t in my M-Pesa” sends paymentNotFound', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({ data: claimedOrder(id), error: null });
    mockAct.mockResolvedValue(
      after(
        podOrder({
          id,
          status: 'awaiting_payment',
          paymentMethod: 'pay_before',
          actions: ['markPaid', 'sellerCancel'],
        }),
      ),
    );
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    await user.press(await screen.findByRole('button', { name: 'Payment isn’t in my M-Pesa' }));
    expect(await screen.findByText('Payment isn’t in your M-Pesa?')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'I can’t find this payment' }));
    expect(mockAct).toHaveBeenCalledWith(id, { type: 'paymentNotFound' });
    expect(await screen.findByText('Waiting for Wanjiku to pay KSh 2,700')).toBeTruthy();
  });

  it('marks a confirmed order as sent by rider, with the rider’s phone', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({
      data: podOrder({ id, status: 'confirmed', actions: ['markSent', 'sellerCancel'] }),
      error: null,
    });
    mockAct.mockResolvedValue(
      after(
        podOrder({
          id,
          status: 'sent',
          sentMethod: 'rider',
          riderPhone: '+254722000111',
          actions: ['markDelivered', 'sellerCancel'],
        }),
      ),
    );
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    await user.press(await screen.findByRole('button', { name: 'Mark as sent' }));
    expect(await screen.findByText('How is it going?')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Rider/ })).toBeSelected();
    await user.type(screen.getByLabelText('Rider’s phone number'), '0722 000 111');
    await user.press(screen.getAllByRole('button', { name: 'Mark as sent' }).at(-1)!);
    expect(mockAct).toHaveBeenCalledWith(id, {
      type: 'markSent',
      sentMethod: 'rider',
      riderPhone: '0722 000 111',
    });
    expect(await screen.findByText('On its way')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark as delivered' })).toBeTruthy();
  });

  it('marks a sent pay-on-delivery order as delivered once the money is collected', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({
      data: podOrder({
        id,
        status: 'sent',
        sentMethod: 'rider',
        actions: ['markDelivered', 'sellerCancel'],
      }),
      error: null,
    });
    mockAct.mockResolvedValue(
      after(
        podOrder({
          id,
          status: 'delivered',
          paymentStatus: 'paid',
          sentMethod: 'rider',
          actions: [],
        }),
      ),
    );
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    expect(
      await screen.findByText('Collect KSh 2,700 from Wanjiku, then mark it as delivered.'),
    ).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Mark as delivered' }));
    expect(await screen.findByText('Delivered?')).toBeTruthy();
    const deliver = screen.getAllByRole('button', { name: 'Mark as delivered' }).at(-1)!;
    expect(deliver).toBeDisabled();
    await user.press(screen.getByRole('checkbox', { name: 'I’ve collected KSh 2,700' }));
    await user.press(deliver);
    expect(mockAct).toHaveBeenCalledWith(id, { type: 'markDelivered', collected: true });
    expect(await screen.findByText('KSh 2,700 collected.', { exact: false })).toBeTruthy();
  });

  it('cancels from the ⋮ menu with a reason and a note', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({ data: podOrder({ id }), error: null });
    mockAct.mockResolvedValue(
      after(
        podOrder({
          id,
          status: 'cancelled',
          cancel: { reason: 'out_of_stock', note: 'Sold in the shop', by: 'seller' },
          actions: [],
        }),
      ),
    );
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    await user.press(await screen.findByRole('button', { name: 'More actions' }));
    await user.press(screen.getByRole('button', { name: /Cancel order$/ }));
    expect(await screen.findByText('Cancel order #1042?')).toBeTruthy();
    const cancel = screen.getByRole('button', { name: 'Cancel order' });
    expect(cancel).toBeDisabled();
    await user.press(screen.getByRole('checkbox', { name: 'Out of stock' }));
    await user.type(screen.getByLabelText('Note for yourself'), 'Sold in the shop');
    expect(cancel).toBeEnabled();
    await user.press(cancel);
    expect(mockAct).toHaveBeenCalledWith(id, {
      type: 'sellerCancel',
      reason: 'out_of_stock',
      note: 'Sold in the shop',
    });
    expect(await screen.findByText('Cancelled · Out of stock')).toBeTruthy();
  });

  it('a cancelled paid order: Mark refund sent', async () => {
    const id = `ord_${nextId}`;
    const cancel = { reason: 'out_of_stock', note: null, by: 'seller' } as const;
    mockGet.mockResolvedValue({
      data: podOrder({
        id,
        status: 'cancelled',
        paymentStatus: 'refund_due',
        paymentMethod: 'pay_before',
        cancel,
        actions: ['markRefundSent'],
      }),
      error: null,
    });
    mockAct.mockResolvedValue(
      after(
        podOrder({
          id,
          status: 'cancelled',
          paymentStatus: 'refunded',
          paymentMethod: 'pay_before',
          cancel,
          actions: [],
        }),
      ),
    );
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    expect(await screen.findByText('Send KSh 2,700 back to 0712 345 678')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Mark refund sent' }));
    expect(await screen.findByText('Mark refund sent?')).toBeTruthy();
    await user.press(screen.getAllByRole('button', { name: 'Mark refund sent' }).at(-1)!);
    expect(mockAct).toHaveBeenCalledWith(id, { type: 'markRefundSent' });
    expect(await screen.findByText('Refund sent')).toBeTruthy();
  });
});

describe('Order detail · arranged with the buyer (decision #110)', () => {
  const arranged = (overrides: Partial<OrderDetail> = {}) =>
    podOrder({
      fulfilment: 'arranged',
      deliveryAreaName: null,
      addressText: 'Near Yaya Centre, after 5pm',
      deliveryFee: 0,
      total: 2500,
      ...overrides,
    });

  it('shows the arranged card, the note, "Not included" and a WhatsApp prefill', async () => {
    const id = `ord_${nextId}`;
    mockGet.mockResolvedValue({ data: arranged({ id }), error: null });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    expect(await screen.findByText('ARRANGED WITH BUYER')).toBeTruthy();
    expect(screen.getByText('Arrange delivery with Wanjiku')).toBeTruthy();
    expect(screen.getByText('Wanjiku’s note: Near Yaya Centre, after 5pm')).toBeTruthy();
    expect(screen.getByText('Not included')).toBeTruthy();
    expect(screen.queryByText('Free')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Message Wanjiku about delivery' }));
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/254712345678?text=${encodeURIComponent('Hi Wanjiku, about delivery for your order #1042: ')}`,
    );
  });

  it('Mark as sent: By rider / By parcel / Buyer collects; Buyer collects is "Ready to collect"', async () => {
    const id = `ord_${nextId}`;
    const confirmed = arranged({ id, status: 'confirmed', actions: ['markSent', 'sellerCancel'] });
    mockGet.mockResolvedValue({ data: confirmed, error: null });
    mockAct.mockResolvedValue({
      data: {
        order: {
          ...confirmed,
          status: 'sent',
          sentMethod: 'pickup',
          actions: ['markDelivered', 'sellerCancel'],
        },
        whatsapp: null,
      },
      error: null,
    });
    const user = userEvent.setup();
    await render(<OrderDetailScreen />);
    await user.press(await screen.findByRole('button', { name: 'Mark as sent' }));
    expect(await screen.findByText('Order #1042 · 1 item to Wanjiku')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /By rider/ })).toBeSelected();
    expect(screen.getByRole('radio', { name: /By parcel/ })).toBeTruthy();
    await user.press(screen.getByRole('radio', { name: /Buyer collects/ }));
    expect(screen.getByText('Where you agreed with the buyer')).toBeTruthy();
    expect(screen.queryByText(/pickup place/)).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Mark ready to collect' }));
    expect(mockAct).toHaveBeenCalledWith(id, {
      type: 'markSent',
      sentMethod: 'pickup',
      riderPhone: null,
    });
    expect(await screen.findAllByText('Ready to collect')).not.toHaveLength(0);
  });
});
