import { z } from 'zod';
import { stripLinks } from './checkout';
import { objectKey } from './schemas/fields';

// Reviews and ratings (M7, docs/m7-plan.md, decision #73). One review per delivered,
// buyer-placed order: overall stars (required), up to four tags, and per item optional stars,
// text and one photo. Text is cleaned on the server; the shown name is made from the order.

export const REVIEW_TAGS = [
  'As described',
  'Well packed',
  'Fast delivery',
  'Friendly seller',
] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];

/** The label under the big stars (5d), index = rating − 1. */
export const RATING_LABELS = ['Not great', 'Could be better', 'Okay', 'Good', 'Loved it!'] as const;

export const REVIEW_TEXT_MAX = 500;
export const REVIEW_REPLY_MAX = 500;
export const REVIEW_REPORT_REASON_MAX = 300;
/** A review can be edited for 7 days after it was written. */
export const REVIEW_EDIT_DAYS = 7;
/** Overall ratings the "Low ratings" tab shows (decision #73 f). */
export const LOW_RATING_MAX = 3;

export const REVIEW_LIMITS = {
  writesPerOrder: { window: 86_400, max: 10 },
  uploadsPerOrder: { window: 3600, max: 20 },
  reportsPerShop: { window: 86_400, max: 10 },
} as const;

/**
 * Removes phone numbers: 9 or more digits, with or without spaces, dots, dashes, brackets or
 * a leading + (0712 345 678, +254-712-345-678, 254712345678). Prices like "KSh 2,500" stay.
 */
export function stripPhones(text: string): string {
  return text
    .replace(/\+?\(?\d(?:[\s.()-]*\d){8,}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Review text as it's stored and shown: no links, no phone numbers (decision #73 b). */
export function cleanReviewText(text: string): string {
  return stripPhones(stripLinks(text));
}

/**
 * The public name on a review, from the order's buyer name: first name + last initial
 * ("Wanjiku Mwangi" → "Wanjiku M."), one name as is. Never sent by the browser.
 */
export function reviewDisplayName(buyerName: string): string {
  const words = cleanReviewText(buyerName)
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  const first = words[0];
  if (!first) return 'Buyer';
  const cap = (w: string) => w.charAt(0).toLocaleUpperCase('en-KE') + w.slice(1);
  const name = cap(first).slice(0, 30);
  const last = words.length > 1 ? words[words.length - 1]! : null;
  const initial = last?.match(/\p{L}/u)?.[0];
  return initial ? `${name} ${initial.toLocaleUpperCase('en-KE')}.` : name;
}

/** "★★★★☆" */
export function starText(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** Only delivered, buyer-placed orders can be reviewed (decision #73 i–j). */
export function canReviewOrder(order: { status: string; source: string }): boolean {
  return order.status === 'delivered' && order.source !== 'manual';
}

const stars = (label: string) =>
  z
    .number({ error: `Choose ${label}.` })
    .int({ error: `Choose ${label}.` })
    .min(1, { error: `Choose ${label}.` })
    .max(5, { error: `Choose ${label}.` });

const reviewText = z
  .string()
  .max(REVIEW_TEXT_MAX * 2, { error: `At most ${REVIEW_TEXT_MAX} characters.` })
  .nullish()
  .transform((v) => (v ? cleanReviewText(v) : ''))
  .pipe(z.string().max(REVIEW_TEXT_MAX, { error: `At most ${REVIEW_TEXT_MAX} characters.` }))
  .transform((v) => v || null);

export const reviewItemInput = z.strictObject({
  orderItemId: z.uuid({ error: 'Unknown item.' }),
  rating: stars('stars for this item')
    .nullish()
    .transform((v) => v ?? null),
  text: reviewText,
  photoKey: objectKey.nullish().transform((v) => v ?? null),
});

/** POST / PUT /api/o/:token/review. */
export const reviewInput = z.strictObject({
  rating: stars('how many stars'),
  tags: z
    .array(z.enum(REVIEW_TAGS, { error: 'Unknown tag.' }))
    .max(REVIEW_TAGS.length)
    .default([])
    .transform((tags) => REVIEW_TAGS.filter((t) => tags.includes(t))),
  items: z.array(reviewItemInput).max(50, { error: 'Too many items.' }).default([]),
});
export type ReviewInput = z.input<typeof reviewInput>;

/** POST /api/o/:token/uploads: one review photo, already resized in the browser. */
export const reviewUploadInput = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    error: 'Use a JPEG, PNG or WebP photo.',
  }),
  size: z
    .number()
    .int()
    .min(1, { error: 'This photo is empty.' })
    .max(5 * 1024 * 1024, { error: 'This photo is too big (5 MB at most).' }),
});

export const REVIEW_TABS = ['all', 'needs_reply', 'low'] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];

/** GET /api/reviews?tab=…&cursor=… */
export const reviewsQuery = z.strictObject({
  tab: z.enum(REVIEW_TABS, { error: 'Unknown tab.' }).default('all'),
  cursor: z
    .string()
    .max(80)
    .regex(/^\d{13}_[0-9a-f-]{36}$/, { error: 'This page link is not valid.' })
    .optional(),
});

/** PUT /api/reviews/:id/reply — an empty reply removes it. */
export const reviewReplyInput = z.strictObject({
  reply: z
    .string()
    .max(REVIEW_REPLY_MAX * 2)
    .transform((v) => cleanReviewText(v))
    .pipe(z.string().max(REVIEW_REPLY_MAX, { error: `At most ${REVIEW_REPLY_MAX} characters.` }))
    .transform((v) => v || null),
});

/** POST /api/reviews/:id/report */
export const reviewReportInput = z.strictObject({
  reason: z
    .string()
    .trim()
    .max(REVIEW_REPORT_REASON_MAX, { error: `At most ${REVIEW_REPORT_REASON_MAX} characters.` })
    .nullish()
    .transform((v) => v || null),
});

/**
 * POST /api/ops/reviews/remove (the review-remove workflow): the review by its id, or by the
 * shop's link name and the order number (what the seller and the support digest show).
 */
export const reviewRemoveInput = z
  .strictObject({
    reviewId: z.uuid({ error: 'Not a review id.' }).optional(),
    shopSlug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Not a shop link name.' })
      .optional(),
    orderNumber: z.number().int().min(1).max(9_999_999).optional(),
    reason: z.string().trim().min(3, { error: 'Give a reason.' }).max(500),
    actor: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{1,39}$/, { error: 'Not a GitHub user name.' }),
  })
  .refine((v) => !!v.reviewId !== !!(v.shopSlug && v.orderNumber), {
    error: 'Give the review id, or the shop link name and order number.',
  });
