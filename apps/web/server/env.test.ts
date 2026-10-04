import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { envSchema } = await import('./env');

describe('server env', () => {
  it('accepts a local config and defaults the shop base URL', () => {
    const env = envSchema.parse({ DATABASE_URL: 'postgres://oda:oda@localhost:5442/oda' });
    expect(env.PUBLIC_SHOP_BASE_URL).toBe('http://localhost:3000');
  });

  it('on Vercel, requires a public https:// shop base URL (never localhost)', () => {
    const base = { DATABASE_URL: 'postgres://oda:oda@db.example.test/oda', VERCEL: '1' };
    const issue = (extra: Record<string, string>) =>
      envSchema.safeParse({ ...base, ...extra }).error?.issues[0]?.message;
    expect(issue({})).toMatch(/PUBLIC_SHOP_BASE_URL must be a public https/);
    expect(issue({ PUBLIC_SHOP_BASE_URL: 'http://localhost:3000' })).toMatch(/not localhost/);
    expect(issue({ PUBLIC_SHOP_BASE_URL: 'https://localhost:3000' })).toMatch(/not localhost/);
    expect(issue({ PUBLIC_SHOP_BASE_URL: 'http://oda-eta.vercel.app' })).toMatch(/https/);
    expect(issue({ PUBLIC_SHOP_BASE_URL: 'https://10.0.2.2:3000' })).toMatch(/https/);
    expect(
      envSchema.parse({ ...base, PUBLIC_SHOP_BASE_URL: 'https://oda-eta.vercel.app/' })
        .PUBLIC_SHOP_BASE_URL,
    ).toBe('https://oda-eta.vercel.app');
  });

  it('rejects a missing database URL with a clear message', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
