import 'server-only';
import { notificationsReadInput } from '@oda/shared';
import { requireSeller } from './authz';
import { getDb } from './db';
import { parseInput } from './errors';
import { sellerHomeRepo } from './repos/sellerHome';
import { body, handle } from './routeHandler';

// Home (15, 16) and the notifications list (M6 CP3). The To-do card reads GET /api/orders.

async function repo(request: Request) {
  const db = getDb();
  return sellerHomeRepo(db, await requireSeller(request, db));
}

/** GET /api/home: sales this week (Mon–Sun, Nairobi), the top source, unread notifications. */
export const getHome = handle(async (request) => (await repo(request)).home());

/** GET /api/notifications: newest first, with the unread count. */
export const listNotifications = handle(async (request) => (await repo(request)).notifications());

/** PATCH /api/notifications/read: `ids`, or every unread one. */
export const markNotificationsRead = handle(async (request) => {
  const home = await repo(request);
  return home.markRead(parseInput(notificationsReadInput, await body(request)));
});
