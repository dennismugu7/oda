import { after } from 'next/server';
import { postOrder } from '@/server/checkout';

export const dynamic = 'force-dynamic';

// Checkout: place an order (M5, decision #61). Emails go out after the response.
export function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return postOrder(request, ctx, after);
}
