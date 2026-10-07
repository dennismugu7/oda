import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ApiError } from '@/api';
import type { OnboardingState } from '@/onboarding/api';
import { setOnboardingState } from '@/onboarding/useOnboarding';
import WhatYouSell from '../../../app/onboarding/what-you-sell';

type Answer<T> = Promise<{ data: T | null; error: ApiError | null }>;
const mockGet = jest.fn<() => Answer<OnboardingState>>();
const mockAnswer = jest.fn<(body: unknown) => Answer<OnboardingState>>();

jest.mock('@/onboarding/api', () => ({
  onboardingApi: {
    get: () => mockGet(),
    answer: (body: unknown) => mockAnswer(body),
  },
  uploadsApi: { request: jest.fn() },
}));

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    step: 1,
    done: false,
    draft: { businessType: null, channels: null },
    shop: null,
    product: null,
    payment: null,
    checklist: null,
    sizePresets: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // The steps share a module-level copy of the state: start each test without one.
  setOnboardingState(null);
});

describe('Onboarding · What do you sell?', () => {
  it('saves the picked type and goes to the next step', async () => {
    mockGet.mockResolvedValue({ data: state(), error: null });
    mockAnswer.mockResolvedValue({ data: state({ step: 2 }), error: null });
    const user = userEvent.setup();
    await render(<WhatYouSell />);
    const shoes = await screen.findByRole('radio', { name: 'Shoes & bags' });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.press(shoes);
    expect(screen.getByRole('radio', { name: 'Shoes & bags' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/where-you-sell'));
    expect(mockAnswer).toHaveBeenCalledWith({ step: 1, businessType: 'shoes_bags' });
  });

  it('shows the error when saving fails and does not move on', async () => {
    mockGet.mockResolvedValue({ data: state(), error: null });
    mockAnswer.mockResolvedValue({ data: null, error: { status: 401 } });
    const user = userEvent.setup();
    await render(<WhatYouSell />);
    await user.press(await screen.findByRole('radio', { name: 'Clothes & fashion' }));
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('You were signed out. Sign in again to carry on.')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('when the state fails to load, shows the error and Try again', async () => {
    mockGet
      .mockResolvedValueOnce({ data: null, error: { status: 0, code: 'UNREACHABLE' } })
      .mockResolvedValueOnce({ data: state(), error: null });
    const user = userEvent.setup();
    await render(<WhatYouSell />);
    expect(await screen.findByText("Couldn't reach oda. Try again.")).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('What do you sell?')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
