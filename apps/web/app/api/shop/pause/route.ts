import { patchPause } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 20b-settings: pause the shop (browse only, no new orders) or resume.
export const PATCH = patchPause;
