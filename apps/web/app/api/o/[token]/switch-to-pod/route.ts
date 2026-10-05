import { after } from 'next/server';
import { postSwitchToPod } from '@/server/checkout';

export const dynamic = 'force-dynamic';

// Buyer order action (M5): Pay on delivery instead. Only through transitionOrder().
export function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  return postSwitchToPod(request, ctx, after);
}
