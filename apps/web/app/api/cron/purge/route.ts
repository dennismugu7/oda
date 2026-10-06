import { postPurge } from '@/server/purge';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily (GitHub Actions, cron-purge.yml) and by hand, with a dry run: deleted accounts after
// 30 days, soft-deleted products, failed file deletes, unreferenced files, old sign-ups.
export function POST(request: Request) {
  return postPurge(request);
}
