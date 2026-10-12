import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { OrderingBlocker } from '@oda/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import type { Me, MeResult } from '@/auth/route';
import { meCache } from '@/auth/useMe';
import type { HomeData } from '@/home/api';
import HomeTab from '../../../app/(tabs)/home';

// Decision #109: Home says when buyers can't order, and each missing item opens the screen
// that fixes it. The banner goes as soon as the shop takes orders.

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockHome = jest.fn<() => Answer<HomeData>>();
const mockFetchMe = jest.fn<() => Promise<MeResult>>();

jest.mock('@/api', () => ({
  fetchMe: () => mockFetchMe(),
  // Anything else Home loads (the finish-setup card) answers offline.
  apiJson: async () => ({ data: null, error: { status: 0, code: 'OFFLINE' } }),
}));
jest.mock('@/home/api', () => ({
  homeApi: { get: () => mockHome() },
  homeCache: { get: () => null, set: jest.fn() },
}));
jest.mock('@/orders/api', () => ({
  ordersApi: { list: async () => ({ data: null, error: null }) },
  ordersCache: { list: () => null, setList: jest.fn() },
}));

const ME: Me = {
  email: 'amani@example.test',
  emailVerified: true,
  hasPassword: true,
  onboarding: { step: null, done: true },
  shop: { id: 's1', name: 'Amani Styles', slug: 'amani-styles' },
};

function home(blockers: OrderingBlocker[]): HomeData {
  return {
    firstName: 'Amani',
    hasOrders: false,
    unreadNotifications: 0,
    ordering: { blockers },
    sales: { thisWeek: 0, lastWeek: 0, days: [0, 0, 0, 0, 0, 0, 0], todayIndex: 0 },
    sources: { ordersThisWeek: 0, top: null },
  };
}

const TITLE = 'Your shop isn’t taking orders yet';

beforeEach(() => {
  jest.clearAllMocks();
  meCache.set(ME);
  mockFetchMe.mockResolvedValue({ kind: 'ok', me: ME });
});

async function showHome(blockers: OrderingBlocker[]) {
  mockHome.mockResolvedValue({ data: home(blockers), error: null });
  await render(<HomeTab />);
  await screen.findByRole('header', { name: /^Good (morning|afternoon|evening), Amani$/ });
}

describe('Home: not taking orders', () => {
  it('no delivery option: one button straight to Delivery', async () => {
    await showHome(['delivery']);
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a way to get paid' })).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Add a delivery area or turn on pickup' }),
    );
    expect(router.push).toHaveBeenCalledWith('/delivery');
  });

  it('no way to get paid: one button straight to Payments', async () => {
    await showHome(['payment']);
    expect(screen.getByText(TITLE)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a way to get paid' }));
    expect(router.push).toHaveBeenCalledWith('/payments');
  });

  it('paused: one button to Settings, where the Pause switch is', async () => {
    await showHome(['paused']);
    expect(screen.getByText(TITLE)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn off Pause shop' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('several missing: every item, delivery first', async () => {
    await showHome(['delivery', 'payment', 'paused']);
    const shown = screen
      .getAllByText(
        /^(Add a delivery area or turn on pickup|Add a way to get paid|Turn off Pause shop)$/,
      )
      .map((n) => n.props.children);
    expect(shown).toEqual([
      'Add a delivery area or turn on pickup',
      'Add a way to get paid',
      'Turn off Pause shop',
    ]);
  });

  it('all fine: no banner', async () => {
    await showHome([]);
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
