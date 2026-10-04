import 'server-only';
import { z } from 'zod';
import { cartLookupInput, nairobiDay, VISIT_COOKIE, visitCookie, visitSource } from '@oda/shared';
import { getDb } from './db';
import { NotFoundError, parseInput, toResponse, TooManyRequestsError } from './errors';
import { clientIp, hitLimit } from './rateLimit';
import { publicRepo, type PublicShop } from './repos/public';

// Public storefront endpoints (M4, decision #59): no session. Both answer 404 for a shop that
// doesn't exist, is suspended or deleted; an old link counts for the shop it now points to.

type Params = { params: Promise<{ slug: string }> };

async function findShop(slug: string): Promise<PublicShop> {
  const pub = publicRepo(getDb());
  const found = await pub.findShop(slug);
  if (found.kind === 'shop') return found.shop;
  if (found.kind === 'redirect') {
    const current = await pub.findShop(found.slug);
    if (current.kind === 'shop') return current.shop;
  }
  throw new NotFoundError('Shop not found.');
}

const body = (request: Request) => request.json().catch(() => null);

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

const visitInput = z.object({ s: z.string().max(20).nullish() }).catch({ s: null });

/**
 * POST /api/shops/:slug/visit — sent once by the shop page in the browser (so link-preview
 * bots, which don't run scripts, never count). Counts once per shop per Nairobi day.
 */
export async function postVisit(request: Request, { params }: Params): Promise<Response> {
  try {
    const db = getDb();
    if (!(await hitLimit(db, `visit-ip:${clientIp(request.headers)}`, { window: 60, max: 120 }))) {
      throw new TooManyRequestsError('Too many requests.', 60);
    }
    const shop = await findShop((await params).slug);
    const { s } = visitInput.parse(await body(request));
    const day = nairobiDay(new Date());
    const cookie = visitCookie(readCookie(request, VISIT_COOKIE), shop.id, day);
    if (cookie.count) await publicRepo(db).shop(shop).recordVisit(day, visitSource(s));
    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store',
        'set-cookie': `${VISIT_COOKIE}=${cookie.value}; Path=/; Max-Age=172800; SameSite=Lax; HttpOnly${
          process.env.VERCEL ? '; Secure' : ''
        }`,
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}

/** POST /api/shops/:slug/cart — the current price and status of the products in a cart. */
export async function postCartLookup(request: Request, { params }: Params): Promise<Response> {
  try {
    const db = getDb();
    if (!(await hitLimit(db, `cart-ip:${clientIp(request.headers)}`, { window: 60, max: 120 }))) {
      throw new TooManyRequestsError('Too many requests.', 60);
    }
    const shop = await findShop((await params).slug);
    const { productIds } = parseInput(cartLookupInput, await body(request));
    const products = await publicRepo(db).shop(shop).lookup(productIds);
    return Response.json({ products }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
