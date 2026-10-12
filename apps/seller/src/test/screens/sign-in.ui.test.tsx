import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SignIn from '../../../app/sign-in';

const mockSignInEmail = jest.fn<(body: { email: string; password: string }) => Promise<unknown>>();
const mockFinish = jest.fn(async () => null);

jest.mock('@/auth/client', () => ({
  authClient: { signIn: { email: (body: never) => mockSignInEmail(body) } },
  // The real authCall adds the network check and timeout; here the call just runs.
  authCall: async (run: () => Promise<{ data?: unknown; error?: unknown }>) => {
    const result = await run();
    return { data: result.data ?? null, error: result.error ?? null };
  },
}));

// After the password is right: decide and preload the next screen (decision #107).
jest.mock('@/auth/finishSignIn', () => ({ finishSignIn: () => mockFinish() }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Sign in', () => {
  it('shows the email and password fields with their labels', async () => {
    await render(<SignIn />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says what is missing when Continue is pressed with empty fields', async () => {
    const user = userEvent.setup();
    await render(<SignIn />);
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter your password.')).toBeTruthy();
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(mockSignInEmail).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows the server’s answer when the password is wrong', async () => {
    mockSignInEmail.mockResolvedValue({
      data: null,
      error: {
        status: 401,
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      },
    });
    const user = userEvent.setup();
    await render(<SignIn />);
    await user.type(screen.getByLabelText('Email'), 'amani@example.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText(
        'Incorrect email or password. If you signed up with Google, use Continue with Google.',
      ),
    ).toBeTruthy();
    expect(mockSignInEmail).toHaveBeenCalledWith({
      email: 'amani@example.test',
      password: 'wrong-password',
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('goes to the app after a successful sign-in', async () => {
    mockSignInEmail.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const user = userEvent.setup();
    await render(<SignIn />);
    await user.type(screen.getByLabelText('Email'), 'amani@example.test');
    await user.type(screen.getByLabelText('Password'), 'a-good-password');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));
    // Never through the start gate (its wordmark would flash in between).
    expect(router.replace).not.toHaveBeenCalledWith('/');
  });
});
