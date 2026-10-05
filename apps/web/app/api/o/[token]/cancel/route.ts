import { after } from 'next/server';
import { postBuyerCancel } from '@/server/checkout';

export const dynamic = 'force-dynamic';

// Buyer order action (M5): The buyer cancels. Only through transitionOrder().
export function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  return postBuyerCancel(request, ctx, after);
}
