// Seller sign-up from the app (decision #49). The server holds the attempt (email, pending
// password, code); this phone keeps the attempt id in SecureStore until the code is entered,
// so a killed app reopens on the code screen for the same attempt. The password stays in
// memory only, for signing in right after the code.
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '@/config';
import { isOnline } from '@/net';
import { CALL_TIMEOUT_MS, guardedCall, type CallResult } from './call';
import type { AuthError } from './errors';

export const PENDING_SIGNUP_KEY = 'oda_signup_attempt';

export interface PendingSignup {
  attemptId: string;
  email: string;
}

export interface StartResponse extends PendingSignup {
  resumed: boolean;
  retryAfter: number;
  codeSent: boolean;
}

export interface CodeResponse extends PendingSignup {
  retryAfter: number;
  codeSent: boolean;
}

/** In memory only: the password typed on the sign-up screen, to sign in after the code. */
let pendingPassword: { email: string; password: string } | null = null;

export function passwordFor(email: string): string | null {
  return pendingPassword?.email === email ? pendingPassword.password : null;
}

export async function getPendingSignup(): Promise<PendingSignup | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_SIGNUP_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<PendingSignup>) : null;
    return value?.attemptId && value.email
      ? { attemptId: value.attemptId, email: value.email }
      : null;
  } catch {
    return null;
  }
}

/** Forget the attempt (verified, expired, or signed out). */
export async function clearPendingSignup(): Promise<void> {
  pendingPassword = null;
  await SecureStore.deleteItemAsync(PENDING_SIGNUP_KEY).catch(() => {});
}

async function post<T>(path: string, body: unknown): Promise<{ data?: T; error?: AuthError }> {
  const res = await fetch(`${API_URL}/api/signup/${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as
    (T & { error?: { code?: string; message?: string; retryAfter?: number } }) | null;
  if (res.ok && json) return { data: json };
  return {
    error: {
      status: res.status,
      code: json?.error?.code,
      message: json?.error?.message,
      retryAfter: json?.error?.retryAfter,
    },
  };
}

/** Sign up, or resume this phone's attempt for the same email (with the newest password). */
export async function startSignup(
  email: string,
  password: string,
): Promise<CallResult<StartResponse>> {
  const pending = await getPendingSignup();
  const attemptId = pending?.email === email ? pending.attemptId : undefined;
  const result = await guardedCall(
    () => post<StartResponse>('start', { email, password, attemptId }),
    { isOnline },
  );
  if (result.data) {
    pendingPassword = { email: result.data.email, password };
    await SecureStore.setItemAsync(
      PENDING_SIGNUP_KEY,
      JSON.stringify({ attemptId: result.data.attemptId, email: result.data.email }),
    );
  }
  return result;
}

export function resendSignupCode(attemptId: string): Promise<CallResult<CodeResponse>> {
  return guardedCall(() => post<CodeResponse>('resend', { attemptId }), { isOnline });
}

/** Checks the code; on success the account exists and the attempt is forgotten. */
export async function verifySignupCode(
  attemptId: string,
  code: string,
): Promise<CallResult<{ email: string }>> {
  const result = await guardedCall(() => post<{ email: string }>('verify', { attemptId, code }), {
    isOnline,
  });
  const gone = result.error?.status === 404 || result.error?.code === 'EMAIL_HAS_ACCOUNT';
  if (result.data || gone) {
    // Keep the password in memory for the sign-in that follows a successful code.
    const keep = result.data ? pendingPassword : null;
    await clearPendingSignup();
    pendingPassword = keep;
  }
  return result;
}
