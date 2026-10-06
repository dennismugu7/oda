import { postDigest } from '@/server/digest';
import { serverEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

// Daily at 08:00 Nairobi (GitHub Actions, cron-digest.yml): the support digest, only with news.
export function POST(request: Request) {
  return postDigest(request, serverEnv().PUBLIC_SHOP_BASE_URL);
}
