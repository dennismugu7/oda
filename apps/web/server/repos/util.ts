import 'server-only';
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
