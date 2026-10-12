import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  afterSignIn,
  PRIME_TIMEOUT_MS,
  SIGNED_IN_PROBLEM,
  type AfterSignInDeps,
} from './afterSignIn';
import { OFFLINE_MESSAGE, UNREACHABLE_MESSAGE } from './errors';
import type { Me, MeResult } from './route';

// After a sign-in (decision #107, plan §2.2): the next screen and its first data are ready
// before the sign-in screen leaves, within 5 s; otherwise a message on the same screen.

const never = <T>() => new Promise<T>(() => {});

const me = (over: Partial<Me> = {}): Me => ({
  email: 'wanjiku@example.test',
  emailVerified: true,
  hasPassword: false,
  onboarding: { step: null, done: true },
  shop: { id: 's1', name: 'Wanjiku Wear', slug: 'wanjiku-wear' },
  ...over,
});

function deps(result: MeResult, over: Partial<AfterSignInDeps> = {}): AfterSignInDeps {
  return {
    fetchMe: vi.fn(async () => result),
    landing: vi.fn(async () => ({ tab: '/home', screen: null })),
    primeMe: vi.fn(),
    primeHome: vi.fn(async () => {}),
    primeOnboarding: vi.fn(async () => {}),
    ...over,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('afterSignIn', () => {
  it("a seller with a shop: Home (or the restored screen), with Home's data loaded first", async () => {
    const d = deps(
      { kind: 'ok', me: me() },
      { landing: vi.fn(async () => ({ tab: '/orders', screen: '/orders/o1' })) },
    );
    expect(await afterSignIn(d)).toEqual({
      kind: 'go',
      to: { route: '/orders', screen: '/orders/o1' },
    });
    expect(d.primeMe).toHaveBeenCalledWith(me());
    expect(d.primeHome).toHaveBeenCalled();
    expect(d.primeOnboarding).not.toHaveBeenCalled();
  });

  it('a new seller: the onboarding step, with its state loaded first', async () => {
    const d = deps({
      kind: 'ok',
      me: me({ onboarding: { step: 1, done: false }, shop: null }),
    });
    const next = await afterSignIn(d);
    expect(next.kind).toBe('go');
    expect(next.kind === 'go' && next.to.route).toMatch(/^\/onboarding\//);
    expect(d.primeOnboarding).toHaveBeenCalled();
    expect(d.primeHome).not.toHaveBeenCalled();
  });

  it('stays on the sign-in screen with a message when /api/me fails (never Welcome or the gate)', async () => {
    expect(await afterSignIn(deps({ kind: 'offline' }))).toEqual({
      kind: 'problem',
      message: OFFLINE_MESSAGE,
    });
    expect(await afterSignIn(deps({ kind: 'unreachable' }))).toEqual({
      kind: 'problem',
      message: UNREACHABLE_MESSAGE,
    });
    for (const kind of ['error', 'signed-out'] as const) {
      expect(await afterSignIn(deps({ kind }))).toEqual({
        kind: 'problem',
        message: SIGNED_IN_PROBLEM,
      });
    }
  });

  it('goes at 5 s when the next screen is known but its data is slow', async () => {
    vi.useFakeTimers();
    const d = deps({ kind: 'ok', me: me() }, { primeHome: vi.fn(never) });
    let next: unknown = null;
    void afterSignIn(d).then((n) => {
      next = n;
    });
    await vi.advanceTimersByTimeAsync(PRIME_TIMEOUT_MS - 1);
    expect(next).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(next).toEqual({ kind: 'go', to: { route: '/home', screen: null } });
  });

  it('says so at 5 s when /api/me hangs', async () => {
    vi.useFakeTimers();
    const d = deps({ kind: 'ok', me: me() }, { fetchMe: vi.fn(never<MeResult>) });
    let next: unknown = null;
    void afterSignIn(d).then((n) => {
      next = n;
    });
    await vi.advanceTimersByTimeAsync(PRIME_TIMEOUT_MS);
    expect(next).toEqual({ kind: 'problem', message: UNREACHABLE_MESSAGE });
  });
});
