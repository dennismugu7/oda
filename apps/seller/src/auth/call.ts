// Every call from the app to our API goes through here (Step 47, fix 4): check the network
// first, give up after 15 s, and turn thrown network errors into an error result, so no
// spinner can run forever. Pure: the network check and the clock are injected.
import type { AuthError } from './errors';

export const CALL_TIMEOUT_MS = 15_000;

export interface CallDeps {
  isOnline: () => Promise<boolean>;
  timeoutMs?: number;
}

export interface CallResult<T> {
  data: T | null;
  error: AuthError | null;
}

class TimeoutError extends Error {}

/** Rejects with a TimeoutError when `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A whole guarded call, its own network check included, within `ms` (sign-in: the owner's
 * 15 s + 5 s rule, decision #107). Never throws: a late answer becomes TIMEOUT.
 */
export async function capCall<T>(
  call: Promise<CallResult<T>>,
  ms: number = CALL_TIMEOUT_MS,
): Promise<CallResult<T>> {
  try {
    return await withTimeout(call, ms);
  } catch {
    return { data: null, error: { status: 0, code: 'TIMEOUT' } };
  }
}

/** Network check, then the call with a timeout; never throws. */
export async function guardedCall<T>(
  run: () => Promise<{ data?: T | null; error?: AuthError | null }>,
  deps: CallDeps,
): Promise<CallResult<T>> {
  let online = true;
  try {
    online = await withTimeout(deps.isOnline(), 3_000);
  } catch {
    online = true; // can't tell: try the call, the timeout still applies
  }
  if (!online) return { data: null, error: { status: 0, code: 'OFFLINE' } };
  try {
    const result = await withTimeout(run(), deps.timeoutMs ?? CALL_TIMEOUT_MS);
    return { data: result.data ?? null, error: result.error ?? null };
  } catch (error) {
    return {
      data: null,
      error: { status: 0, code: error instanceof TimeoutError ? 'TIMEOUT' : 'UNREACHABLE' },
    };
  }
}
