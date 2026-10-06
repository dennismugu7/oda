import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { z } from 'zod';
import { authBaseUrl } from './auth';
import { requireUser } from './authz';
import type { Defer } from './checkout';
import { assertSameOrigin } from './checkout';
import { getDb } from './db';
import { deleteAccountLinkEmail } from './email/templates';
import { sendEmail } from './email/transport';
import { ConflictError, parseInput, toResponse, TooManyRequestsError } from './errors';
import { clientIp, hitLimit, secondsLeftInWindow, type Limit } from './rateLimit';

// Account deletion (spec §5.6, decisions #72 c, #75): in the app (type "DELETE") or on the web
// (/delete-account → an emailed confirm link → confirm). Both do the same thing at once: the
// shop gets deleted_at (its page 404s, open order links say "This shop has closed"), the
// profile gets deleted_at, every session is removed and push tokens are dropped. The purge job
// removes the data, photos and auth user 30 days later. Each deletion leaves an ops_events row.

const t = schema;

export const DELETE_LINK_TTL_SECONDS = 3600;
export const DELETION_LIMITS = {
  requestsPerIp: { window: 3600, max: 10 },
  // Silent per-email cap: the page answers the same either way.
  mailsPerEmail: { window: 3600, max: 3 },
  checksPerIp: { window: 3600, max: 60 },
} satisfies Record<string, Limit>;

export type DeletionVia = 'app' | 'web';

/**
 * Soft-deletes the user's account and shop and signs them out everywhere. Idempotent: an
 * already deleted account stays as it is. Returns the shop's slug, if it had one.
 */
export async function deleteAccount(db: Db, userId: string, via: DeletionVia) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [profile] = await tx
      .update(t.profiles)
      .set({ deletedAt: now, expoPushTokens: [] })
      .where(and(eq(t.profiles.id, userId), isNull(t.profiles.deletedAt)))
      .returning({ id: t.profiles.id });
    const [shop] = await tx
      .update(t.shops)
      .set({ deletedAt: now })
      .where(and(eq(t.shops.ownerId, userId), isNull(t.shops.deletedAt)))
      .returning({ id: t.shops.id, slug: t.shops.slug, name: t.shops.name });
    await tx.delete(t.authSession).where(eq(t.authSession.userId, userId));
    if (profile || shop) {
      await tx.insert(t.opsEvents).values({
        action: 'account_deleted',
        shopId: shop?.id ?? null,
        targetId: userId,
        reason: via === 'app' ? 'Deleted in the app' : 'Deleted from the emailed web link',
        actor: 'seller',
        details: { via, slug: shop?.slug ?? null, name: shop?.name ?? null },
      });
    }
    return { slug: shop?.slug ?? null };
  });
}

// In the app -------------------------------------------------------------------------------

const appConfirm = z.strictObject({
  confirm: z.literal('DELETE', { error: 'Type DELETE in capital letters to confirm.' }),
});

/** POST /api/me/delete: the in-app confirm (type "DELETE"). The app then signs out. */
export async function postDeleteMe(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const ctx = await requireUser(request, db);
    parseInput(appConfirm, await request.json().catch(() => null));
    await deleteAccount(db, ctx.userId, 'app');
    console.info('[account] deleted in the app');
    return new Response(null, { status: 204 });
  } catch (error) {
    return toResponse(error);
  }
}

// On the web -------------------------------------------------------------------------------

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The link in the email: the token in the fragment, never in a logged URL (decision #45). */
export function deleteConfirmUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/delete-account/confirm#token=${encodeURIComponent(token)}`;
}

async function limitOrThrow(db: Db, key: string, limit: Limit) {
  if (!(await hitLimit(db, key, limit))) {
    throw new TooManyRequestsError(
      'Too many tries. Try again in a few minutes.',
      secondsLeftInWindow(limit),
    );
  }
}

const requestBody = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter the email you sign in with, like you@example.com.' })),
});

/** The live account (not deleted) for an email, with its shop's slug. */
async function liveAccount(db: Db, email: string) {
  const [row] = await db
    .select({ userId: t.authUser.id, slug: t.shops.slug, shopName: t.shops.name })
    .from(t.authUser)
    .innerJoin(t.profiles, eq(t.profiles.id, t.authUser.id))
    .leftJoin(t.shops, and(eq(t.shops.ownerId, t.authUser.id), isNull(t.shops.deletedAt)))
    .where(and(sql`lower(${t.authUser.email}) = ${email}`, isNull(t.profiles.deletedAt)));
  return row;
}

