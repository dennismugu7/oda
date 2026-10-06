import { getDetails, patchDetails } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 20b-your-details: name and recovery phone (email read-only).
export const GET = getDetails;
export const PATCH = patchDetails;
