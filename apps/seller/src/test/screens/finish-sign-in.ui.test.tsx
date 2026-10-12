import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import type { Me, MeResult } from '@/auth/route';
import { finishSignIn } from '@/auth/finishSignIn';
import { meCache } from '@/auth/useMe';

// After a sign-in (decision #107, plan §2.2 c): the next screen's data is loaded first, then the
// sign-in screen is replaced once: straight to Home or the onboarding step, never through the
// start gate ("/") or Welcome.

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const order: string[] = [];
const mockFetchMe = jest.fn<() => Promise<MeResult>>();
const mockHome = jest.fn<() => Answer<unknown>>();
const mockTodo = jest.fn<() => Answer<unknown>>();
const mockOnboarding = jest.fn<() => Answer<unknown>>();
const mockLanding = jest.fn<() => Promise<{ tab: string; screen: string | null }>>();
const mockHomeCacheSet = jest.fn();
const mockSetOnboarding = jest.fn();
const mockClearPending = jest.fn(async () => undefined);

jest.mock('@/api', () => ({ fetchMe: () => mockFetchMe() }));
jest.mock('@/home/api', () => ({
  homeApi: { get: () => mockHome() },
  homeCache: { set: (v: unknown) => mockHomeCacheSet(v) },
}));
jest.mock('@/orders/api', () => ({
  ordersApi: { list: () => mockTodo() },
  ordersCache: { setList: jest.fn() },
}));
jest.mock('@/onboarding/api', () => ({ onboardingApi: { get: () => mockOnboarding() } }));
jest.mock('@/onboarding/useOnboarding', () => ({
  clearOnboardingState: jest.fn(),
  setOnboardingState: (v: unknown) => mockSetOnboarding(v),
}));
jest.mock('@/restore/start', () => ({ landing: () => mockLanding() }));
jest.mock('@/auth/signup', () => ({ clearPendingSignup: () => mockClearPending() }));

const ME: Me = {
  email: 'wanjiku@example.test',
  emailVerified: true,
  hasPassword: false,
  onboarding: { step: null, done: true },
  shop: { id: 's1', name: 'Wanjiku Wear', slug: 'wanjiku-wear' },
};

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  meCache.set(null);
  (router.replace as jest.Mock).mockImplementation((to: unknown) => order.push(`replace ${to}`));
  (router.push as jest.Mock).mockImplementation((to: unknown) => order.push(`push ${to}`));
  mockLanding.mockResolvedValue({ tab: '/home', screen: null });
  mockHome.mockImplementation(async () => {
    order.push('home data');
    return { data: { firstName: null }, error: null };
  });
  mockTodo.mockImplementation(async () => {
    order.push('to-do list');
    return { data: { orders: [] }, error: null };
  });
  mockOnboarding.mockImplementation(async () => {
    order.push('onboarding state');
    return { data: { step: 1 }, error: null };
  });
});

describe('finishSignIn', () => {
  it('a seller with a shop: Home after its data is loaded', async () => {
    mockFetchMe.mockResolvedValue({ kind: 'ok', me: ME });
    expect(await finishSignIn()).toBeNull();
    expect(order).toEqual(['home data', 'to-do list', 'replace /home']);
    expect(mockHomeCacheSet).toHaveBeenCalledWith({ firstName: null });
    expect(meCache.get()).toEqual(ME);
    expect(mockClearPending).toHaveBeenCalled();
  });

  it('a restored screen opens on top of its tab', async () => {
    mockFetchMe.mockResolvedValue({ kind: 'ok', me: ME });
    mockLanding.mockResolvedValue({ tab: '/orders', screen: '/orders/o1' });
    await finishSignIn();
    expect(order.slice(-2)).toEqual(['replace /orders', 'push /orders/o1']);
  });

  it('a new seller: the first onboarding step after its state is loaded', async () => {
    mockFetchMe.mockResolvedValue({
      kind: 'ok',
      me: { ...ME, onboarding: { step: 1, done: false }, shop: null },
    });
    expect(await finishSignIn()).toBeNull();
    expect(order[0]).toBe('onboarding state');
    expect(order[1]).toMatch(/^replace \/onboarding\//);
    expect(order).toHaveLength(2);
    expect(mockSetOnboarding).toHaveBeenCalledWith({ step: 1 });
  });

  it('no answer from /api/me: a message, and no navigation at all', async () => {
    mockFetchMe.mockResolvedValue({ kind: 'unreachable' });
    expect(await finishSignIn()).toMatch(/Couldn't reach oda/);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('never goes through the start gate or Welcome', async () => {
    for (const me of [
      { kind: 'ok', me: ME },
      { kind: 'ok', me: { ...ME, onboarding: { step: 3, done: false } } },
      { kind: 'signed-out' },
      { kind: 'error' },
    ] as MeResult[]) {
      mockFetchMe.mockResolvedValue(me);
      await finishSignIn();
    }
    for (const call of (router.replace as jest.Mock).mock.calls) {
      expect(call[0]).not.toBe('/');
      expect(call[0]).not.toBe('/welcome');
    }
  });
});
