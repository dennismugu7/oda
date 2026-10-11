import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import type { OnboardingState, SlugCheck } from '@/onboarding/api';
import { setOnboardingState } from '@/onboarding/useOnboarding';
import NameShop from '../../../app/onboarding/name-shop';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockGet = jest.fn<() => Answer<OnboardingState>>();
const mockAnswer = jest.fn<(body: unknown) => Answer<OnboardingState>>();
const mockCheckSlug = jest.fn<(q: { slug?: string; name?: string }) => Answer<SlugCheck>>();
const mockShop = jest.fn<(body: unknown) => Answer<OnboardingState>>();

jest.mock('@/onboarding/api', () => ({
  onboardingApi: {
    get: () => mockGet(),
    answer: (body: unknown) => mockAnswer(body),
    checkSlug: (q: { slug?: string; name?: string }) => mockCheckSlug(q),
    shop: (body: unknown) => mockShop(body),
    logo: jest.fn(),
  },
  uploadsApi: { request: jest.fn() },
}));
// The photo picker and resizer are native; this step only uses them for the optional logo.
jest.mock('@/onboarding/nativePhotos', () => ({
  nativePhotoDeps: {},
  pickPhotos: jest.fn(async () => ({ photos: [], error: null })),
}));

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    step: 1,
    done: false,
    draft: { businessType: 'fashion', channels: ['whatsapp'] },
    shop: null,
    product: null,
    payment: null,
    checklist: null,
    sizePresets: [],
    ...overrides,
  };
}

const SLOW = { timeout: 3000 };

beforeEach(() => {
  jest.clearAllMocks();
  // The steps share a module-level copy of the state: start each test without one.
  setOnboardingState(null);
});

describe('Onboarding · Name your shop', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ data: state({ step: 3 }), error: null });
  });

  it('checks the link from the name and says it is free', async () => {
    mockCheckSlug.mockResolvedValue({
      data: { slug: 'amani-styles', available: true, message: null, suggestions: [] },
      error: null,
    });
    const user = userEvent.setup();
    await render(<NameShop />);
    await user.type(await screen.findByLabelText('Shop name'), 'Amani Styles');
    expect(screen.getByText('Checking your link…')).toBeTruthy();
    expect(await screen.findByText(/amani-styles.* is yours/, {}, SLOW)).toBeTruthy();
    expect(mockCheckSlug).toHaveBeenLastCalledWith({ name: 'Amani Styles' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('the WhatsApp number shows Kenya’s flag before +254 (decision #109 b)', async () => {
    await render(<NameShop />);
    await screen.findByLabelText('Shop name');
    const flag = screen.getByTestId('kenya-flag', { includeHiddenElements: true });
    expect(flag).toHaveStyle({ width: 20, height: 14, borderRadius: 3 });
    expect(screen.getByText('+254')).toBeTruthy();
  });

  it('a taken link shows the reason and suggestions to pick', async () => {
    mockCheckSlug.mockImplementation(async (q: { slug?: string }) =>
      q.slug === 'amani-styles-ke'
        ? {
            data: { slug: 'amani-styles-ke', available: true, message: null, suggestions: [] },
            error: null,
          }
        : {
            data: {
              slug: 'amani-styles',
              available: false,
              message: 'That link is taken.',
              suggestions: ['amani-styles-ke', 'amani-styles-2'],
            },
            error: null,
          },
    );
    const user = userEvent.setup();
    await render(<NameShop />);
    await user.type(await screen.findByLabelText('Shop name'), 'Amani Styles');
    expect(await screen.findByText('That link is taken.', {}, SLOW)).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'amani-styles-ke' }));
    expect(await screen.findByText(/amani-styles-ke.* is yours/, {}, SLOW)).toBeTruthy();
    expect(mockCheckSlug).toHaveBeenLastCalledWith({ slug: 'amani-styles-ke' });
  });

  it('a failed check says why (offline)', async () => {
    mockCheckSlug.mockResolvedValue({ data: null, error: { status: 0, code: 'OFFLINE' } });
    const user = userEvent.setup();
    await render(<NameShop />);
    await user.type(await screen.findByLabelText('Shop name'), 'Amani');
    expect(
      await screen.findByText("You're offline. Check your connection and try again.", {}, SLOW),
    ).toBeTruthy();
  });

  it('shows the server’s error when saving the shop fails, and stays on the step', async () => {
    mockCheckSlug.mockResolvedValue({
      data: { slug: 'amani-styles', available: true, message: null, suggestions: [] },
      error: null,
    });
    mockShop.mockResolvedValue({
      data: null,
      error: {
        status: 409,
        code: 'slug_taken',
        message: 'Someone just took that link. Pick another.',
      },
    });
    const user = userEvent.setup();
    await render(<NameShop />);
    await user.type(await screen.findByLabelText('Shop name'), 'Amani Styles');
    await screen.findByText(/is yours/, {}, SLOW);
    await user.type(screen.getByLabelText('WhatsApp number'), '712345678');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Someone just took that link. Pick another.')).toBeTruthy();
    expect(mockShop).toHaveBeenCalledWith({
      name: 'Amani Styles',
      slug: 'amani-styles',
      whatsappPhone: '+254712345678',
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});
