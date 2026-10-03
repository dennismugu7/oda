import 'server-only';
import { sql } from 'drizzle-orm';
import type { Db } from '@oda/db';

// Fixed-window counters in Postgres (rate_limits + rate_limit_hit(), decision #34 i). Shared
// by every server instance, unlike an in-memory limiter on Vercel.

export interface Limit {
  /** Window length in seconds. */
  window: number;
  /** Hits allowed per window. */
  max: number;
}

/** Counts one hit; true while the key is within the limit for the current window. */
export async function hitLimit(db: Db, key: string, limit: Limit): Promise<boolean> {
  const result = await db.execute<{ ok: boolean }>(
    sql`select rate_limit_hit(${key}, ${limit.window}, ${limit.max}) as ok`,
  );
  return result.rows[0]!.ok;
}

/** True when the key already used up the current window (doesn't count a hit). */
export async function isLimited(db: Db, key: string, limit: Limit): Promise<boolean> {
  const result = await db.execute<{ count: number }>(sql`
    select count from rate_limits
    where key = ${key}
      and window_start = to_timestamp(floor(extract(epoch from now()) / ${limit.window}) * ${limit.window})`);
  return (result.rows[0]?.count ?? 0) >= limit.max;
}

/** Seconds until the current window ends (for "try again in …" messages). */
export function secondsLeftInWindow(limit: Limit, now: Date = new Date()): number {
  const seconds = now.getTime() / 1000;
  return Math.ceil(limit.window - (seconds % limit.window));
}

/** The client's IP. Vercel sets x-forwarded-for itself (first entry = the client). */
export function clientIp(headers: Headers | undefined | null): string {
  const forwarded = headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers?.get('x-real-ip') || 'unknown';
}
