// Turns Better Auth / API errors into the messages sellers see. Our server hooks already send
// friendly messages (rate limits, password rules, existing email); Better Auth's own
// messages are replaced here.

export interface AuthError {
  status?: number;
  code?: string;
  message?: string;
}

export type ErrorAction = 'verify-email' | 'sign-in-instead' | 'resend-code' | null;

export interface FriendlyError {
  message: string;
  /** What the screen can offer next (a link or a navigation). */
  action: ErrorAction;
}

export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";
export const UNREACHABLE_MESSAGE = "Couldn't reach oda. Try again.";
const GENERIC = 'Something went wrong. Please try again.';

/** Codes whose message our server writes for sellers (decisions #43–#45). */
const SERVER_WORDED = new Set(['RATE_LIMITED', 'WEAK_PASSWORD', 'EMAIL_HAS_ACCOUNT']);

export function friendlyAuthError(error: AuthError | null | undefined): FriendlyError {
  if (!error) return { message: GENERIC, action: null };
  const code = error.code ?? '';
  // From authCall (src/auth/call.ts): no network before the call, or no answer in time.
  if (code === 'OFFLINE') return { message: OFFLINE_MESSAGE, action: null };
  if (code === 'TIMEOUT' || code === 'UNREACHABLE' || !error.status) {
    return { message: UNREACHABLE_MESSAGE, action: null };
  }

  if (SERVER_WORDED.has(code) && error.message) {
    return {
      message: error.message,
      action: code === 'EMAIL_HAS_ACCOUNT' ? 'sign-in-instead' : null,
    };
  }
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      // Same words whether or not the email has an account.
      return { message: 'Incorrect email or password. Try again.', action: null };
    case 'EMAIL_NOT_VERIFIED':
      return { message: 'Confirm your email first. We sent you a code.', action: 'verify-email' };
    case 'INVALID_OTP':
      return { message: "That code isn't right. Check the email and try again.", action: null };
    case 'OTP_EXPIRED':
      return { message: 'That code has expired. Tap Resend for a new one.', action: 'resend-code' };
    case 'TOO_MANY_ATTEMPTS':
      return {
        message: 'Too many wrong codes. Tap Resend for a new one.',
        action: 'resend-code',
      };
    case 'INVALID_EMAIL':
      return { message: 'Enter a valid email, like you@example.com.', action: null };
    case 'PASSWORD_TOO_SHORT':
      return { message: 'Use at least 8 characters.', action: null };
  }
  if (error.status === 429) {
    return { message: error.message ?? 'Too many tries. Wait a few minutes.', action: null };
  }
  if (error.status >= 500) return { message: GENERIC, action: null };
  return { message: GENERIC, action: null };
}
