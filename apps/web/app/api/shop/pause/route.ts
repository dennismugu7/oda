import { getPause, patchPause } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 20b-settings: pause the shop (browse only, no new orders) or resume.
export const GET = getPause;
export const PATCH = patchPause;
