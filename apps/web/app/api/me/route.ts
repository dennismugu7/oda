import { requireUser } from '@/server/authz';
import { getDb } from '@/server/db';
import { toResponse } from '@/server/errors';
import { userRepo } from '@/server/repos/user';

export const dynamic = 'force-dynamic';

// The signed-in seller: email, onboarding step to resume (or done) and shop, if any.
export async function GET(request: Request) {
  try {
    const db = getDb();
    const ctx = await requireUser(request, db);
    const me = await userRepo(db, ctx).getMe();
    return Response.json(me, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return toResponse(error);
  }
}
