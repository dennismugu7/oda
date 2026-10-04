import { toResponse } from '@/server/errors';
import { clientIp } from '@/server/rateLimit';
import { startSignup } from '@/server/signup';

export const dynamic = 'force-dynamic';

// Begin (or, from the same phone, resume) a seller sign-up: emails a 6-digit code.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await startSignup(body, clientIp(request.headers));
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
