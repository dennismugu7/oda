import { postPayment } from '@/server/onboardingRoutes';

export const dynamic = 'force-dynamic';

// Step 5: the M-Pesa account buyers pay, or Skip (pay on delivery).
export const POST = postPayment;
