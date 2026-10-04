import { toResponse } from '@/server/errors';
import { clientIp } from '@/server/rateLimit';
import { resendSignupCode } from '@/server/signup';

export const dynamic = 'force-dynamic';

// A new code for this phone's sign-up attempt (60 s cooldown, hourly limits).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await resendSignupCode(body, clientIp(request.headers));
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
