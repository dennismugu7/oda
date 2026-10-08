import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReviewTab } from '@oda/shared';
import type { ApiError } from '@/api';
import type { ReviewList, SellerReview } from '@/reviews/api';
import { reviewsCache } from '@/reviews/cache';
import ReviewsScreen from '../../../app/reviews';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockList = jest.fn<(tab: ReviewTab, cursor?: string | null) => Answer<ReviewList>>();
const mockReply = jest.fn<(id: string, reply: string) => Answer<SellerReview>>();
const mockReport = jest.fn<(id: string, reason: string) => Answer<SellerReview>>();

jest.mock('@/reviews/api', () => ({
  reviewsApi: {
    list: (tab: ReviewTab, cursor?: string | null) => mockList(tab, cursor),
    get: jest.fn(),
    reply: (id: string, reply: string) => mockReply(id, reply),
    report: (id: string, reason: string) => mockReport(id, reason),
  },
}));

function review(overrides: Partial<SellerReview> = {}): SellerReview {
  return {
    id: 'rev_1',
    orderId: 'ord_1',
    orderNumber: 1042,
    buyerDisplayName: 'Wanjiku K.',
    rating: 5,
    tags: ['Fast delivery'],
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
    ...overrides,
  };
}

const LOW = review({
  id: 'rev_2',
  orderNumber: 1043,
  buyerDisplayName: 'Otieno M.',
  rating: 2,
  tags: [],
  items: [
    {
      orderItemId: 'it_2',
      productId: 'p2',
      productName: 'Kitenge shirt',
      coverUrl: null,
      rating: 2,
      text: 'Took a week to arrive.',
      photoUrl: null,
    },
  ],
});

function list(reviews: SellerReview[]): ReviewList {
  return {
    summary: {
      average: 3.5,
      count: 2,
      histogram: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: stars === 5 || stars === 2 ? 1 : 0,
      })),
    },
    counts: { all: 2, needs_reply: 2, low: 1 },
    reviews,
    next: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  reviewsCache.clear();
});

describe('Reviews', () => {
  it('shows only the loading state, then the reviews with tab counts', async () => {
    let answer: (value: { data: ReviewList; error: null }) => void = () => {};
    mockList.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render(<ReviewsScreen />);
    expect(screen.queryByText('Lovely fabric, fits well.')).toBeNull();
    answer({ data: list([review(), LOW]), error: null });
    expect(await screen.findByText('Lovely fabric, fits well.')).toBeTruthy();
    expect(screen.getByText('Took a week to arrive.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'All, 2' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Needs reply, 2' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Low ratings, 1' })).toBeTruthy();
    expect(mockList).toHaveBeenCalledWith('all', undefined);
  });

  it('Low ratings loads that tab', async () => {
    mockList.mockImplementation(async (tab) => ({
      data: tab === 'low' ? list([LOW]) : list([review(), LOW]),
      error: null,
    }));
    const user = userEvent.setup();
    await render(<ReviewsScreen />);
    await user.press(await screen.findByRole('tab', { name: 'Low ratings, 1' }));
    expect(mockList).toHaveBeenLastCalledWith('low', undefined);
    await waitFor(() => expect(screen.queryByText('Lovely fabric, fits well.')).toBeNull());
    expect(screen.getByText('Took a week to arrive.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Low ratings, 1' })).toBeSelected();
  });

  it('an empty tab says so', async () => {
    mockList.mockImplementation(async (tab) => ({
      data:
        tab === 'needs_reply'
          ? { ...list([]), counts: { all: 2, needs_reply: 0, low: 1 } }
          : list([review()]),
      error: null,
    }));
    const user = userEvent.setup();
    await render(<ReviewsScreen />);
    await user.press(await screen.findByRole('tab', { name: 'Needs reply, 2' }));
    expect(await screen.findByText('All replied')).toBeTruthy();
    expect(screen.getByText('Every review has your reply.')).toBeTruthy();
  });

  it('Reply saves the text and shows it under the review', async () => {
    mockList.mockResolvedValue({ data: list([review()]), error: null });
    const replied = review({ sellerReply: 'Asante sana!', repliedAt: new Date().toISOString() });
    mockReply.mockImplementation(async () => {
      // The server's list has the reply from now on (the screen reloads it after saving).
      mockList.mockResolvedValue({ data: list([replied]), error: null });
      return { data: replied, error: null };
    });
    const user = userEvent.setup();
    await render(<ReviewsScreen />);
    await user.press(await screen.findByRole('button', { name: 'Reply to Wanjiku K.' }));
    const save = screen.getByRole('button', { name: 'Save reply' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Your reply'), 'Asante sana!');
    await user.press(save);
    expect(mockReply).toHaveBeenCalledWith('rev_1', 'Asante sana!');
    expect(await screen.findByText('Your reply')).toBeTruthy();
    expect(screen.getByText('Asante sana!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit your reply' })).toBeTruthy();
  });

  it('Report review sends the reason and marks the review reported', async () => {
    mockList.mockResolvedValue({ data: list([review()]), error: null });
    const reported = review({ reportedAt: new Date().toISOString() });
    mockReport.mockImplementation(async () => {
      mockList.mockResolvedValue({ data: list([reported]), error: null });
      return { data: reported, error: null };
    });
    const user = userEvent.setup();
    await render(<ReviewsScreen />);
    await user.press(
      await screen.findByRole('button', { name: 'More actions for Wanjiku K.’s review' }),
    );
    await user.press(screen.getByRole('button', { name: /Report review$/ }));
    expect(await screen.findByText('Report this review?')).toBeTruthy();
    await user.type(screen.getByLabelText('What’s wrong?'), 'Not about this order');
    await user.press(screen.getByRole('button', { name: 'Report review' }));
    expect(mockReport).toHaveBeenCalledWith('rev_1', 'Not about this order');
    expect(await screen.findByText('Reported')).toBeTruthy();
  });

  it('offline with nothing saved: says so and offers Try again', async () => {
    mockList.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    await render(<ReviewsScreen />);
    expect(await screen.findByText('You’re offline. Connect to load this.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
