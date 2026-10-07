import { z } from 'zod';
import { normalizeKePhone } from '../phone';
import { validateSlug } from '../slug';

// Field rules shared by the write whitelists. Messages are shown to sellers as they are.

/** Trimmed text; an empty string becomes null so optional fields can be cleared. */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} can be at most ${max} characters.` })
    .transform((value) => (value === '' ? null : value))
    .nullable();

export const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, { error: min === 1 ? `Enter ${label.toLowerCase()}.` : `${label} is too short.` })
    .max(max, { error: `${label} can be at most ${max} characters.` });

/** Any Kenyan mobile format in, E.164 out. */
export const kePhone = z
  .string()
  .max(32, { error: 'Enter a Kenyan mobile number, e.g. 0712 345 678.' })
  .transform((value, ctx) => {
    const e164 = normalizeKePhone(value);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Kenyan mobile number, e.g. 0712 345 678.' });
      return z.NEVER;
    }
    return e164;
  });

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const check = validateSlug(value);
    if (!check.ok) ctx.addIssue({ code: 'custom', message: check.message });
  });

/** Whole shillings, never negative. */
export const shillings = (label: string, max = 10_000_000) =>
  z
    .number({ error: `${label} must be a number.` })
    .int({ error: `${label} must be whole shillings.` })
    .min(0, { error: `${label} can't be negative.` })
    .max(max, { error: `${label} is too large.` });

/** A social handle without the leading @ (TikTok and Instagram allow letters, digits, . and _). */
export const socialHandle = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, ''))
  .pipe(
    z
      .string()
      .max(30, { error: 'A handle can be at most 30 characters.' })
      .regex(/^[A-Za-z0-9._]*$/, { error: 'Use only letters, numbers, dots and underscores.' }),
  )
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const uuid = (label: string) => z.uuid({ error: `${label} is not valid.` });

/** Storage keys come from our own presign flow; only safe path characters. */
export const objectKey = z
  .string()
  .max(300)
  .regex(/^[a-z]+\/[0-9a-f-]{36}\/[A-Za-z0-9._\-/]+$/, {
    error: 'This photo upload is not valid.',
  })
  .refine((key) => !key.includes('..') && !key.includes('//'), {
    error: 'This photo upload is not valid.',
  });
