import { handleAuthRequest } from '@/server/authRoute';

export const dynamic = 'force-dynamic';

// Better Auth (sign up, code, sign in, reset). The allowlist lives in server/authRoute.ts.
export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