/**
 * Sends the confirm link when the email has a live account. The answer never depends on it:
 * the lookup and the email happen after the response (`defer`), so timing doesn't tell either.
 */
export async function requestDeletion(db: Db, email: string, defer: Defer) {
  defer(async () => {
    try {
      await sendDeletionLink(db, email);
    } catch (error) {
      // Logged by name only (decision #45): no email address, no link.
      console.warn(`[account] deletion link not sent: ${(error as Error).name}`);
    }
  });
}

async function sendDeletionLink(db: Db, email: string) {
  if (!(await hitLimit(db, `delete-mails:${email}`, DELETION_LIMITS.mailsPerEmail))) return;
  const account = await liveAccount(db, email);
  if (!account) return;
  const token = randomBytes(32).toString('base64url');
  await db.insert(t.deletionRequests).values({
    email,
    shopSlug: account.slug,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + DELETE_LINK_TTL_SECONDS * 1000),
  });
  await sendEmail(deleteAccountLinkEmail(email, deleteConfirmUrl(authBaseUrl(), token)));
}

export type LinkStatus =
  | { status: 'valid'; shopName: string | null; email: string }
  | { status: 'used' }
  | { status: 'invalid' };

async function findLink(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return undefined;
  const [row] = await db
    .select()
    .from(t.deletionRequests)
    .where(eq(t.deletionRequests.tokenHash, hashToken(token)));
  return row;
}

/** What the confirm page shows before the button: valid, already used, or expired/unknown. */
export async function linkStatus(db: Db, token: string, now = new Date()): Promise<LinkStatus> {
  const row = await findLink(db, token);
  if (!row) return { status: 'invalid' };
  if (row.confirmedAt) return { status: 'used' };
  if (!row.expiresAt || row.expiresAt <= now) return { status: 'invalid' };
  const account = await liveAccount(db, row.email);
  // Deleted meanwhile (e.g. in the app): nothing left to confirm.
  if (!account) return { status: 'used' };
  return { status: 'valid', shopName: account.shopName, email: row.email };
}

/** Confirms a web deletion once: the same deletion as in the app. */
export async function confirmDeletion(db: Db, token: string, now = new Date()) {
  const row = await findLink(db, token);
  if (!row || !row.expiresAt) throw new ConflictError('This link has expired.', 'link_invalid');
  // Single use, even with two taps at once: only one request can set confirmed_at.
  const [claimed] = await db
    .update(t.deletionRequests)
    .set({ confirmedAt: now, processedAt: now, status: 'closed' })
    .where(
      and(
        eq(t.deletionRequests.id, row.id),
        isNull(t.deletionRequests.confirmedAt),
        sql`${t.deletionRequests.expiresAt} > ${now}`,
      ),
    )
    .returning({ id: t.deletionRequests.id });
  if (!claimed) {
    throw row.confirmedAt
      ? new ConflictError('This link was already used. Your account is deleted.', 'link_used')
      : new ConflictError('This link has expired.', 'link_invalid');
  }
  const account = await liveAccount(db, row.email);
  if (account) await deleteAccount(db, account.userId, 'web');
}

const tokenBody = z.object({ token: z.string().max(200) });

/** POST /api/delete-account: the web form (same answer whether or not the email has an account). */
export async function postDeletionRequest(request: Request, defer: Defer): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    await limitOrThrow(
      db,
      `delete-req-ip:${clientIp(request.headers)}`,
      DELETION_LIMITS.requestsPerIp,
    );
    const { email } = parseInput(requestBody, await request.json().catch(() => null));
    await requestDeletion(db, email, defer);
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}

/** POST /api/delete-account/check: the confirm page asks before showing the button. */
export async function postDeletionCheck(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    await limitOrThrow(
      db,
      `delete-check-ip:${clientIp(request.headers)}`,
      DELETION_LIMITS.checksPerIp,
    );
    const parsed = tokenBody.safeParse(await request.json().catch(() => null));
    const result = parsed.success ? await linkStatus(db, parsed.data.token) : { status: 'invalid' };
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}

/** POST /api/delete-account/confirm: the one button on the confirm page. */
export async function postDeletionConfirm(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    await limitOrThrow(
      db,
      `delete-check-ip:${clientIp(request.headers)}`,
      DELETION_LIMITS.checksPerIp,
    );
    const { token } = parseInput(tokenBody, await request.json().catch(() => null));
    await confirmDeletion(db, token);
    console.info('[account] deleted from the web link');
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
