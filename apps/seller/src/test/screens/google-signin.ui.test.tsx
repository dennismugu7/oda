import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { GoogleResult } from '@/auth/google';
import { GOOGLE_REFUSED_MESSAGE, OFFLINE_MESSAGE, UNREACHABLE_MESSAGE } from '@/auth/errors';
import { PLAY_SERVICES_MESSAGE } from '@/auth/googleFlow';
import SignIn from '../../../app/sign-in';
import SignUp from '../../../app/sign-up';

// Google sign-in on 05 Sign in and 02 Sign up (decision #107, plan §2.2 a–e and §2.3): the
// button's spinner from the tap, everything else locked, "Signing you in…" from the picked
// account until the next screen, and every other ending back to a usable screen.

type Result<T> = {
  data?: T | null;
  error?: { status?: number; code?: string; message?: string } | null;
};

const mockAvailable = jest.fn(() => true);
const mockOnline = jest.fn<() => Promise<boolean>>();
const mockPlay = jest.fn<() => Promise<boolean>>();
const mockPick = jest.fn<() => Promise<GoogleResult>>();
const mockGoogleSignOut = jest.fn<() => Promise<void>>();
const mockSocial = jest.fn<(body: unknown) => Promise<Result<unknown>>>();
const mockEmail = jest.fn<(body: unknown) => Promise<Result<unknown>>>();
const mockFinish = jest.fn<() => Promise<string | null>>();
const mockStartSignup = jest.fn();

jest.mock('@/auth/google', () => ({
  googleAvailable: () => mockAvailable(),
  googlePlayServicesReady: () => mockPlay(),
  googleSignIn: () => mockPick(),
  googleSignOut: () => mockGoogleSignOut(),
}));
jest.mock('@/net', () => ({ isOnline: () => mockOnline() }));
jest.mock('@/auth/client', () => ({
  authClient: {
    signIn: {
      social: (body: unknown) => mockSocial(body),
      email: (body: unknown) => mockEmail(body),
    },
  },
  // The real authCall adds the network check and timeout; googleFlow keeps its own 15 s limit.
  authCall: async (run: () => Promise<Result<unknown>>) => {
    const result = await run();
    return { data: result.data ?? null, error: result.error ?? null };
  },
}));
jest.mock('@/auth/finishSignIn', () => ({ finishSignIn: () => mockFinish() }));
jest.mock('@/auth/signup', () => ({ startSignup: (...a: unknown[]) => mockStartSignup(...a) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const never = <T,>() => new Promise<T>(() => {});

const googleButton = (name = 'Continue with Google') => screen.getByRole('button', { name });

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
  mockOnline.mockResolvedValue(true);
  mockPlay.mockResolvedValue(true);
  mockPick.mockResolvedValue({ kind: 'token', idToken: 'id-token' });
  mockGoogleSignOut.mockResolvedValue(undefined);
  mockSocial.mockResolvedValue({ data: { token: 's' }, error: null });
  mockFinish.mockResolvedValue(null);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('a) the tap', () => {
  it('Sign in: the Google button spins at once and everything else is locked', async () => {
    // Nothing after the tap ever answers: what shows comes from the tap itself.
    mockOnline.mockReturnValue(never());
    await render(<SignIn />);
    await fireEvent.press(googleButton());

    expect(googleButton()).toBeBusy();
    expect(googleButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByLabelText('Email').props.editable).toBe(false);
    expect(screen.getByLabelText('Password').props.editable).toBe(false);
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    for (const link of ['Forgot password?', 'Open your free shop', 'Terms', 'Privacy notice']) {
      expect(screen.getByRole('link', { name: link })).toBeDisabled();
    }
    // Not yet the overlay: that starts once an account is picked.
    expect(screen.queryByText('Signing you in…')).toBeNull();
  });

  it('a second tap does nothing', async () => {
    const picked = deferred<GoogleResult>();
    mockPick.mockReturnValue(picked.promise);
    await render(<SignIn />);
    await fireEvent.press(googleButton());
    await fireEvent.press(googleButton());
    await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(1));
    expect(mockOnline).toHaveBeenCalledTimes(1);
  });

  it('Sign up: "Sign up with Google" spins and locks the form too', async () => {
    mockOnline.mockReturnValue(never());
    await render(<SignUp />);
    await fireEvent.press(googleButton('Sign up with Google'));
    expect(googleButton('Sign up with Google')).toBeBusy();
    expect(screen.getByRole('button', { name: 'Create my account' })).toBeDisabled();
    expect(screen.getByLabelText('Email').props.editable).toBe(false);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeDisabled();
  });

  it('the email button locks the Google button while it signs in', async () => {
    mockEmail.mockReturnValue(never());
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'amani@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'a-good-password');
    // Not awaited: the sign-in it starts never ends in this test.
    void fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeBusy());
    expect(googleButton()).toBeDisabled();
  });
});

describe('b–c) account picked → next screen', () => {
  it('"Signing you in…" covers the server call and finishing, and is never taken down on success', async () => {
    const sent = deferred<Result<unknown>>();
    const finished = deferred<string | null>();
    mockSocial.mockReturnValue(sent.promise);
    mockFinish.mockReturnValue(finished.promise);
    await render(<SignIn />);
    await fireEvent.press(googleButton());

    expect(await screen.findByText('Signing you in…')).toBeTruthy();
    expect(mockSocial).toHaveBeenCalledWith({ provider: 'google', idToken: { token: 'id-token' } });
    expect(mockFinish).not.toHaveBeenCalled();

    await act(async () => sent.resolve({ data: { token: 's' }, error: null }));
    expect(screen.getByText('Signing you in…')).toBeTruthy();
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));

    // finishSignIn navigated (router.replace inside it): this screen keeps the overlay until
    // it unmounts, so the form never shows again in between.
    await act(async () => finished.resolve(null));
    expect(screen.getByText('Signing you in…')).toBeTruthy();
    // Under the overlay (hidden from screen readers by it), the button still spins.
    expect(
      screen.getByRole('button', { name: 'Continue with Google', includeHiddenElements: true }),
    ).toBeBusy();
    // The screen itself never sends the seller to the start gate or Welcome.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Sign up: the same overlay and finish', async () => {
    mockFinish.mockReturnValue(never());
    await render(<SignUp />);
    await fireEvent.press(googleButton('Sign up with Google'));
    expect(await screen.findByText('Signing you in…')).toBeTruthy();
    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    expect(mockStartSignup).not.toHaveBeenCalled();
  });
});

