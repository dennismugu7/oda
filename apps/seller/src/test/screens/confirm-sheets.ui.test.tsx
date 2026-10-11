import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ApiError } from '@/api';
import type { Category, ProductFields, ProductList, ProductSummary } from '@/catalogue/api';
import ShopTab from '../../../app/(tabs)/shop';
import { DeletedNotice } from '@/welcome/DeletedNotice';

// Decision #109 a: the two alerts that weren't a yes/no confirmation. The Shop tab's long-press
// menu is oda's choice sheet; "Your account is deleted" is a notice on Welcome.

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockProducts = jest.fn<() => Answer<ProductList>>();
const mockUpdate = jest.fn<(id: string, fields: Partial<ProductFields>) => Answer<unknown>>();

jest.mock('@/catalogue/api', () => ({
  catalogueApi: {
    products: () => mockProducts(),
    categories: async (): Answer<Category[]> => ({ data: [], error: null }),
    update: (id: string, fields: Partial<ProductFields>) => mockUpdate(id, fields),
  },
}));
jest.mock('@/auth/useMe', () => ({ useMe: () => null }));
// The signed-in API client (Better Auth) isn't used here.
jest.mock('@/api', () => ({
  apiJson: async () => ({ data: null, error: { status: 0, code: 'OFFLINE' } }),
}));

const { useLocalSearchParams } = jest.requireMock<{
  useLocalSearchParams: jest.Mock<() => Record<string, string>>;
}>('expo-router');

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
  updatedAt: '2026-10-11T09:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  useLocalSearchParams.mockReturnValue({});
  mockProducts.mockResolvedValue({
    data: { products: [DRESS], counts: { all: 1, available: 1, sold_out: 0, hidden: 0 } },
    error: null,
  });
  mockUpdate.mockResolvedValue({ data: {}, error: null });
});

describe('Shop tab: "Show this product as…"', () => {
  it('long press opens oda’s sheet with the other two statuses', async () => {
    await render(<ShopTab />);
    await fireEvent(await screen.findByText('Ankara dress'), 'longPress');
    expect(screen.getByRole('header', { name: 'Ankara dress' })).toBeTruthy();
    expect(screen.getByText('Show this product as…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Available' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Sold out' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('p1', { status: 'sold_out' }));
    expect(screen.queryByText('Show this product as…')).toBeNull();
  });
});

describe('Welcome after Delete account', () => {
  it('says the account is deleted, once, with only OK', async () => {
    useLocalSearchParams.mockReturnValue({ deleted: '1' });
    await render(<DeletedNotice />);
    expect(screen.getByRole('header', { name: 'Your account is deleted' })).toBeTruthy();
    expect(
      screen.getByText(
        'Your shop is closed and you’re signed out. Your data is removed after 30 days.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('header', { name: 'Your account is deleted' })).toBeNull();
  });

  it('Welcome without the flag shows no notice', async () => {
    await render(<DeletedNotice />);
    expect(screen.queryByRole('header', { name: 'Your account is deleted' })).toBeNull();
  });
});
