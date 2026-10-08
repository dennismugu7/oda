import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ApiError } from '@/api';
import type { Category, Product, ProductFields } from '@/catalogue/api';
import { ProductForm } from '@/catalogue/ProductForm';
import Categories from '../../../app/categories';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockCategories = jest.fn<() => Answer<Category[]>>();
const mockProduct = jest.fn<(id: string) => Answer<Product>>();
const mockUpdate = jest.fn<(id: string, fields: Partial<ProductFields>) => Answer<Product>>();
const mockReorder = jest.fn<(ids: string[]) => Answer<Category[]>>();

jest.mock('@/catalogue/api', () => ({
  catalogueApi: {
    categories: () => mockCategories(),
    product: (id: string) => mockProduct(id),
    update: (id: string, fields: Partial<ProductFields>) => mockUpdate(id, fields),
    reorderCategories: (ids: string[]) => mockReorder(ids),
  },
}));
jest.mock('@/auth/useMe', () => ({ useMe: () => null }));
// The photo picker and uploads (native modules, the signed-in API): not used by these tests.
jest.mock('@/onboarding/nativePhotos', () => ({ nativePhotoDeps: {}, pickPhotos: jest.fn() }));
type MockListProps<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (info: {
    item: T;
    drag: () => void;
    isActive: boolean;
    getIndex: () => number;
  }) => unknown;
};
// Reanimated's native worklets don't load under Jest: a plain list that renders each row the
// way the drag list does (the rows, their labels and accessibility actions stay real).
jest.mock('react-native-draggable-flatlist', () => {
  const { createElement, Fragment } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: <T,>({ data, keyExtractor, renderItem }: MockListProps<T>) =>
      data.map((item, index) =>
        createElement(
          Fragment,
          { key: keyExtractor(item) },
          renderItem({ item, drag: () => {}, isActive: false, getIndex: () => index }) as never,
        ),
      ),
    ScaleDecorator: ({ children }: { children: unknown }) => children,
  };
});
// No native gesture handler under Jest: its root view renders as a plain View.
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));

function category(id: string, name: string, position: number): Category {
  return { id, name, isVisible: true, position, productCount: 2, thumbUrls: [] };
}

const DRESSES = category('c1', 'Dresses', 0);
const SHIRTS = category('c2', 'Shirts', 1);

const DRESS: Product = {
  id: 'p1',
  name: 'Ankara dress',
  description: null,
  price: 2500,
  compareAtPrice: null,
  categoryId: null,
  status: 'available',
  sizes: [],
  colours: [],
  unitsSold: 0,
  photos: [
    {
      id: 'ph1',
      position: 0,
      objectKey: 'products/p1/1.jpg',
      thumbKey: 'products/p1/1-thumb.jpg',
      width: 1200,
      height: 1600,
      url: null,
      thumbUrl: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Product form', () => {
  it('a was-price at or under the price is caught before saving', async () => {
    mockCategories.mockResolvedValue({ data: [DRESSES], error: null });
    mockProduct.mockResolvedValue({ data: DRESS, error: null });
    mockUpdate.mockResolvedValue({ data: { ...DRESS, compareAtPrice: 3200 }, error: null });
    const user = userEvent.setup();
    await render(<ProductForm productId="p1" />);
    const was = await screen.findByLabelText('Was price');
    expect(screen.getByLabelText('Price')).toHaveDisplayValue('2,500');
    await user.type(was, '2000');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The was-price must be higher than the price.')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();

    await user.clear(was);
    await user.type(was, '3200');
    expect(was).toHaveDisplayValue('3,200');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockUpdate).toHaveBeenCalledWith('p1', { compareAtPrice: 3200 });
  });
});

describe('Categories', () => {
  it('shows only the loading state, then the categories', async () => {
    let answer: (value: { data: Category[]; error: null }) => void = () => {};
    mockCategories.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render(<Categories />);
    expect(screen.queryByText('Dresses')).toBeNull();
    answer({ data: [DRESSES, SHIRTS], error: null });
    expect(await screen.findByText('Dresses')).toBeTruthy();
    expect(screen.getByText('Shirts')).toBeTruthy();
  });

  it('“Move down” and “Move up” reorder from the row’s accessibility actions', async () => {
    mockCategories.mockResolvedValue({ data: [DRESSES, SHIRTS], error: null });
    mockReorder
      .mockResolvedValueOnce({ data: [SHIRTS, DRESSES], error: null })
      .mockResolvedValueOnce({ data: [DRESSES, SHIRTS], error: null });
    await render(<Categories />);
    const dresses = await screen.findByRole('button', { name: 'Dresses, 2 products' });
    expect(dresses.props.accessibilityActions).toEqual([{ name: 'moveDown', label: 'Move down' }]);
    await fireEvent(dresses, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(mockReorder).toHaveBeenCalledWith(['c2', 'c1']);

    const moved = await screen.findByRole('button', { name: 'Dresses, 2 products' });
    await waitFor(() =>
      expect(moved.props.accessibilityActions).toEqual([{ name: 'moveUp', label: 'Move up' }]),
    );
    await fireEvent(moved, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(mockReorder).toHaveBeenLastCalledWith(['c1', 'c2']);
  });

  it('a failed load offers Try again', async () => {
    mockCategories.mockResolvedValue({ data: null, error: { status: 0, code: 'UNREACHABLE' } });
    await render(<Categories />);
    expect(await screen.findByText("Couldn't reach oda. Try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
