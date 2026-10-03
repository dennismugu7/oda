import { z } from 'zod';

// Seller sign-up and sign-in rules (docs/spec.md §5.1, decision #43), shared by the server
// (Better Auth hooks) and the seller app's forms. Messages are shown to sellers as they are.

/** Length of the email verification code. */
export const OTP_LENGTH = 6;
/** How long a code works. */
export const OTP_TTL_SECONDS = 10 * 60;
/** Wrong guesses allowed per code; after that the seller needs a new one. */
export const OTP_MAX_ATTEMPTS = 3;
/** Wait between two codes for the same email (the app shows a countdown). */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Sessions last 60 days and are renewed at most once a day on use (decision #43). */
export const SESSION_TTL_SECONDS = 60 * 24 * 60 * 60;
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;
/** How long a password reset link works. */
export const RESET_LINK_TTL_SECONDS = 60 * 60;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: 'Enter your email.' })
  .max(254, { error: 'That email is too long.' })
  .pipe(z.email({ error: 'Enter a valid email, like you@example.com.' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` })
  .regex(/[0-9]/, { error: 'Include at least one number.' });

export const otpSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^[0-9]{${OTP_LENGTH}}$`), {
    error: `Enter the ${OTP_LENGTH}-digit code from the email.`,
  });

/** The first problem with a password, or null when it follows the rules. */
export function passwordProblem(password: string): string | null {
  const result = passwordSchema.safeParse(password);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Choose another password.');
}

/** Seconds left before another code can be sent (0 = now). */
export function resendWaitSeconds(lastSentAt: Date | null, now: Date = new Date()): number {
  if (!lastSentAt) return 0;
  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed));
}

/** The password rules as a checklist (shown under password fields, ticking as you type). */
export function passwordChecks(password: string): { label: string; ok: boolean }[] {
  return [
    {
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    { label: 'At least one number', ok: /[0-9]/.test(password) },
  ];
}
