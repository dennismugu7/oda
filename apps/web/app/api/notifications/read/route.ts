import { markNotificationsRead } from '@/server/homeRoutes';

export const dynamic = 'force-dynamic';

// Mark one, some or all notifications read.
export const PATCH = markNotificationsRead;
