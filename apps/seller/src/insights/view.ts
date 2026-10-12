// Pure display helpers for More (20-more), Insights (20b-insights) and Customers
// (20b-customers), unit-tested. Day words use Nairobi time (UTC+3 all year).
import { formatKePhone, formatKsh } from '@oda/shared';
import { accountShort } from '@/settings/form';
import type { MoreData } from './api';

/** The muted values on More's rows. */
export function moreRowValues(more: MoreData) {
  const rating =
    more.rating.count && more.rating.avg !== null
      ? `${more.rating.avg.toFixed(1)} ★ · ${more.rating.count}`
      : 'From buyers';
  const payments = more.activeAccount
    ? accountShort(more.activeAccount)
    : more.acceptsPayOnDelivery
      ? 'Pay on delivery'
      : 'Add M-Pesa';
  const delivery =
    more.deliveryAreas > 0
      ? `${more.deliveryAreas} ${more.deliveryAreas === 1 ? 'area' : 'areas'}`
      : more.pickupEnabled
        ? 'Pickup'
        : 'Arranged with buyers';
  return {
    insights: `${formatKsh(more.salesThisWeek)} this week`,
    customers: String(more.customers),
    reviews: rating,
    payments,
    delivery,
    categories: String(more.categories),
  };
}

/** Bar heights as fractions of the tallest (0 when there were no sales). */
export function barFractions(bars: readonly number[]): number[] {
  const max = Math.max(0, ...bars);
  return bars.map((b) => (max > 0 ? b / max : 0));
}

/** "12" / "1.2k": Insights stat cards stay one line. */
export function compactNumber(n: number): string {
  if (n < 10_000) return n.toLocaleString('en-KE');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function ordersWord(n: number): string {
  return `${n} ${n === 1 ? 'order' : 'orders'}`;
}

const OFFSET_MS = 3 * 60 * 60 * 1000;
const dayNumber = (at: Date) => Math.floor((at.getTime() + OFFSET_MS) / 86_400_000);

/** "today", "yesterday", "3 days ago", "2 weeks ago", "4 months ago". */
export function daysAgoWord(iso: string, now: Date = new Date()): string {
  const days = dayNumber(now) - dayNumber(new Date(iso));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** "3 orders · today" under a customer's name. */
export function customerLine(c: { orderCount: number; lastOrderAt: string }, now?: Date): string {
  return `${ordersWord(c.orderCount)} · ${daysAgoWord(c.lastOrderAt, now)}`;
}

/** "0712 345 678" for a customer row's accessibility label. */
export const phoneLabel = (e164: string) => formatKePhone(e164);

const TINTS = [
  { bg: '#FBE3DA', fg: '#C2410C' },
  { bg: '#E3ECFB', fg: '#2B5BB5' },
  { bg: '#EFE6FB', fg: '#7A3DC4' },
  { bg: '#E2F1E8', fg: '#1E7A4C' },
  { bg: '#F4EBD9', fg: '#8A6418' },
  { bg: '#FBF0D2', fg: '#9A6A00' },
  { bg: '#ECECF1', fg: '#4A4A5A' },
];

/** A customer's avatar colours, the same every time for the same phone. */
export function avatarTint(key: string) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}
