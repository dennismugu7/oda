import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { MAX_PUSH_TOKENS, type PushData, type PushType, type SideEffect } from '@oda/shared';
import type { UserCtx } from './authz';
import { serverEnv } from './env';
import { notificationText } from './notifications';

// Push to the seller's phones (M6 CP4, spec §5.8, decision #65): the same text as the in-app
// notification row, sent through Expo's push API after the response. Tapping one opens the
// order (data.orderId). Tokens Expo reports as DeviceNotRegistered are removed. Logs carry the
// type and a device count only: never a token, a buyer's name or an order's details.

const t = schema;
type OrderRow = typeof t.orders.$inferSelect;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

type Sender = (messages: PushMessage[]) => Promise<PushTicket[]>;

const sentInTests: PushMessage[] = [];
let testSender: Sender | null = null;

/** Vitest only: what would have been pushed, and a fake Expo answer. */
export const testPush = {
  sent: (): readonly PushMessage[] => sentInTests,
  answerWith: (sender: Sender | null) => {
    testSender = sender;
  },
  clear: () => {
    sentInTests.length = 0;
    testSender = null;
  },
};

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
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
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
    let failed = 0;
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error') {
        failed++;
        if (ticket.details?.error === 'DeviceNotRegistered') gone.add(messages[i]!.to);
      }
    });
    if (gone.size) await removeTokens(db, owner.profileId, [...gone]);
    console.info(
      `[push] ${types.join(',')} → ${messages.length - failed} sent, ${failed} failed${gone.size ? `, ${gone.size} removed` : ''}`,
    );
  } catch (error) {
    console.error('[push] failed', error instanceof Error ? error.name : 'unknown');
  }
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
