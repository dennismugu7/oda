import { getOnboarding } from '@/server/onboardingRoutes';

export const dynamic = 'force-dynamic';

// The seller's onboarding state (steps 1–6), to resume and prefill the screens.
export const GET = getOnboarding;
