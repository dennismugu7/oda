import { deletePushToken, postPushToken } from '@/server/pushRoutes';

export const dynamic = 'force-dynamic';

// This phone's push token: added on sign-in, removed on sign-out.
export const POST = postPushToken;
export const DELETE = deletePushToken;
