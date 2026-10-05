import { postQuote } from '@/server/checkout';

export const dynamic = 'force-dynamic';

// Checkout: what each delivery option costs, priced on the server (M5).
export const POST = postQuote;
