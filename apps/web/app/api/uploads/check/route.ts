import { requireSeller } from '@/server/authz';
import { getDb } from '@/server/db';
import { parseInput, toResponse } from '@/server/errors';
import { checkUploads, uploadsCheck } from '@/server/uploads';

export const dynamic = 'force-dynamic';

// Which of the seller's own product photo files still exist, for a draft restored on the
// phone (decision #111 c). Read-only.
export async function POST(request: Request) {
  try {
    const ctx = await requireSeller(request, getDb());
    const input = parseInput(uploadsCheck, await request.json().catch(() => null));
    return Response.json(await checkUploads(ctx, input.keys), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return toResponse(error);
  }
}
