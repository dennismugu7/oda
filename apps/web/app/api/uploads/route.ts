import { assertCanEditShop, requireSeller } from '@/server/authz';
import { getDb } from '@/server/db';
import { parseInput, toResponse } from '@/server/errors';
import { createUpload, uploadRequest } from '@/server/uploads';

export const dynamic = 'force-dynamic';

// A signed upload for one photo (product, logo or feedback screenshot) at a key under the
// seller's own shop.
export async function POST(request: Request) {
  try {
    const db = getDb();
    const ctx = await requireSeller(request, db);
    const input = parseInput(uploadRequest, await request.json().catch(() => null));
    // Product and logo photos edit the shop; a feedback screenshot still reaches support.
    if (input.kind !== 'feedback') assertCanEditShop(ctx);
    return Response.json(await createUpload(ctx, input, db), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return toResponse(error);
  }
}
