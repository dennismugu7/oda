import { toResponse } from '@/server/errors';
import { clientIp } from '@/server/rateLimit';
import { verifySignup } from '@/server/signup';

export const dynamic = 'force-dynamic';

// The code for this phone's attempt: creates the account with that attempt's password.
// The app then signs in with Better Auth (/api/auth/sign-in/email).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await verifySignup(body, clientIp(request.headers));
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
