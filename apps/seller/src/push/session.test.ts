import { describe, expect, it } from 'vitest';
import {
  registerThisPhone,
  unregisterThisPhone,
  type PushDevice,
  type PushServer,
  type TokenStore,
} from './session';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

function fakes(
  permission: 'granted' | 'denied' | 'undetermined',
  allow = true,
  token: string | null = TOKEN,
) {
  const calls: string[] = [];
  let stored: string | null = null;
  const device: PushDevice = {
    permission: async () => permission,
    request: async () => {
      calls.push('prompt');
      return allow;
    },
    token: async () => token,
  };
  const store: TokenStore = {
    get: async () => stored,
    set: async (t) => {
      stored = t;
    },
    clear: async () => {
      stored = null;
    },
  };
  const server: PushServer = {
    register: async (t) => {
      calls.push(`register ${t}`);
      return true;
    },
    unregister: async (t) => {
      calls.push(`unregister ${t}`);
      return true;
    },
  };
  return { device, store, server, calls, stored: () => stored };
}

describe('push on this phone', () => {
  it('asks once, then registers the token and remembers it', async () => {
    const f = fakes('undetermined');
    expect(await registerThisPhone(f.device, f.store, f.server)).toBe('registered');
    expect(f.calls).toEqual(['prompt', `register ${TOKEN}`]);
    expect(f.stored()).toBe(TOKEN);
  });

  it('does nothing more when the seller says no or there is no token', async () => {
    const no = fakes('undetermined', false);
    expect(await registerThisPhone(no.device, no.store, no.server)).toBe('denied');
    expect(no.calls).toEqual(['prompt']);
    const denied = fakes('denied');
    expect(await registerThisPhone(denied.device, denied.store, denied.server)).toBe('denied');
    expect(denied.calls).toEqual([]);
    const none = fakes('granted', true, null);
    expect(await registerThisPhone(none.device, none.store, none.server)).toBe('no_token');
  });

  it('sign-out removes the token from the account, then forgets it', async () => {
    const f = fakes('granted');
    await registerThisPhone(f.device, f.store, f.server);
    await unregisterThisPhone(f.store, f.server);
    expect(f.calls.at(-1)).toBe(`unregister ${TOKEN}`);
    expect(f.stored()).toBeNull();
    // Nothing stored: nothing to do.
    await unregisterThisPhone(f.store, f.server);
    expect(f.calls.filter((c) => c.startsWith('unregister'))).toHaveLength(1);
  });
});
