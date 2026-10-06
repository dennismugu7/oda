// Help's support contact (decision #77): from GET /api/support, kept for offline, with the
// email as the fallback until the server answers.
import type { Support } from '@/insights/api';
import { memoryCache } from '@/settings/useLoaded';

export const FALLBACK_SUPPORT: Support = { email: 'support@mugu-labs.com', whatsapp: null };

export const supportCache = memoryCache<Support>();