describe('d) the sheet is closed', () => {
  it('the screen is back to normal at once, with no message and no server call', async () => {
    mockPick.mockResolvedValue({ kind: 'cancelled' });
    await render(<SignIn />);
    await fireEvent.press(googleButton());
    await waitFor(() => expect(googleButton()).not.toBeBusy());
    expect(googleButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.getByLabelText('Email').props.editable).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockSocial).not.toHaveBeenCalled();
  });
});

describe('e) one message, and the button works again', () => {
  async function pressAndExpect(message: string) {
    await render(<SignIn />);
    await fireEvent.press(googleButton());
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText('Signing you in…')).toBeNull();
    expect(googleButton()).toBeEnabled();
    expect(googleButton()).not.toBeBusy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  }

  it('offline: before Google opens', async () => {
    mockOnline.mockResolvedValue(false);
    await pressAndExpect(OFFLINE_MESSAGE);
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('no Play services', async () => {
    mockPlay.mockResolvedValue(false);
    await pressAndExpect(PLAY_SERVICES_MESSAGE);
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('the server refuses: the Google account is forgotten so the next tap asks again', async () => {
    mockSocial.mockResolvedValue({
      data: null,
      error: { status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
    await pressAndExpect(GOOGLE_REFUSED_MESSAGE);
    expect(mockGoogleSignOut).toHaveBeenCalledTimes(1);
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('a deleted account keeps the server’s words', async () => {
    const message =
      'This account was deleted. Its shop is closed, and its data is removed after 30 days.';
    mockSocial.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'ACCOUNT_DELETED', message },
    });
    await pressAndExpect(message);
  });

  it('signed in but the shop could not be opened: the message from finishing', async () => {
    mockFinish.mockResolvedValue(UNREACHABLE_MESSAGE);
    await pressAndExpect(UNREACHABLE_MESSAGE);
  });

  it('a server that never answers: the message at 15 s, not later', async () => {
    jest.useFakeTimers();
    mockSocial.mockReturnValue(never());
    await render(<SignIn />);
    await fireEvent.press(googleButton());
    expect(await screen.findByText('Signing you in…')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(14_999);
    });
    expect(screen.getByText('Signing you in…')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText(UNREACHABLE_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Signing you in…')).toBeNull();
    expect(googleButton()).toBeEnabled();
  });
});

describe('the screens', () => {
  it('Sign in: Google first, the Terms line under it, then "or" and the email form', async () => {
    await render(<SignIn />);
    expect(googleButton()).toBeTruthy();
    expect(screen.getByText(/By continuing, you agree to oda.s/)).toBeTruthy();
    expect(screen.getByLabelText('or')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Terms' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy notice' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/terms$/),
    );
    expect(WebBrowser.openBrowserAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/privacy$/),
    );
  });

  it('no Google client ID in this build: no Google button and no "or"', async () => {
    mockAvailable.mockReturnValue(false);
    await render(<SignIn />);
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByLabelText('or')).toBeNull();
    expect(screen.queryByText(/By continuing, you agree/)).toBeNull();
    await render(<SignUp />);
    expect(screen.queryByRole('button', { name: 'Sign up with Google' })).toBeNull();
  });
});

describe('email sign-in', () => {
  it('goes through finishSignIn (no start gate in between) and keeps spinning until it ends', async () => {
    const finished = deferred<string | null>();
    mockFinish.mockReturnValue(finished.promise);
    mockEmail.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'amani@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'a-good-password');
    void fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeBusy();
    await act(async () => finished.resolve(null));
    expect(router.replace).not.toHaveBeenCalledWith('/');
  });

  it('a problem after signing in shows on the screen and frees the button', async () => {
    mockFinish.mockResolvedValue(OFFLINE_MESSAGE);
    mockEmail.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'amani@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'a-good-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});
