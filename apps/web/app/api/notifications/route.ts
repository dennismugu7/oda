import { listNotifications } from '@/server/homeRoutes';

export const dynamic = 'force-dynamic';

// The notifications list (design-changes NEW: notifications).
export const GET = listNotifications;
