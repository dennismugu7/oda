import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import type { Me, MeResult } from '@/auth/route';
import type { HomeData } from '@/home/api';
import type { Details } from '@/settings/api';
import { signOutOnThisPhone } from '@/settings/signOut';
import { clearSettingsCaches } from '@/settings/useLoaded';
import HomeTab from '../../../app/(tabs)/home';
import YourDetails from '../../../app/settings/details';
import SettingsScreen from '../../../app/settings/index';
import PasswordScreen from '../../../app/settings/password';

// A seller who signs in with Google (decision #107): no password until they set one, and no
// name until they type one (plan §1.4, §1.5). Nothing shows a blank name or a password step
// they can't take.

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockDetails = jest.fn<() => Answer<Details>>();
const mockPaused = jest.fn<() => Answer<{ paused: boolean }>>();
const mockSendLink = jest.fn<(email: string) => Promise<{ data: unknown; error: unknown }>>();
const mockFetchMe = jest.fn<() => Promise<MeResult>>();
const mockHome = jest.fn<() => Answer<HomeData>>();

jest.mock('@/settings/api', () => ({
  settingsApi: { details: () => mockDetails(), paused: () => mockPaused() },
  changePassword: jest.fn(),
  sendPasswordLink: (email: string) => mockSendLink(email),
  paymentsCache: { set: jest.fn() },
}));
jest.mock('@/api', () => ({
  fetchMe: () => mockFetchMe(),
  // Anything else Home loads (the finish-setup card) answers offline.
  apiJson: async () => ({ data: null, error: { status: 0, code: 'OFFLINE' } }),
}));
jest.mock('@/settings/signOut', () => ({ signOutOnThisPhone: jest.fn(async () => undefined) }));
jest.mock('@/settings/RateSheet', () => ({ RateSheet: () => null }));
jest.mock('@/home/api', () => ({
  homeApi: { get: () => mockHome() },
  homeCache: { get: () => null, set: jest.fn() },
}));
jest.mock('@/orders/api', () => ({
  ordersApi: { list: async () => ({ data: { orders: [], counts: {} }, error: null }) },
  ordersCache: { list: () => null, setList: jest.fn() },
}));

const { useLocalSearchParams } = jest.requireMock<{
  useLocalSearchParams: jest.Mock<() => Record<string, string>>;
}>('expo-router');

const NO_NAME: Details = {
  email: 'wanjiku.kamau@gmail.com',
  firstName: null,
  lastName: null,
  recoveryPhone: null,
  memberSince: '2026-10-11T09:00:00.000Z',
  shopName: 'Wanjiku Wear',
};

const ME: Me = {
  email: NO_NAME.email,
  emailVerified: true,
  hasPassword: false,
  onboarding: { step: null, done: true },
  shop: { id: 's1', name: 'Wanjiku Wear', slug: 'wanjiku-wear' },
};

beforeEach(() => {
  jest.clearAllMocks();
  clearSettingsCaches();
  useLocalSearchParams.mockReturnValue({});
  mockDetails.mockResolvedValue({ data: NO_NAME, error: null });
  mockPaused.mockResolvedValue({ data: { paused: false }, error: null });
  mockFetchMe.mockResolvedValue({ kind: 'ok', me: ME });
});

describe('Settings for a Google-only seller', () => {
  it('offers "Set a password" instead of "Change your password"', async () => {
    await render(<SettingsScreen />);
    const row = await screen.findByRole('button', { name: /Set a password/ });
    expect(screen.queryByRole('button', { name: /Change your password/ })).toBeNull();
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/settings/password',
      params: { mode: 'set', email: NO_NAME.email },
    });
  });

  it('a seller with a password still sees "Change your password"', async () => {
    mockFetchMe.mockResolvedValue({ kind: 'ok', me: { ...ME, hasPassword: true } });
    await render(<SettingsScreen />);
    expect(await screen.findByRole('button', { name: /Change your password/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Set a password/ })).toBeNull();
  });

  it('Log out asks in oda’s sheet with the full account email (decision #109 a)', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Log out/ }));
    expect(screen.getByRole('header', { name: 'Log out?' })).toBeTruthy();
    expect(
      screen.getByText('Are you sure you want to log out of wanjiku.kamau@gmail.com?'),
    ).toBeTruthy();
    expect(screen.queryByText(/sign in again with Google/)).toBeNull();
    // The sheet's button (the Settings row behind it has the same name).
    await fireEvent.press(screen.getAllByRole('button', { name: 'Log out' }).at(-1)!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(signOutOnThisPhone).toHaveBeenCalledTimes(1);
  });

  it('shows the email name, never a blank, in the "Your details" row (§1.5)', async () => {
    await render(<SettingsScreen />);
    expect(await screen.findByText('wanjiku.kamau')).toBeTruthy();
  });

  it('Set a password sends the link and says what happens next', async () => {
    useLocalSearchParams.mockReturnValue({ mode: 'set', email: NO_NAME.email });
    mockSendLink.mockResolvedValue({ data: { status: true }, error: null });
    await render(<PasswordScreen />);
    expect(screen.getByText(/You sign in with Google/)).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Send link' }));
    expect(mockSendLink).toHaveBeenCalledWith(NO_NAME.email);
    expect(await screen.findByText(/We.ve sent a link to wanjiku.kamau@gmail.com/)).toBeTruthy();
  });

  it('Set a password: a failed send says so and can be tried again', async () => {
    useLocalSearchParams.mockReturnValue({ mode: 'set', email: NO_NAME.email });
    mockSendLink.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    await render(<PasswordScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText(/You're offline/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send link' })).toBeEnabled();
  });
});

describe('no name yet (§1.5)', () => {
  it('Your details: the email name in the header and initials in the avatar', async () => {
    await render(<YourDetails />);
    expect(await screen.findByText('wanjiku.kamau')).toBeTruthy();
    expect(screen.getByText('W')).toBeTruthy();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('Home: the greeting has no dangling comma', async () => {
    mockHome.mockResolvedValue({
      data: {
        firstName: null,
        hasOrders: false,
        unreadNotifications: 0,
        sales: { thisWeek: 0, lastWeek: 0, days: [0, 0, 0, 0, 0, 0, 0], todayIndex: 0 },
        sources: { ordersThisWeek: 0, top: null },
      },
      error: null,
    });
    await render(<HomeTab />);
    const greeting = await screen.findByRole('header', {
      name: /^Good (morning|afternoon|evening)/,
    });
    expect(greeting).toHaveTextContent(/^Good (morning|afternoon|evening)$/);
  });
});
