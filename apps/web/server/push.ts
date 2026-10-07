import 'server-only';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { MAX_PUSH_TOKENS, type PushData, type PushType, type SideEffect } from '@oda/shared';
import type { UserCtx } from './authz';
import { serverEnv } from './env';
import { notificationText } from './notifications';

// Push to the seller's phones (M6 CP4, spec §5.8, decision #65): the same text as the in-app
// notification row, sent through Expo's push API after the response. Tapping one opens the
// order (data.orderId). Tokens Expo reports as DeviceNotRegistered are removed, from the send
// answer (tickets) and later from the delivery receipts the hourly job checks (decision #85).
// Logs carry the type and counts only: never a token, a buyer's name or an order's details.

const t = schema;
type OrderRow = typeof t.orders.$inferSelect;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: PushData;
  sound: 'default';
  priority: 'high';
  channelId: 'orders';
}

export type PushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type PushReceipt =
  { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

type Sender = (messages: PushMessage[]) => Promise<PushTicket[]>;
type ReceiptReader = (ids: string[]) => Promise<Record<string, PushReceipt>>;

const sentInTests: PushMessage[] = [];
let testSender: Sender | null = null;
let testReceipts: ReceiptReader | null = null;

/** Vitest only: what would have been pushed, and fake Expo answers. */
export const testPush = {
  sent: (): readonly PushMessage[] => sentInTests,
  answerWith: (sender: Sender | null) => {
    testSender = sender;
  },
  receiptsWith: (reader: ReceiptReader | null) => {
    testReceipts = reader;
  },
  clear: () => {
    sentInTests.length = 0;
    testSender = null;
    testReceipts = null;
  },
};

function expoHeaders(token: string) {
  return {
    accept: 'application/json',
    'accept-encoding': 'gzip, deflate',
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };
}

async function send(messages: PushMessage[]): Promise<PushTicket[] | null> {
  if (process.env.VITEST) {
    sentInTests.push(...messages);
    return testSender ? testSender(messages) : messages.map(() => ({ status: 'ok', id: 'test' }));
  }
  const token = serverEnv().EXPO_ACCESS_TOKEN;
  if (!token) {
    // Enhanced push security is on (decision #65 a): without the token Expo refuses anyway.
    console.info(`[push] skipped ${messages.length} (EXPO_ACCESS_TOKEN not set)`);
    return null;
  }
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: expoHeaders(token),
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error(`[push] Expo answered ${res.status}`);
    return null;
  }
  const json = (await res.json().catch(() => null)) as { data?: PushTicket[] } | null;
  return json?.data ?? null;
}

/** The phones of the shop's owner. */
async function ownerTokens(db: Db, shopId: string) {
  const [row] = await db
    .select({ profileId: t.profiles.id, tokens: t.profiles.expoPushTokens })
    .from(t.shops)
    .innerJoin(t.profiles, eq(t.profiles.id, t.shops.ownerId))
    .where(eq(t.shops.id, shopId));
  return row ?? null;
}

/** One push to the seller's phones: the same title and body as the notification row. */
export interface SellerPush {
  type: PushType | 'new_review';
  title: string;
  body: string;
  data: PushData;
}

/**
 * Sends a push for each `push` side effect to the seller's phones. Never throws: a push
 * problem must not undo or fail an order change.
 */
export async function sendOrderPushes(
  db: Db,
  order: OrderRow,
  sideEffects: readonly SideEffect[],
): Promise<void> {
  const types = sideEffects.flatMap((e) => (e.kind === 'push' ? [e.type] : [])) as PushType[];
  await sendSellerPushes(
    db,
    order.shopId,
    types.map((type) => ({
      type,
      ...notificationText(order, type),
      data: { type, orderId: order.id },
    })),
  );
}

/** Sends pushes to the shop owner's phones. Never throws; logs type and counts only. */
export async function sendSellerPushes(
  db: Db,
  shopId: string,
  pushes: readonly SellerPush[],
): Promise<void> {
  if (pushes.length === 0) return;
  const types = pushes.map((p) => p.type);
  try {
    const owner = await ownerTokens(db, shopId);
    if (!owner || owner.tokens.length === 0) {
      console.info(`[push] ${types.join(',')} → no devices`);
      return;
    }
    const messages: PushMessage[] = pushes.flatMap(({ title, body, data }) =>
      owner.tokens.map((to) => ({
        to,
        title,
        body,
        data,
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'orders' as const,
      })),
    );
    const tickets = await send(messages);
    if (!tickets) return;
    const gone = new Set<string>();
    const pending: { ticketId: string; profileId: string; token: string }[] = [];
    let failed = 0;
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error') {
        failed++;
        if (ticket.details?.error === 'DeviceNotRegistered') gone.add(messages[i]!.to);
      } else if (ticket.id) {
        pending.push({ ticketId: ticket.id, profileId: owner.profileId, token: messages[i]!.to });
      }
    });
    if (gone.size) await removeTokens(db, owner.profileId, [...gone]);
    // Whether each push arrived is checked later (checkPushReceipts, from the hourly job).
    if (pending.length) await db.insert(t.pushTickets).values(pending).onConflictDoNothing();
    console.info(
      `[push] ${types.join(',')} → ${messages.length - failed} sent, ${failed} failed${gone.size ? `, ${gone.size} removed` : ''}`,
    );
  } catch (error) {
    console.error('[push] failed', error instanceof Error ? error.name : 'unknown');
  }
}

