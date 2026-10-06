import 'server-only';
import {
  detailsUpdate,
  feedbackInput,
  pauseUpdate,
  paymentAccountInput,
  paymentSettingsUpdate,
  shopProfileUpdate,
} from '@oda/shared';
import { requireSeller } from './authz';
import { getDb } from './db';
import { serverEnv } from './env';
import { parseInput } from './errors';
import { settingsRepo } from './repos/settings';
import { body, handle } from './routeHandler';
import { screenshotsEnabled } from './uploads';

// HTTP handlers for the M8a settings screens (docs/m8-plan.md CP1). Seller session only;
// every body goes through its strict zod whitelist.

const shopBaseUrl = () => serverEnv().PUBLIC_SHOP_BASE_URL.replace(/\/+$/, '');

async function repo(request: Request) {
  const db = getDb();
  return settingsRepo(db, await requireSeller(request, db));
}

/** GET /api/me/details (20b-your-details, and the Settings header). */
export const getDetails = handle(async (request) => (await repo(request)).getDetails());

/** PATCH /api/me/details */
export const patchDetails = handle(async (request) => {
  const r = await repo(request);
  await r.updateDetails(parseInput(detailsUpdate, await body(request)));
  return r.getDetails();
});

/** GET /api/shop/profile (20b-shop-profile). */
export const getShopProfile = handle(async (request) =>
  (await repo(request)).getProfile(shopBaseUrl()),
);

/** PATCH /api/shop/profile */
export const patchShopProfile = handle(async (request) => {
  const r = await repo(request);
  await r.updateProfile(parseInput(shopProfileUpdate, await body(request)));
  return r.getProfile(shopBaseUrl());
});

/** GET /api/payments (20b-payments). */
export const getPayments = handle(async (request) => (await repo(request)).payments());

/** PATCH /api/payments: "When buyers pay". */
export const patchPayments = handle(async (request) => {
  const r = await repo(request);
  return r.updatePaymentSettings(parseInput(paymentSettingsUpdate, await body(request)));
});

/** POST /api/payments/accounts: add an M-Pesa account (the first one becomes active). */
export const postAccount = handle(async (request) => {
  const r = await repo(request);
  return r.addAccount(parseInput(paymentAccountInput, await body(request)));
}, 201);

/** PATCH /api/payments/accounts/:id: edit an account's details. */
export const patchAccount = handle(async (request, id) => {
  const r = await repo(request);
  return r.updateAccount(id!, parseInput(paymentAccountInput, await body(request)));
});

/** DELETE /api/payments/accounts/:id: only a saved (not active) one. */
export const deleteAccount = handle(async (request, id) =>
  (await repo(request)).removeAccount(id!),
);

/** POST /api/payments/accounts/:id/activate: the account buyers see at checkout. */
export const postActivateAccount = handle(async (request, id) =>
  (await repo(request)).activateAccount(id!),
);

/** PATCH /api/shop/pause: paused = browse only, no new orders. */
export const patchPause = handle(async (request) => {
  const r = await repo(request);
  return r.setPaused(parseInput(pauseUpdate, await body(request)).paused);
});

/** GET /api/feedback: what the form needs (screenshots on, the WhatsApp number shown). */
export const getFeedback = handle(async (request) => {
  const r = await repo(request);
  const profile = await r.getProfile(shopBaseUrl());
  return { screenshots: screenshotsEnabled(), whatsappPhone: profile.whatsappPhone };
});

/** POST /api/feedback: 21-share-feedback, 5 a day per shop. */
export const postFeedback = handle(async (request) => {
  const r = await repo(request);
  return r.sendFeedback(parseInput(feedbackInput, await body(request)));
}, 201);
