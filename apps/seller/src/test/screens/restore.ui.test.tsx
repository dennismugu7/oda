// State restoration (decision #100): a form's unsaved changes come back after Android closed
// the app in the background, with "Unsaved changes restored" and Discard.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReviewTab } from '@oda/shared';
import { AppState, type AppStateStatus } from 'react-native';
import type { ApiError } from '@/api';
import type { Category, Product } from '@/catalogue/api';
import { ProductForm } from '@/catalogue/ProductForm';
import { emptyDraft } from '@/catalogue/form';
import { restoreStore } from '@/restore/native';
import type { ReviewList, SellerReview } from '@/reviews/api';
import { reviewsCache } from '@/reviews/cache';
import ReviewsScreen from '../../../app/reviews';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockCategories = jest.fn<() => Answer<Category[]>>();
const mockProduct = jest.fn<(id: string) => Answer<Product>>();
const mockList = jest.fn<(tab: ReviewTab, cursor?: string | null) => Answer<ReviewList>>();
const mockGetReview = jest.fn<(id: string) => Answer<SellerReview>>();

jest.mock('@/catalogue/api', () => ({
  catalogueApi: {
    categories: () => mockCategories(),
    product: (id: string) => mockProduct(id),
  },
}));
jest.mock('@/auth/useMe', () => ({ useMe: () => null }));
jest.mock('@/onboarding/nativePhotos', () => ({ nativePhotoDeps: {}, pickPhotos: jest.fn() }));
// Reanimated's native worklets don't load under Jest: the photo strip's drag list renders
// its items plainly (as in catalogue.ui.test.tsx).
type MockListProps = {
  data: unknown[];
  keyExtractor: (item: unknown) => string;
  renderItem: (info: {
    item: unknown;
    drag: () => void;
    isActive: boolean;
    getIndex: () => number;
  }) => unknown;
};
jest.mock('react-native-draggable-flatlist', () => {
  const { createElement, Fragment } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ data, keyExtractor, renderItem }: MockListProps) =>
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
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('@/reviews/api', () => ({
  reviewsApi: {
    list: (tab: ReviewTab, cursor?: string | null) => mockList(tab, cursor),
    get: (id: string) => mockGetReview(id),
    reply: jest.fn(),
    report: jest.fn(),
  },
}));

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

const REVIEW: SellerReview = {
  id: 'rev_1',
  orderId: 'ord_1',
  orderNumber: 1042,
  buyerDisplayName: 'Wanjiku K.',
  rating: 5,
  tags: [],
  createdAt: new Date().toISOString(),
  edited: false,
  sellerReply: null,
  repliedAt: null,
  reportedAt: null,
  photosHidden: false,
  items: [
    {
      orderItemId: 'it_1',
      productId: 'p1',
      productName: 'Ankara dress',
      coverUrl: null,
      rating: 5,
      text: 'Lovely fabric, fits well.',
      photoUrl: null,
    },
  ],
};

const LIST: ReviewList = {
  summary: { average: 5, count: 1, histogram: [{ stars: 5, count: 1 }] },
  counts: { all: 1, needs_reply: 1, low: 0 },
  reviews: [REVIEW],
  next: null,
};

/** The app-state listeners the screen added, to send "background" like Android does. */
let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  reviewsCache.clear();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as never;
  });
  mockCategories.mockResolvedValue({ data: [], error: null });
  mockProduct.mockResolvedValue({ data: DRESS, error: null });
});

async function goToBackground() {
  await act(async () => {
    for (const listener of appStateListeners) listener('background');
  });
}

describe('Product form drafts', () => {
  it('puts unsaved changes back, with "Unsaved changes restored" and Discard', async () => {
    await restoreStore.saveDraft('product.p1', {
      draft: { ...emptyDraft(), name: 'Ankara maxi dress', price: '2,800' },
      photos: [
        {
          preview: 'file:///cache/thumb.jpg',
          photo: {
            objectKey: 'products/p1/2.jpg',
            thumbKey: 'products/p1/2-t.jpg',
            width: 1,
            height: 1,
          },
        },
      ],
    });
    const user = userEvent.setup();
    await render(<ProductForm productId="p1" />);
    expect(await screen.findByText('Unsaved changes restored')).toBeTruthy();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Ankara maxi dress');
    expect(screen.getByLabelText('Price')).toHaveDisplayValue('2,800');

    await user.press(screen.getByRole('button', { name: 'Discard unsaved changes' }));
    expect(screen.queryByText('Unsaved changes restored')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Ankara dress');
    expect(screen.getByLabelText('Price')).toHaveDisplayValue('2,500');
    await waitFor(async () => expect(await restoreStore.loadDraft('product.p1')).toBeNull());
  });

  it('never puts one product’s draft on another', async () => {
    await restoreStore.saveDraft('product.p2', {
      draft: { ...emptyDraft(), name: 'Kitenge shirt' },
      photos: [],
    });
    await render(<ProductForm productId="p1" />);
    expect(await screen.findByLabelText('Name')).toHaveDisplayValue('Ankara dress');
    expect(screen.queryByText('Unsaved changes restored')).toBeNull();
  });

  it('keeps the changes when the app goes to the background, and drops them on leaving', async () => {
    const user = userEvent.setup();
    const view = await render(<ProductForm productId="p1" />);
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Ankara midi');
    await goToBackground();
    expect(await restoreStore.loadDraft('product.p1')).toMatchObject({
      draft: { name: 'Ankara midi', price: '2,500' },
      photos: [{ photo: { objectKey: 'products/p1/1.jpg' } }],
    });

    // Back / Save: the screen closes normally, so there's nothing to bring back.
    view.unmount();
    await waitFor(async () => expect(await restoreStore.loadDraft('product.p1')).toBeNull());
  });

  it('keeps nothing for an untouched form', async () => {
    await render(<ProductForm productId="p1" />);
    await screen.findByLabelText('Name');
    await goToBackground();
    expect(await restoreStore.hasDraft('product.p1')).toBe(false);
  });
});

describe('Review reply drafts', () => {
  it('reopens the reply sheet with the unsent reply', async () => {
    mockList.mockResolvedValue({ data: LIST, error: null });
    mockGetReview.mockResolvedValue({ data: REVIEW, error: null });
    await restoreStore.saveDraft('review-reply', { reviewId: 'rev_1', reply: 'Asante sana!' });
    const user = userEvent.setup();
    await render(<ReviewsScreen />);
    expect(await screen.findByText('Unsaved changes restored')).toBeTruthy();
    expect(screen.getByLabelText('Your reply')).toHaveDisplayValue('Asante sana!');
    expect(mockGetReview).toHaveBeenCalledWith('rev_1');

    await user.press(screen.getByRole('button', { name: 'Discard unsaved changes' }));
    expect(screen.getByLabelText('Your reply')).toHaveDisplayValue('');
    await waitFor(async () => expect(await restoreStore.loadDraft('review-reply')).toBeNull());
  });
});
