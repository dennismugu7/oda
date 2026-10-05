import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { signUpVerified } from '@/test/auth';
import { postAnswer, postShop } from '@/server/onboardingRoutes';
import type { Handler } from '@/server/routeHandler';

// Calls the seller API's route handlers with a real session against oda_test (M6 tests).

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function newUser() {
  const { token, userId } = await signUpVerified('', `s-${randomUUID().slice(0, 8)}@example.test`);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  async function call(
    handler: Handler,
    opts: { method?: string; body?: unknown; id?: string; query?: string } = {},
  ) {
    const res = await handler(
      new Request(`http://localhost:3000/api/x${opts.query ?? ''}`, {
        method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      }),
      { params: Promise.resolve({ id: opts.id ?? '' }) },
    );
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as Json };
  }
  return { call, userId };
}

/** A seller with a shop (onboarding steps 1–3 through the API). */
export async function newSeller() {
  const user = await newUser();
  const onboarding = (h: (r: Request) => Promise<Response>) => h as unknown as Handler;
  await user.call(onboarding(postAnswer), { body: { step: 1, businessType: 'fashion' } });
  await user.call(onboarding(postAnswer), { body: { step: 2, skip: true } });
  const slug = `amani-${randomUUID().slice(0, 6)}`;
  const shop = await user.call(onboarding(postShop), {
    body: { name: 'Amani Styles', slug, whatsappPhone: '0712345678' },
  });
  expect(shop.status).toBe(200);
  return { ...user, slug, shopId: shop.json.shop.id as string };
}

export type Seller = Awaited<ReturnType<typeof newSeller>>;

/** The status of a request without a session. */
export async function anonCall(handler: Handler, opts: { method?: string; id?: string } = {}) {
  const res = await handler(
    new Request('http://localhost:3000/api/x', { method: opts.method ?? 'GET' }),
    { params: Promise.resolve({ id: opts.id ?? '' }) },
  );
  return res.status;
}
