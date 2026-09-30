import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { envSchema } = await import('./env');

describe('server env', () => {
  it('accepts a local config and defaults the shop base URL', () => {
    const env = envSchema.parse({ DATABASE_URL: 'postgres://oda:oda@localhost:5442/oda' });
    expect(env.PUBLIC_SHOP_BASE_URL).toBe('http://localhost:3000');
  });

  it('rejects a missing database URL with a clear message', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
