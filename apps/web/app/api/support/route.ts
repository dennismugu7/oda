import { getSupport } from '@/server/insightsRoutes';

export const dynamic = 'force-dynamic';

// Help's support contact (decision #77): email, and WhatsApp only when configured.
export const GET = getSupport;
