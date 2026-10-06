import 'server-only';
import { customersQuery, insightsQuery } from '@oda/shared';
import { requireSeller } from './authz';
import { getDb } from './db';
import { serverEnv } from './env';
import { parseInput } from './errors';
import { insightsRepo } from './repos/insights';
import { handle } from './routeHandler';

// HTTP handlers for M8b: Insights, Customers, the More tab and Help's support contact.

async function repo(request: Request) {
  const db = getDb();
  return insightsRepo(db, await requireSeller(request, db));
}

const query = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);

/** GET /api/insights?period=today|week|month */
export const getInsights = handle(async (request) => {
  const r = await repo(request);
  return r.insights(parseInput(insightsQuery, query(request)).period);
});

/** GET /api/customers?filter=all|repeat|new&q=&cursor= */
export const getCustomers = handle(async (request) => {
  const r = await repo(request);
  return r.customers(parseInput(customersQuery, query(request)));
});

/** GET /api/more: the More tab's rows. */
export const getMore = handle(async (request) =>
  (await repo(request)).more(serverEnv().PUBLIC_SHOP_BASE_URL),
);

/** GET /api/share: the Share screen's images (19b-share). */
export const getShare = handle(async (request) =>
  (await repo(request)).share(serverEnv().PUBLIC_SHOP_BASE_URL),
);

/** GET /api/support: Help's contact (decision #77), from server config. */
export const getSupport = handle(async (request) => {
  await requireSeller(request);
  const env = serverEnv();
  return { email: env.ODA_SUPPORT_EMAIL, whatsapp: env.ODA_SUPPORT_WHATSAPP };
});
