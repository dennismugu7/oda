import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ApiError } from '@/api';
import type { ProductList, ProductSummary } from '@/catalogue/api';
import type { Delivery } from '@/delivery/api';
import NewOrder from '../../../app/orders/new';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockProducts = jest.fn<() => Answer<ProductList>>();
const mockDelivery = jest.fn<() => Answer<Delivery>>();

jest.mock('@/catalogue/api', () => ({
  catalogueApi: { products: () => mockProducts() },
}));
jest.mock('@/delivery/api', () => ({
  deliveryApi: { get: () => mockDelivery() },
}));
jest.mock('@/orders/api', () => ({
  ordersApi: { quoteManual: jest.fn(), createManual: jest.fn() },
  ordersCache: { setDetail: jest.fn() },
}));

const DELIVERY: Delivery = {
  areas: [
    {
      id: 'a1',
      name: 'Westlands',
      fee: 200,
      method: 'rider',
      etaLabel: null,
      freeDeliveryEligible: false,
      position: 0,
    },
  ],
  pickupEnabled: true,
  pickupLocation: 'Sarit Centre',
  pickupHours: null,
  freeDeliveryThreshold: null,
  hasDeliveryOption: true,
};

const DRESS: ProductSummary = {
  id: 'p1',
  name: 'Ankara dress',
  price: 2500,
  compareAtPrice: null,
  status: 'available',
  categoryId: null,
  sizes: [],
  colours: [],
  unitsSold: 0,
  coverUrl: null,
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const PRODUCTS: ProductList = {
  products: [DRESS],
  counts: { all: 1, available: 1, sold_out: 0, hidden: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDelivery.mockResolvedValue({ data: DELIVERY, error: null });
});

describe('New order', () => {
  it('when products fail to load, the picker shows the error and Try again, not a spinner', async () => {
    mockProducts.mockResolvedValue({ data: null, error: { status: 0, code: 'UNREACHABLE' } });
    const user = userEvent.setup();
    await render(<NewOrder />);
    await waitFor(() => expect(mockProducts).toHaveBeenCalledTimes(1));
    await user.press(screen.getByRole('button', { name: /Add product/ }));
    expect(await screen.findByText("Couldn't reach oda. Try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('Try again loads the products again and lists them', async () => {
    mockProducts
      .mockResolvedValueOnce({ data: null, error: { status: 500, message: 'Server error.' } })
      .mockResolvedValueOnce({ data: PRODUCTS, error: null });
    const user = userEvent.setup();
    await render(<NewOrder />);
    await user.press(screen.getByRole('button', { name: /Add product/ }));
    await user.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Ankara dress, KSh 2,500' })).toBeTruthy();
    expect(mockProducts).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Server error.')).toBeNull();
  });

  it('when delivery options fail to load, that card shows the error and its own Try again', async () => {
    mockProducts.mockResolvedValue({ data: PRODUCTS, error: null });
    mockDelivery
      .mockResolvedValueOnce({ data: null, error: { status: 0, code: 'OFFLINE' } })
      .mockResolvedValueOnce({ data: DELIVERY, error: null });
    const user = userEvent.setup();
    await render(<NewOrder />);
    expect(
      await screen.findByText("You're offline. Check your connection and try again."),
    ).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Westlands · KSh 200')).toBeTruthy();
    expect(mockDelivery).toHaveBeenCalledTimes(2);
  });
});
