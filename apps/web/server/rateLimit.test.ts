import { describe, expect, it } from 'vitest';
import { clientIp } from './rateLimit';

describe('clientIp', () => {
  const ip = (headers: Record<string, string>) => clientIp(new Headers(headers));

  it("uses Vercel's own headers", () => {
    expect(ip({ 'x-vercel-forwarded-for': '41.90.1.2' })).toBe('41.90.1.2');
    expect(ip({ 'x-real-ip': '41.90.1.3' })).toBe('41.90.1.3');
    expect(ip({ 'x-vercel-forwarded-for': '41.90.1.2, 10.0.0.1', 'x-real-ip': '9.9.9.9' })).toBe(
      '41.90.1.2',
    );
  });

  it('never trusts x-forwarded-for, which the client can fake', () => {
    expect(ip({ 'x-forwarded-for': '1.2.3.4' })).toBe('unknown');
    expect(ip({ 'x-forwarded-for': '1.2.3.4, 41.90.1.2', 'x-real-ip': '41.90.1.2' })).toBe(
      '41.90.1.2',
    );
  });

  it('falls back to one shared bucket', () => {
    expect(ip({})).toBe('unknown');
    expect(clientIp(undefined)).toBe('unknown');
  });
});
