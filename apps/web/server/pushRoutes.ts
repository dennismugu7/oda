import 'server-only';
import { pushTokenInput } from '@oda/shared';
import { requireUser } from './authz';
import { getDb } from './db';
import { parseInput } from './errors';
import { registerPushToken, unregisterPushToken } from './push';
import { body, handle } from './routeHandler';

// The phone's Expo push token (decision #65 a): registered on sign-in, removed on sign-out.

/** POST /api/me/push-tokens — { token } */
export const postPushToken = handle(async (request) => {
  const db = getDb();
  const ctx = await requireUser(request, db);
  const { token } = parseInput(pushTokenInput, await body(request));
  await registerPushToken(db, ctx, token);
  return undefined;
});

/** DELETE /api/me/push-tokens — { token } */
export const deletePushToken = handle(async (request) => {
  const db = getDb();
  const ctx = await requireUser(request, db);
  const { token } = parseInput(pushTokenInput, await body(request));
  await unregisterPushToken(db, ctx, token);
  return undefined;
});
