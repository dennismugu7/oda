import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  otpSchema,
  OTP_RESEND_COOLDOWN_SECONDS,
  passwordProblem,
  resendWaitSeconds,
} from './auth';

describe('passwordProblem', () => {
  it('accepts 8+ characters with a number', () => {
    expect(passwordProblem('kitenge2026')).toBeNull();
    expect(passwordProblem('abcdefg1')).toBeNull();
  });

  it('rejects short passwords first', () => {
    expect(passwordProblem('abc1')).toBe('Use at least 8 characters.');
    expect(passwordProblem('')).toBe('Use at least 8 characters.');
  });

  it('requires a number', () => {
    expect(passwordProblem('kitengedress')).toBe('Include at least one number.');
  });

  it('caps the length', () => {
    expect(passwordProblem(`a1${'x'.repeat(127)}`)).toBe('Use at most 128 characters.');
    expect(passwordProblem(`a1${'x'.repeat(126)}`)).toBeNull();
  });
});

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Amani@Example.TEST ')).toBe('amani@example.test');
  });

  it('explains what is wrong', () => {
    expect(emailSchema.safeParse('').error?.issues[0]?.message).toBe('Enter your email.');
    expect(emailSchema.safeParse('amani@').error?.issues[0]?.message).toBe(
      'Enter a valid email, like you@example.com.',
    );
  });
});

describe('otpSchema', () => {
  it('takes exactly 6 digits', () => {
    expect(otpSchema.parse(' 482913 ')).toBe('482913');
    for (const bad of ['48291', '4829130', '48291a', '38538538']) {
      expect(otpSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('resendWaitSeconds', () => {
  const sent = new Date('2026-10-03T10:00:00Z');
  const at = (seconds: number) => new Date(sent.getTime() + seconds * 1000);

  it('counts down from the cooldown', () => {
    expect(resendWaitSeconds(sent, sent)).toBe(OTP_RESEND_COOLDOWN_SECONDS);
    expect(resendWaitSeconds(sent, at(0.4))).toBe(60);
    expect(resendWaitSeconds(sent, at(59.5))).toBe(1);
    expect(resendWaitSeconds(sent, at(60))).toBe(0);
    expect(resendWaitSeconds(sent, at(600))).toBe(0);
  });

  it('is 0 when nothing was sent', () => {
    expect(resendWaitSeconds(null)).toBe(0);
  });
});
