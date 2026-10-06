import { postDeleteMe } from '@/server/accountDeletion';

export const dynamic = 'force-dynamic';

// Settings → Delete account (type "DELETE"): the shop closes at once, the purge follows.
export const POST = postDeleteMe;
