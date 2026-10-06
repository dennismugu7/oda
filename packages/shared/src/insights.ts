import { z } from 'zod';
import type { OrderSource } from './orderMachine';

// Insights and customers (M8b, design 20b-insights, 20b-customers; spec §5.6). Periods are
// Nairobi calendar periods (UTC+3 all year, no daylight saving): today, this week (Monday
// first) and this month, each compared with the same stretch of the previous period. A sale
// is a confirmed, sent or delivered order, dated by confirmed_at (order-lifecycle.md).

export const INSIGHT_PERIODS = ['today', 'week', 'month'] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

export const insightsQuery = z.object({
  period: z
    .enum(INSIGHT_PERIODS, { error: 'Pick today, this week or this month.' })
    .default('week'),
});

const OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A Nairobi wall-clock moment back to a real instant. */
const fromWall = (wall: number) => new Date(wall - OFFSET_MS);

export interface PeriodWindow {
  period: InsightPeriod;
  /** Start of this period (Nairobi midnight / Monday / 1st). */
  start: Date;
  /** The same stretch of the previous period: [prevStart, prevEnd). */
  prevStart: Date;
  prevEnd: Date;
  /** Bars: hours of today, days of the week, days of the month. */
  bars: number;
  labels: string[];
  /** The bar we're in now ("Today" / this hour). */
  current: number;
  /** Nairobi dates (YYYY-MM-DD) from the first day of the period to today, for visits. */
  firstDay: string;
  today: string;
}

const isoDay = (wall: number) => new Date(wall).toISOString().slice(0, 10);

/** This period's window and bars at `now`, in Nairobi time. */
export function periodWindow(period: InsightPeriod, now: Date = new Date()): PeriodWindow {
  const wall = now.getTime() + OFFSET_MS;
  const midnight = Math.floor(wall / DAY) * DAY;
  const today = isoDay(midnight);
  if (period === 'today') {
    const hour = Math.floor((wall - midnight) / HOUR);
    return {
      period,
      start: fromWall(midnight),
      prevStart: fromWall(midnight - DAY),
      prevEnd: new Date(now.getTime() - DAY),
      bars: 24,
      labels: Array.from({ length: 24 }, (_, h) =>
        h === hour
          ? 'Now'
          : h % 6 === 0
            ? h === 0
              ? '12am'
              : h === 12
                ? '12pm'
                : h < 12
                  ? `${h}am`
                  : `${h - 12}pm`
            : '',
      ),
      current: hour,
      firstDay: today,
      today,
    };
  }
  if (period === 'week') {
    const weekday = (new Date(midnight).getUTCDay() + 6) % 7; // Monday = 0
    const monday = midnight - weekday * DAY;
    return {
      period,
      start: fromWall(monday),
      prevStart: fromWall(monday - 7 * DAY),
      prevEnd: new Date(now.getTime() - 7 * DAY),
      bars: 7,
      labels: WEEKDAYS.map((l, i) => (i === weekday ? 'Today' : l)),
      current: weekday,
      firstDay: isoDay(monday),
      today,
    };
  }
  const d = new Date(midnight);
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const prevFirst = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  // The same stretch of last month: as far into it as we are into this one, never past its end.
  const elapsed = wall - first;
  const prevEndWall = Math.min(prevFirst + elapsed, first);
  const dayOfMonth = d.getUTCDate() - 1;
  return {
    period,
    start: fromWall(first),
    prevStart: fromWall(prevFirst),
    prevEnd: fromWall(prevEndWall),
    bars: days,
    labels: Array.from({ length: days }, (_, i) =>
      i === dayOfMonth ? 'Today' : i === 0 || (i + 1) % 7 === 1 ? String(i + 1) : '',
    ),
    current: dayOfMonth,
    firstDay: isoDay(first),
    today,
  };
}

/** Which bar a sale at `at` belongs to (null when outside the period). */
export function barOf(window: PeriodWindow, at: Date): number | null {
  const offset = at.getTime() - window.start.getTime();
  if (offset < 0) return null;
  const index = Math.floor(offset / (window.period === 'today' ? HOUR : DAY));
  return index < window.bars ? index : null;
}

const VS: Record<InsightPeriod, string> = {
  today: 'yesterday',
  week: 'last week',
  month: 'last month',
};

/** "+22% vs last week"; null when there's nothing to compare with. */
export function periodChange(
  current: number,
  previous: number,
  period: InsightPeriod,
): { text: string; up: boolean } | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs ${VS[period]}`, up: pct >= 0 };
}

/** Every order source by name (Insights "Where orders come from"). */
export const SOURCE_LABELS: Record<OrderSource, string> = {
  wa: 'WhatsApp',
  status: 'WhatsApp Status',
  tt: 'TikTok',
  ig: 'Instagram',
  fb: 'Facebook',
  qr: 'QR code',
  other: 'Other links',
  direct: 'Direct',
  manual: 'Added by you',
};

// Customers --------------------------------------------------------------------------------

export const CUSTOMER_FILTERS = ['all', 'repeat', 'new'] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

export const customersQuery = z.object({
  filter: z.enum(CUSTOMER_FILTERS, { error: 'Pick all, repeat or new.' }).default('all'),
  q: z.string().trim().max(60).optional(),
  cursor: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** A repeat customer has at least two sales (spec §5.6). */
export const REPEAT_MIN_ORDERS = 2;
