import { z } from 'zod';
import type { OrderSource } from './orderMachine';

// The buyer storefront (M4, spec §6): query parameters, product badges and the once-a-day
// visit count (decision #59). Pure, so it is unit-tested; the web app uses it on the server.

/** The `?s=` tags a shared link can carry (spec §4); anything else counts as `direct`. */
export const VISIT_SOURCES = ['wa', 'status', 'tt', 'ig', 'fb', 'qr', 'other'] as const;

export function visitSource(raw: string | null | undefined): OrderSource {
  const value = (raw ?? '').trim().toLowerCase();
  return (VISIT_SOURCES as readonly string[]).includes(value) ? (value as OrderSource) : 'direct';
}

export const STORE_SORTS = ['popular', 'newest', 'price_asc', 'price_desc'] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

/** Shop home / search query string; unknown or bad values are dropped, never an error. */
export const storeQuery = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  c: z.uuid().optional().catch(undefined),
  size: z.string().trim().min(1).max(20).optional().catch(undefined),
  max: z.coerce.number().int().min(1).max(10_000_000).optional().catch(undefined),
  sort: z.enum(STORE_SORTS).optional().catch(undefined),
});
export type StoreQuery = z.infer<typeof storeQuery>;

/** The cart asks for the current price and status of the products it holds. */
export const cartLookupInput = z.strictObject({
  productIds: z
    .array(z.uuid({ error: 'Unknown product.' }))
    .max(50, { error: 'Too many products.' })
    .transform((ids) => [...new Set(ids)]),
});

export const NEW_FOR_DAYS = 14;
export const BESTSELLER_COUNT = 3;
export const BESTSELLER_MIN_SOLD = 3;

export type ProductBadge = 'bestseller' | 'new' | 'sold_out';

/**
 * One badge per card (spec §6.1): Sold out wins, then Bestseller (the shop's top 3 by units
 * sold, with at least 3 sold), then New (created in the last 14 days). No stock counts.
 */
export function productBadges(
  products: readonly { id: string; status: string; unitsSold: number; createdAt: Date }[],
  now: Date,
): Map<string, ProductBadge | null> {
  const best = new Set(
    [...products]
      .filter((p) => p.unitsSold >= BESTSELLER_MIN_SOLD)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, BESTSELLER_COUNT)
      .map((p) => p.id),
  );
  const newSince = now.getTime() - NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
  return new Map(
    products.map((p) => [
      p.id,
      p.status === 'sold_out'
        ? 'sold_out'
        : best.has(p.id)
          ? 'bestseller'
          : p.createdAt.getTime() >= newSince
            ? 'new'
            : null,
    ]),
  );
}

/** The calendar day in Nairobi (spec §3), as YYYY-MM-DD. */
export function nairobiDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export const VISIT_COOKIE = 'oda_v';
const MAX_SHOPS_PER_DAY = 40;

/**
 * The `oda_v` cookie (decision #59): today's Nairobi date and the shops already counted
 * today (first 8 characters of each id). No personal data. A visit counts once per shop per
 * day; a new day starts a fresh list.
 */
export function visitCookie(
  current: string | undefined,
  shopId: string,
  day: string,
): { count: boolean; value: string } {
  const short = shopId.replace(/-/g, '').slice(0, 8);
  const [cookieDay, list = ''] = (current ?? '').split('.', 2);
  const seen = cookieDay === day ? list.split('-').filter((s) => /^[0-9a-f]{8}$/.test(s)) : [];
  if (seen.includes(short)) return { count: false, value: `${day}.${seen.join('-')}` };
  const next = [...seen, short].slice(-MAX_SHOPS_PER_DAY);
  return { count: true, value: `${day}.${next.join('-')}` };
}
