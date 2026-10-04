// Onboarding steps 1–6 ↔ screens (09–14). Pure, so it is unit-tested.

export const ONBOARDING_ROUTES = {
  1: '/onboarding/what-you-sell',
  2: '/onboarding/where-you-sell',
  3: '/onboarding/name-shop',
  4: '/onboarding/first-product',
  5: '/onboarding/payment',
  6: '/onboarding/live',
} as const;

export type OnboardingStepNumber = keyof typeof ONBOARDING_ROUTES;
export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[OnboardingStepNumber];

export function routeForStep(step: number | null | undefined): OnboardingRoute {
  const n = Math.min(6, Math.max(1, Math.trunc(step ?? 1))) as OnboardingStepNumber;
  return ONBOARDING_ROUTES[n];
}

/** Where "back" goes from a step when there's no screen to go back to (a resumed app). */
export function previousStep(step: OnboardingStepNumber): OnboardingRoute | null {
  return step > 1 ? ONBOARDING_ROUTES[(step - 1) as OnboardingStepNumber] : null;
}
