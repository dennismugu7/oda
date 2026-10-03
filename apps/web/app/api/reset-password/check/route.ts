import { z } from 'zod';
import { resetTokenStatus } from '@/server/auth';
import { getDb } from '@/server/db';
import { toResponse, TooManyRequestsError } from '@/server/errors';
import { clientIp, hitLimit } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ token: z.string().max(200) });
const LIMIT = { window: 3600, max: 60 };

// Web page 07 asks whether its reset link still works before the seller types anything.
// POST, so the token travels in the body and never in a logged URL (decision #45).
export async function POST(request: Request) {
  try {
    if (!(await hitLimit(getDb(), `reset-check-ip:${clientIp(request.headers)}`, LIMIT))) {
      throw new TooManyRequestsError('Too many tries. Try again in a few minutes.');
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    const status = parsed.success ? await resetTokenStatus(parsed.data.token) : 'invalid';
    return Response.json({ status }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
