import 'server-only';
import { z } from 'zod';
import {
  onboardingAnswer,
  onboardingPayment,
  onboardingProduct,
  onboardingShop,
  slugify,
} from '@oda/shared';
import { requireSeller, requireUser } from './authz';
import { getDb } from './db';
import { serverEnv } from './env';
import { parseInput, toResponse, TooManyRequestsError, ValidationError } from './errors';
import { hitLimit } from './rateLimit';
import { onboardingShopRepo, onboardingUserRepo } from './repos/onboarding';

// HTTP handlers for /api/onboarding/* (decision #51). Each answers with the full onboarding
// state, so the app can render the next step (and resume) from one response.

type Handler = (request: Request) => Promise<Response>;

function handle(run: (request: Request) => Promise<unknown>): Handler {
  return async (request) => {
    try {
      return Response.json(await run(request), { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return toResponse(error);
    }
  };
}

const body = (request: Request) => request.json().catch(() => null);
const shopBaseUrl = () => serverEnv().PUBLIC_SHOP_BASE_URL.replace(/\/+$/, '');

async function state(request: Request) {
  const db = getDb();
  const ctx = await requireUser(request, db);
  return onboardingUserRepo(db, ctx).getState(shopBaseUrl());
}

/** GET /api/onboarding */
export const getOnboarding = handle(state);

/** POST /api/onboarding/answers: steps 1–2. */
export const postAnswer = handle(async (request) => {
  const db = getDb();
  const ctx = await requireUser(request, db);
  await onboardingUserRepo(db, ctx).saveAnswer(parseInput(onboardingAnswer, await body(request)));
  return state(request);
});

const SLUG_CHECKS = { window: 60, max: 60 };

/** GET /api/onboarding/slug?slug=… (or ?name=… to start from the shop name): step 3. */
export const getSlugCheck = handle(async (request) => {
  const db = getDb();
  const ctx = await requireUser(request, db);
  if (!(await hitLimit(db, `slug-check:${ctx.userId}`, SLUG_CHECKS))) {
    throw new TooManyRequestsError('Too many link checks. Wait a moment.', 60);
  }
  const params = new URL(request.url).searchParams;
  const raw = params.get('slug') ?? slugify(params.get('name') ?? '');
  const slug = z.string().max(60).safeParse(raw.trim().toLowerCase());
  if (!slug.success || !slug.data) throw new ValidationError('Enter a shop name or link.');
  return onboardingUserRepo(db, ctx).checkSlug(slug.data);
});

/** POST /api/onboarding/shop: step 3 creates (or, going back, updates) the shop. */
export const postShop = handle(async (request) => {
  const db = getDb();
  const ctx = await requireUser(request, db);
  await onboardingUserRepo(db, ctx).saveShop(parseInput(onboardingShop, await body(request)));
  return state(request);
});

/** POST /api/onboarding/product: step 4. */
export const postProduct = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  await onboardingShopRepo(db, ctx).saveProduct(parseInput(onboardingProduct, await body(request)));
  return state(request);
});

/** POST /api/onboarding/payment: step 5 (an M-Pesa account or Skip). */
export const postPayment = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  await onboardingShopRepo(db, ctx).savePayment(parseInput(onboardingPayment, await body(request)));
  return state(request);
});

const tickInput = z.strictObject({
  item: z.enum(['shared_link', 'tested_whatsapp'], { error: 'Unknown checklist item.' }),
});

/** POST /api/onboarding/checklist: "Share your link" / "Test your WhatsApp link". */
export const postChecklist = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const { item } = parseInput(tickInput, await body(request));
  await onboardingShopRepo(db, ctx).tick(item);
  return state(request);
});

/** POST /api/onboarding/complete: step 6 "Done". */
export const postComplete = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  await onboardingShopRepo(db, ctx).complete();
  return state(request);
});
