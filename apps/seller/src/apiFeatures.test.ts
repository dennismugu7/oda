// Decision #110 f: this app sends X-Oda-App-Features: arranged on every API call, so the server
// sends arranged orders as they are (older apps get them as a delivery "Arranged with buyer").
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/client', () => ({ authClient: { getCookie: async () => 'session=abc' } }));
vi.mock('@/auth/call', () => ({ CALL_TIMEOUT_MS: 15_000, guardedCall: vi.fn() }));
vi.mock('@/config', () => ({ API_URL: 'https://api.example.test' }));
vi.mock('@/net', () => ({ isOnline: async () => true }));

describe('apiFetch', () => {
  it('tells the server this app knows arranged orders', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    const { apiFetch } = await import('./api');
    await apiFetch('/api/orders/o1');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/orders/o1');
    expect(init.headers).toMatchObject({ 'x-oda-app-features': 'arranged', cookie: 'session=abc' });
    vi.unstubAllGlobals();
  });
});
