import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { truncateAll } from '@oda/db/testing';
import { getDb } from './db';

// M10 CP1 (security review): every API route handler, called with no session, no secret and
// a cross-site Origin (another website's script), refuses. Each route file must be listed below with the guard it uses, so
// a new route without a guard (or one that isn't listed) fails CI. Public routes are a short,
// reviewed list (docs/hardening-report.md → Endpoints).

type Guard =
  | 'seller' // requireSeller / requireUser: 401 without a session
  | 'token' // requireOrderToken (then assertSameOrigin for writes): 404 for an unknown token
  | 'secret' // Bearer CRON_SECRET / OPS_SECRET: 404 without it
  | 'buyer-write' // assertSameOrigin: 403 from another site's page
  | 'public'; // reviewed: answers anonymous requests on purpose (rate limited where it writes)

const ROUTES: Record<string, Guard | Partial<Record<Method, Guard>>> = {
  'auth/[...all]': 'public', // Better Auth (its own origin checks; auth.test.ts)
  'categories/[id]/products': 'seller',
  'categories/[id]': 'seller',
  'categories/order': 'seller',
  categories: 'seller',
  'cron/digest': 'secret',
  'cron/expire-orders': 'secret',
  'cron/purge': 'secret',
  customers: 'seller',
  'delete-account/check': 'buyer-write',
  'delete-account/confirm': 'buyer-write',
  'delete-account': 'buyer-write',
  'delivery/areas/[id]': 'seller',
  'delivery/areas/order': 'seller',
  'delivery/areas': 'seller',
  delivery: 'seller',
  'dev-uploads/[...key]': 'public', // local driver only, signed PUT (404 on Vercel)
  feedback: 'seller',
  health: 'public',
  home: 'seller',
  insights: 'seller',
  'me/delete': 'seller',
  'me/details': 'seller',
  'me/push-tokens': 'seller',
  me: 'seller',
  more: 'seller',
  'notifications/read': 'seller',
  notifications: 'seller',
  'o/[token]/cancel': 'token',
  'o/[token]/code': 'token',
  'o/[token]/report': 'token',
  'o/[token]/review': 'token',
  'o/[token]/switch-to-pod': 'token',
  'o/[token]/uploads': 'token',
  'onboarding/answers': 'seller',
  'onboarding/checklist': 'seller',
  'onboarding/complete': 'seller',
  'onboarding/logo': 'seller',
  'onboarding/payment': 'seller',
  'onboarding/product': 'seller',
  onboarding: 'seller',
  'onboarding/shop': 'seller',
  'onboarding/slug': 'seller',
  'ops/reviews/remove': 'secret',
  'orders/[id]/actions': 'seller',
  'orders/[id]': 'seller',
  'orders/quote': 'seller',
  orders: 'seller',
  'payments/accounts/[id]/activate': 'seller',
  'payments/accounts/[id]': 'seller',
  'payments/accounts': 'seller',
  payments: 'seller',
  'products/[id]/photos': 'seller',
  'products/[id]/restore': 'seller',
  'products/[id]': 'seller',
  products: 'seller',
  'reset-password/check': 'public', // is a reset link still valid (60 an hour per IP)
  'reviews/[id]/reply': 'seller',
  'reviews/[id]/report': 'seller',
  'reviews/[id]': 'seller',
  reviews: 'seller',
  share: 'seller',
  'shop/pause': 'seller',
  'shop/profile': 'seller',
  'shops/[slug]/cart': 'public', // a public shop's prices (unknown shop: 404)
  'shops/[slug]/orders': 'buyer-write',
  'shops/[slug]/products/[id]/reviews': 'public', // a public shop's reviews
  'shops/[slug]/quote': 'public', // a public shop's delivery quote
  'shops/[slug]/visit': 'buyer-write',
  // Sign-up comes from the seller app (no Origin); rate limited per IP, email and attempt.
  'signup/resend': 'public',
  'signup/start': 'public',
  'signup/verify': 'public',
  support: 'seller',
  uploads: 'seller',
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Method = (typeof METHODS)[number];

const EXPECTED: Record<Exclude<Guard, 'public'>, number[]> = {
  seller: [401],
  token: [403, 404], // writes check the Origin first, reads the token
  secret: [404],
  'buyer-write': [403, 404], // a shop's routes may answer 404 for an unknown shop first
};

type RouteModule = Partial<Record<Method, (req: Request, ctx: unknown) => Promise<Response>>>;
const modules = import.meta.glob('../app/api/**/route.ts') as Record<
  string,
  () => Promise<RouteModule>
>;
const nameOf = (path: string) => path.replace('../app/api/', '').replace(/\/route\.ts$/, '');

const params = () =>
  Promise.resolve({
    id: randomUUID(),
    token: 'o_' + randomUUID().replaceAll('-', ''),
    slug: `no-shop-${randomUUID().slice(0, 6)}`,
    key: ['products', 'x.jpg'],
    all: ['get-session'],
  });

afterAll(() => truncateAll(getDb()));

describe('every API route', () => {
  it('is listed with its guard (a new route must be added here)', () => {
    const files = Object.keys(modules).map(nameOf).sort();
    expect(files).toEqual(Object.keys(ROUTES).sort());
  });

  for (const [path, load] of Object.entries(modules)) {
    const name = nameOf(path);
    it(`${name}: refuses an anonymous request`, { timeout: 60_000 }, async () => {
      const mod = await load();
      const handlers = METHODS.filter((m) => typeof mod[m] === 'function');
      expect(handlers.length).toBeGreaterThan(0);
      for (const method of handlers) {
        const entry = ROUTES[name];
        const guard = typeof entry === 'string' ? entry : entry?.[method];
        expect(guard, `${method} ${name} has no guard listed`).toBeDefined();
        if (guard === 'public' || !guard) continue;
        const res = await mod[method]!(
          new Request(`http://localhost:3000/api/${name}`, {
            method,
            headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
            body: method === 'GET' ? undefined : '{}',
          }),
          { params: params() },
        );
        expect(
          EXPECTED[guard],
          `${method} /api/${name} (${guard}) answered ${res.status}`,
        ).toContain(res.status);
      }
    });
  }
});
