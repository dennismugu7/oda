import 'server-only';
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { NotFoundError } from '../errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids come from URLs: anything that isn't a uuid is simply not found. */
export function checkId(id: string, what: string): string {
  if (!UUID.test(id)) throw new NotFoundError(`We couldn't find this ${what}.`);
  return id;
}

export function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new NotFoundError(`We couldn't find this ${what}.`);
  return row;
}

/**
 * A timestamp truncated to milliseconds, in UTC (M10 CP3, decision #84): what list cursors
 * carry (JavaScript dates have milliseconds, Postgres microseconds). Written exactly like the
 * expression indexes `orders_shop_placed_ms_idx` / `reviews_shop_created_ms_idx`, so pages
 * read the index instead of sorting every row of the shop (`at time zone 'UTC'` makes the
 * expression immutable, which an index needs).
 */
export const msUtc = (column: AnyColumn) =>
  sql<Date>`date_trunc('milliseconds', ${column} at time zone 'UTC')`;

/**
 * Rows after a `<ms>_<id>` cursor in a (msUtc(time) desc, id desc) list. One row comparison,
 * so Postgres seeks the index instead of filtering (an OR of the two cases can't).
 */
export function beforeCursor(time: AnyColumn, idColumn: AnyColumn, cursor: string): SQL {
  const [ms, id] = cursor.split('_') as [string, string | undefined];
  const n = Number(ms);
  const at = new Date(Number.isFinite(n) ? n : 0).toISOString();
  return sql`(${msUtc(time)}, ${idColumn}) < ((${at}::timestamptz at time zone 'UTC'), ${checkId(id ?? '', 'page')}::uuid)`;
}
