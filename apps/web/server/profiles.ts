import 'server-only';
import { schema, type Db } from '@oda/db';

/**
 * Creates the user's profiles row if it's missing. Idempotent and safe under concurrent
 * requests. Called by Better Auth's user-create hook and again by requireUser/requireSeller,
 * so a failed hook is repaired on first use.
 */
export async function ensureProfile(db: Db, userId: string): Promise<void> {
  await db.insert(schema.profiles).values({ id: userId }).onConflictDoNothing({
    target: schema.profiles.id,
  });
}
