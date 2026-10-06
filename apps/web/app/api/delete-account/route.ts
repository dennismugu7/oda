import { after } from 'next/server';
import { postDeletionRequest } from '@/server/accountDeletion';

export const dynamic = 'force-dynamic';

// The web /delete-account form: emails a confirm link when the email has an account.
export function POST(request: Request) {
  return postDeletionRequest(request, after);
}
