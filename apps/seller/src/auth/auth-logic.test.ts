import { describe, expect, it } from 'vitest';
import { apiLabel } from '../config';
import { cleanCode, formatCountdown, resendAvailableAt, secondsUntil } from './countdown';
import { friendlyAuthError } from './errors';
import { startRoute, type Me } from './route';

const me = (overrides: Partial<Me> = {}): Me => ({
  email: 'amani@example.test',
  emailVerified: true,
  onboarding: { step: 1, done: false },
  shop: null,
  ...overrides,
});

describe('startRoute', () => {
  it('sends a signed-out seller to Welcome', () => {
    expect(startRoute(false, null)).toEqual({ to: '/welcome' });
  });

  it('sends a signed-in, verified seller on (placeholder until onboarding)', () => {
    expect(startRoute(true, { kind: 'ok', me: me() })).toEqual({ to: '/start' });
  });

  it('sends an unverified seller to the code screen', () => {
    expect(startRoute(true, { kind: 'ok', me: me({ emailVerified: false }) })).toEqual({
      to: '/verify',
      email: 'amani@example.test',
    });
  });

  it('treats a session the server rejected as signed out', () => {
    expect(startRoute(true, { kind: 'signed-out' })).toEqual({ to: '/welcome' });
  });

  it('keeps offline and error apart from signed out', () => {
    expect(startRoute(true, { kind: 'offline' })).toEqual({ to: 'offline' });
    expect(startRoute(true, { kind: 'error' })).toEqual({ to: 'error' });
    expect(startRoute(true, null)).toEqual({ to: 'error' });
  });
});

describe('friendlyAuthError', () => {
  it('keeps the messages our server words for sellers', () => {
    expect(
      friendlyAuthError({
        status: 422,
        code: 'EMAIL_HAS_ACCOUNT',
        message: 'This email already has a shop. Sign in?',
      }),
    ).toEqual({ message: 'This email already has a shop. Sign in?', action: 'sign-in-instead' });
    expect(
      friendlyAuthError({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many tries. Wait 15 minutes or reset your password.',
      }).message,
    ).toBe('Too many tries. Wait 15 minutes or reset your password.');
    expect(
      friendlyAuthError({
        status: 400,
        code: 'WEAK_PASSWORD',
        message: 'Include at least one number.',
      }).message,
    ).toBe('Include at least one number.');
  });

  it("rewords Better Auth's own messages", () => {
    expect(friendlyAuthError({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }).message).toBe(
      'Incorrect email or password. Try again.',
    );
    expect(
      friendlyAuthError({ status: 400, code: 'INVALID_OTP', message: 'Invalid OTP' }).message,
    ).toBe("That code isn't right. Check the email and try again.");
    expect(friendlyAuthError({ status: 400, code: 'OTP_EXPIRED' })).toEqual({
      message: 'That code has expired. Tap Resend for a new one.',
      action: 'resend-code',
    });
    expect(friendlyAuthError({ status: 403, code: 'TOO_MANY_ATTEMPTS' }).action).toBe(
      'resend-code',
    );
    expect(friendlyAuthError({ status: 403, code: 'EMAIL_NOT_VERIFIED' }).action).toBe(
      'verify-email',
    );
  });

  it('says when the phone is offline, and never shows raw server text', () => {
    expect(friendlyAuthError({ status: 0, code: 'OFFLINE' }).message).toBe(
      "You're offline. Check your connection and try again.",
    );
    expect(friendlyAuthError({ status: 0 }).message).toBe("Couldn't reach oda. Try again.");
    expect(friendlyAuthError({ status: 500, message: 'TypeError: x is undefined' }).message).toBe(
      'Something went wrong. Please try again.',
    );
    expect(
      friendlyAuthError({ status: 400, code: 'SOMETHING_NEW', message: 'Raw text' }).message,
    ).toBe('Something went wrong. Please try again.');
  });
});

describe('resend countdown', () => {
  const now = 1_000_000;

  it('waits the full minute after a code, or what the server says', () => {
    expect(secondsUntil(resendAvailableAt(now), now)).toBe(60);
    expect(secondsUntil(resendAvailableAt(now, 42), now)).toBe(42);
    expect(secondsUntil(resendAvailableAt(now, 42), now + 41_500)).toBe(1);
    expect(secondsUntil(resendAvailableAt(now, 42), now + 42_000)).toBe(0);
  });

  it('formats as m:ss', () => {
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(5)).toBe('0:05');
  });
});

describe('cleanCode', () => {
  it('keeps up to 6 digits from typing or pasting', () => {
    expect(cleanCode('482', 6)).toBe('482');
    expect(cleanCode('Your code: 482 913', 6)).toBe('482913');
    expect(cleanCode('4829135', 6)).toBe('482913');
  });
});

describe('apiLabel', () => {
  it('names the server the app talks to', () => {
    expect(apiLabel('http://localhost:3000')).toBe('local · localhost:3000');
    expect(apiLabel('http://10.0.2.2:3000')).toBe('local · 10.0.2.2:3000');
    expect(apiLabel('https://oda-eta.vercel.app')).toBe('oda-eta.vercel.app');
  });
});
