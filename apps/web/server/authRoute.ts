import 'server-only';
import { AUTH_ROUTES, getAuth } from './auth';

// HTTP entry for Better Auth (/api/auth/*). Only the endpoints in AUTH_ROUTES are served;
// the rest of Better Auth's API (sign-in by code, account linking, user updates…) is 404.

const BASE = '/api/auth';

function isAllowed(method: string, pathname: string): boolean {
  if (!pathname.startsWith(`${BASE}/`)) return false;
  const path = pathname.slice(BASE.length).replace(/\/+$/, '');
  const allowed: readonly string[] =
    method === 'GET' ? AUTH_ROUTES.GET : method === 'POST' ? AUTH_ROUTES.POST : [];
  return allowed.includes(path);
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!isAllowed(request.method, pathname)) {
    return Response.json(
      { code: 'NOT_FOUND', message: "We couldn't find that." },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
  return getAuth().handler(request);
}
