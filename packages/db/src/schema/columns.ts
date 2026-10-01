import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

// Shared column helpers (docs/data-model.md conventions).
export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
export const tstz = (name: string) => timestamp(name, { withTimezone: true });
export const createdAt = () => tstz('created_at').notNull().defaultNow();
/** Kept current by the set_updated_at trigger (migration 0002). */
export const updatedAt = () => tstz('updated_at').notNull().defaultNow();
