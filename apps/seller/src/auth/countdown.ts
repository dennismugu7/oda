import { OTP_RESEND_COOLDOWN_SECONDS } from '@oda/shared';

// The verify screen's "Resend in 0:42" countdown, as plain functions.

/** When a code can be asked for again: from the server's retryAfter, or a full cooldown. */
export function resendAvailableAt(now: number, retryAfterSeconds?: number): number {
  const wait = retryAfterSeconds ?? OTP_RESEND_COOLDOWN_SECONDS;
  return now + Math.max(0, wait) * 1000;
}

export function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** "0:42" */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Keeps only digits, at most `length` of them (pasting "Your code: 482 913" works). */
export function cleanCode(input: string, length: number): string {
  return input.replace(/\D/g, '').slice(0, length);
}
