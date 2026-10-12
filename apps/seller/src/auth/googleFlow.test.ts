import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIME_TIMEOUT_MS } from './afterSignIn';
import { CALL_TIMEOUT_MS, type CallResult } from './call';
import { GOOGLE_REFUSED_MESSAGE, OFFLINE_MESSAGE, UNREACHABLE_MESSAGE } from './errors';
import {
  GOOGLE_FAILED_MESSAGE,
  PLAY_SERVICES_MESSAGE,
  PRECHECK_TIMEOUT_MS,
  runGoogleFlow,
  type GoogleFlowDeps,
} from './googleFlow';

// Decision #107, plan §2.2: every path from the Google button ends in navigation, silence
// (cancelled) or one message, and nothing after the sheet waits longer than 15 s + 5 s.

const never = <T>() => new Promise<T>(() => {});

function deps(over: Partial<GoogleFlowDeps> = {}): GoogleFlowDeps {
  return {
    isOnline: vi.fn(async () => true),
    playServicesReady: vi.fn(async () => true),
    pickAccount: vi.fn(async () => ({ kind: 'token' as const, idToken: 'id-token' })),
    sendIdToken: vi.fn(async () => ({ data: { token: 's' }, error: null })),
    finish: vi.fn(async () => null),
    forgetAccount: vi.fn(async () => {}),
    ...over,
  };
}

describe('runGoogleFlow', () => {
  it('signs in: the overlay starts after the account is picked, then finish() runs once', async () => {
    const order: string[] = [];
    const d = deps({
      sendIdToken: vi.fn(async () => {
        order.push('send');
        return { data: {}, error: null };
      }),
      finish: vi.fn(async () => {
        order.push('finish');
        return null;
      }),
    });
    const end = await runGoogleFlow(d, () => order.push('overlay'));
    expect(end).toEqual({ kind: 'done' });
    expect(order).toEqual(['overlay', 'send', 'finish']);
    expect(d.sendIdToken).toHaveBeenCalledWith('id-token');
    expect(d.forgetAccount).not.toHaveBeenCalled();
  });

  it('a closed sheet ends quietly, with no overlay and no server call', async () => {
    const d = deps({ pickAccount: vi.fn(async () => ({ kind: 'cancelled' as const })) });
    const overlay = vi.fn();
    expect(await runGoogleFlow(d, overlay)).toEqual({ kind: 'cancelled' });
    expect(overlay).not.toHaveBeenCalled();
    expect(d.sendIdToken).not.toHaveBeenCalled();
  });

  it('offline: says so before opening the sheet', async () => {
    const d = deps({ isOnline: vi.fn(async () => false) });
    expect(await runGoogleFlow(d, vi.fn())).toEqual({ kind: 'error', message: OFFLINE_MESSAGE });
    expect(d.pickAccount).not.toHaveBeenCalled();
  });

  it('no Play services: says so before opening the sheet', async () => {
    const d = deps({ playServicesReady: vi.fn(async () => false) });
    expect(await runGoogleFlow(d, vi.fn())).toEqual({
      kind: 'error',
      message: PLAY_SERVICES_MESSAGE,
    });
    expect(d.pickAccount).not.toHaveBeenCalled();
  });

  it('Google errors: Play services, a second sheet (quiet) and anything else', async () => {
    const play = deps({
      pickAccount: vi.fn(async () => ({ kind: 'error' as const, code: 'PLAY_SERVICES' as const })),
    });
    expect(await runGoogleFlow(play, vi.fn())).toEqual({
      kind: 'error',
      message: PLAY_SERVICES_MESSAGE,
    });
    const busy = deps({
      pickAccount: vi.fn(async () => ({ kind: 'error' as const, code: 'IN_PROGRESS' as const })),
    });
    expect(await runGoogleFlow(busy, vi.fn())).toEqual({ kind: 'cancelled' });
    const failed = deps({
      pickAccount: vi.fn(async () => ({ kind: 'error' as const, code: 'FAILED' as const })),
    });
    expect(await runGoogleFlow(failed, vi.fn())).toEqual({
      kind: 'error',
      message: GOOGLE_FAILED_MESSAGE,
    });
    const thrown = deps({ pickAccount: vi.fn(() => Promise.reject(new Error('native'))) });
    expect(await runGoogleFlow(thrown, vi.fn())).toEqual({
      kind: 'error',
      message: GOOGLE_FAILED_MESSAGE,
    });
  });

  it('a server refusal: one message, and the Google account is forgotten on this phone', async () => {
    const d = deps({
      sendIdToken: vi.fn(async () => ({
        data: null,
        error: { status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' },
      })),
    });
    expect(await runGoogleFlow(d, vi.fn())).toEqual({
      kind: 'error',
      message: GOOGLE_REFUSED_MESSAGE,
    });
    expect(d.forgetAccount).toHaveBeenCalledTimes(1);
    expect(d.finish).not.toHaveBeenCalled();
  });

  it('server-worded refusals keep their words (deleted account, unverified email, limits)', async () => {
    for (const [code, message, status] of [
      ['ACCOUNT_DELETED', 'This account was deleted.', 403],
      ['GOOGLE_EMAIL_NOT_VERIFIED', 'Your Google account email is not verified.', 403],
      ['RATE_LIMITED', 'Too many sign-in attempts. Try again in 5 minutes.', 429],
    ] as const) {
      const d = deps({
        sendIdToken: vi.fn(async () => ({ data: null, error: { status, code, message } })),
      });
      expect(await runGoogleFlow(d, vi.fn())).toEqual({ kind: 'error', message });
    }
  });

  it('a problem after signing in (finish) is shown on the same screen', async () => {
    const d = deps({ finish: vi.fn(async () => 'Could not open your shop.') });
    expect(await runGoogleFlow(d, vi.fn())).toEqual({
      kind: 'error',
      message: 'Could not open your shop.',
    });
  });
});

describe('time limits (owner: every wait ends within 20 s with a message)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Where the flow stands 1 ms before `ms`, and at `ms`. */
  async function endsBy(d: GoogleFlowDeps, ms: number) {
    let end: unknown = null;
    void runGoogleFlow(d, () => {}).then((e) => {
      end = e;
    });
    await vi.advanceTimersByTimeAsync(ms - 1);
    const before = end;
    await vi.advanceTimersByTimeAsync(1);
    return { before, end };
  }

  it('a hanging network check gives up after 3 s and carries on', async () => {
    const d = deps({ isOnline: vi.fn(never<boolean>) });
    const { end } = await endsBy(d, PRECHECK_TIMEOUT_MS);
    expect(end).toEqual({ kind: 'done' });
  });

  it('a hanging Play services check ends in a message at 3 s', async () => {
    const d = deps({ playServicesReady: vi.fn(never<boolean>) });
    const { before, end } = await endsBy(d, PRECHECK_TIMEOUT_MS);
    expect(before).toBeNull();
    expect(end).toEqual({ kind: 'error', message: GOOGLE_FAILED_MESSAGE });
  });

  it('a hanging server call ends in the unreachable message at 15 s', async () => {
    const d = deps({ sendIdToken: vi.fn(() => never<CallResult<unknown>>()) });
    const { before, end } = await endsBy(d, CALL_TIMEOUT_MS);
    expect(before).toBeNull();
    expect(end).toEqual({ kind: 'error', message: UNREACHABLE_MESSAGE });
    expect(d.forgetAccount).toHaveBeenCalled();
  });

  it('the worst case after picking an account is 15 s + 5 s', () => {
    expect(CALL_TIMEOUT_MS + PRIME_TIMEOUT_MS).toBe(20_000);
  });
});
