import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
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
