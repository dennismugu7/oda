import { after } from 'next/server';
import { postExpireOrders } from '@/server/cron';

export const dynamic = 'force-dynamic';

// Hourly (GitHub Actions, cron-expire-orders.yml): unpaid buyer orders expire after 48 h.
export function POST(request: Request) {
  return postExpireOrders(request, after);
}
