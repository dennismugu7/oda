import { after } from 'next/server';
import { postOrderCode } from '@/server/checkout';

export const dynamic = 'force-dynamic';

// Buyer order action (M5): I've paid with the M-Pesa message or code. Only through transitionOrder().
export function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  return postOrderCode(request, ctx, after);
}
