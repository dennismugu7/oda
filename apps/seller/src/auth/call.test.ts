import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALL_TIMEOUT_MS, guardedCall } from './call';
import { friendlyAuthError } from './errors';
import { resolveStart, START_TIMEOUT_MS } from './start';

afterEach(() => vi.useRealTimers());

const online = { isOnline: async () => true };
const offline = { isOnline: async () => false };

describe('guardedCall (Step 47, fix 4)', () => {
  it('says offline at once, without calling the server', async () => {
    const run = vi.fn(async () => ({ data: 1, error: null }));
    const result = await guardedCall(run, offline);
    expect(run).not.toHaveBeenCalled();
    expect(result.error).toEqual({ status: 0, code: 'OFFLINE' });
    expect(friendlyAuthError(result.error).message).toBe(
      "You're offline. Check your connection and try again.",
    );
  });

  it('gives up after 15 seconds', async () => {
    vi.useFakeTimers();
    const pending = guardedCall(() => new Promise(() => {}), online);
    await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const result = await pending;
    expect(result.error).toEqual({ status: 0, code: 'TIMEOUT' });
    expect(friendlyAuthError(result.error).message).toBe("Couldn't reach oda. Try again.");
    expect(CALL_TIMEOUT_MS).toBe(15_000);
  });

  it('turns a thrown network error into a message instead of a stuck spinner', async () => {
    const result = await guardedCall(async () => {
      throw new TypeError('Network request failed');
    }, online);
    expect(result.error).toEqual({ status: 0, code: 'UNREACHABLE' });
    expect(friendlyAuthError(result.error).message).toBe("Couldn't reach oda. Try again.");
  });

  it('passes results and server errors through', async () => {
    expect(await guardedCall(async () => ({ data: 'ok' }), online)).toEqual({
      data: 'ok',
      error: null,
    });
    const err = { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' };
    expect((await guardedCall(async () => ({ error: err }), online)).error).toBe(err);
  });

  it('still tries the call when the network check hangs', async () => {
    vi.useFakeTimers();
    const pending = guardedCall(async () => ({ data: 'ok' }), {
      isOnline: () => new Promise(() => {}),
    });
    await vi.advanceTimersByTimeAsync(3_001);
    expect((await pending).data).toBe('ok');
  });
});

describe('start gate never spins forever', () => {
  it('ends on "Couldn\'t reach oda" when /api/me never answers', async () => {
    vi.useFakeTimers();
    const pending = resolveStart({
      getCookie: async () => '{"better-auth.session_token":{"value":"x"}} session_token=x',
      fetchMe: () => new Promise(() => {}),
      signOutLocal: async () => {},
    });
    await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ to: 'unreachable' });
  });

  it('shows offline when the phone has no network', async () => {
    const route = await resolveStart({
      getCookie: async () => 'session_token=x',
      fetchMe: async () => ({ kind: 'offline' }),
      signOutLocal: async () => {},
    });
    expect(route).toEqual({ to: 'offline' });
  });
});
