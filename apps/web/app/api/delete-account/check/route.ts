import { postDeletionCheck } from '@/server/accountDeletion';

export const dynamic = 'force-dynamic';

// The confirm page asks whether its link still works (POST: the token stays out of URLs).
export const POST = postDeletionCheck;