/** Receipts are ready after a few minutes; Expo keeps them for about a day. */
export const RECEIPT_AFTER_MINUTES = 15;
export const RECEIPT_KEEP_HOURS = 24;
const RECEIPT_BATCH = 1000; // Expo's limit per getReceipts call

async function readReceipts(ids: string[]): Promise<Record<string, PushReceipt> | null> {
  if (process.env.VITEST) return testReceipts ? testReceipts(ids) : {};
  const token = serverEnv().EXPO_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(token),
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error(`[push] receipts: Expo answered ${res.status}`);
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    data?: Record<string, PushReceipt>;
  } | null;
  return json?.data ?? null;
}

/**
 * The hourly job's receipt check (decision #85): for tickets at least 15 minutes old, asks Expo
 * whether each push arrived; a DeviceNotRegistered receipt removes that phone's token from the
 * profile. Tickets with a receipt, and any older than a day, are deleted. Never throws.
 */
export async function checkPushReceipts(
  db: Db,
  now: Date = new Date(),
): Promise<{ checked: number; failed: number; removed: number; expired: number }> {
  const result = { checked: 0, failed: 0, removed: 0, expired: 0 };
  try {
    const stale = new Date(now.getTime() - RECEIPT_KEEP_HOURS * 3_600_000);
    const expired = await db
      .delete(t.pushTickets)
      .where(lt(t.pushTickets.createdAt, stale))
      .returning({ id: t.pushTickets.ticketId });
    result.expired = expired.length;

    const ready = new Date(now.getTime() - RECEIPT_AFTER_MINUTES * 60_000);
    const due = await db
      .select()
      .from(t.pushTickets)
      .where(lt(t.pushTickets.createdAt, ready))
      .orderBy(t.pushTickets.createdAt)
      .limit(RECEIPT_BATCH);
    if (due.length === 0) return result;
    const receipts = await readReceipts(due.map((d) => d.ticketId));
    if (!receipts) return result;

    const answered: string[] = [];
    const gone = new Map<string, Set<string>>();
    for (const ticket of due) {
      const receipt = receipts[ticket.ticketId];
      if (!receipt) continue; // not ready yet: the next hour
      answered.push(ticket.ticketId);
      if (receipt.status === 'error') {
        result.failed++;
        if (receipt.details?.error === 'DeviceNotRegistered') {
          const set = gone.get(ticket.profileId) ?? new Set<string>();
          set.add(ticket.token);
          gone.set(ticket.profileId, set);
        }
      }
    }
    result.checked = answered.length;
    for (const [profileId, tokens] of gone) {
      await removeTokens(db, profileId, [...tokens]);
      result.removed += tokens.size;
    }
    if (answered.length) {
      await db.delete(t.pushTickets).where(inArray(t.pushTickets.ticketId, answered));
    }
  } catch (error) {
    console.error('[push] receipts failed', error instanceof Error ? error.name : 'unknown');
  }
  return result;
}

async function removeTokens(db: Db, profileId: string, tokens: string[]) {
  let value = sql`${t.profiles.expoPushTokens}`;
  for (const token of tokens) value = sql`array_remove(${value}, ${token})`;
  await db.update(t.profiles).set({ expoPushTokens: value }).where(eq(t.profiles.id, profileId));
}

/**
 * Registers this phone's token for the signed-in user (on sign-in). A token belongs to one
 * account: it's taken off any other account first, so a phone that changes accounts stops
 * getting the old shop's pushes. At most MAX_PUSH_TOKENS phones; the oldest drops off.
 */
export async function registerPushToken(db: Db, ctx: UserCtx, token: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(t.profiles)
      .set({ expoPushTokens: sql`array_remove(${t.profiles.expoPushTokens}, ${token})` })
      .where(sql`${token} = any(${t.profiles.expoPushTokens})`);
    const [row] = await tx
      .select({ tokens: t.profiles.expoPushTokens })
      .from(t.profiles)
      .where(eq(t.profiles.id, ctx.userId))
      .for('update');
    const next = [...(row?.tokens ?? []), token].slice(-MAX_PUSH_TOKENS);
    await tx.update(t.profiles).set({ expoPushTokens: next }).where(eq(t.profiles.id, ctx.userId));
  });
}

/** Removes this phone's token (on sign-out): that phone gets no more pushes. */
export async function unregisterPushToken(db: Db, ctx: UserCtx, token: string): Promise<void> {
  await db
    .update(t.profiles)
    .set({ expoPushTokens: sql`array_remove(${t.profiles.expoPushTokens}, ${token})` })
    .where(and(eq(t.profiles.id, ctx.userId)));
}
