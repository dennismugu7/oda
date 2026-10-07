// Where the app opens, from the session and GET /api/me (pure, so it is unit-tested).
import type { BusinessType } from '@oda/shared';
import { routeForStep, type OnboardingRoute } from '../onboarding/steps';

export interface Me {
  email: string;
  emailVerified: boolean;
  onboarding: { step: number | null; done: boolean };
  shop: {
    id: string;
    name: string;
    slug: string;
    /** The shop logo for the Shop tab and More cards (M8b), null without one. */
    logoUrl?: string | null;
    /** Sets the size presets offered for products (decision #41 d). */
    businessType?: BusinessType;
    /** The shop's rating for the More tab's Reviews row (M7). */
    ratingAvg?: number | null;
    ratingCount?: number;
    /** Suspended by oda: read-only except open orders (decision #81 d). */
    suspended?: boolean;
  } | null;
}

export type MeResult =
  | { kind: 'ok'; me: Me }
  | { kind: 'signed-out' } // 401: the session is gone (expired, reset elsewhere, deleted)
  | { kind: 'offline' } // no network on the phone
  | { kind: 'unreachable' } // network, but no answer from oda in time
  | { kind: 'error' };

export type StartRoute =
  | { to: '/welcome' }
  | { to: '/verify'; email: string }
  | { to: OnboardingRoute } // the onboarding step to resume (M2b)
  | { to: '/home' } // after onboarding: the tabs (Home's dashboard arrives in M6)
  | { to: 'offline' }
  | { to: 'unreachable' }
  | { to: 'error' };

export function startRoute(hasSession: boolean, me: MeResult | null): StartRoute {
  if (!hasSession) return { to: '/welcome' };
  if (!me) return { to: 'error' };
  switch (me.kind) {
    case 'signed-out':
      return { to: '/welcome' };
    case 'offline':
      return { to: 'offline' };
    case 'unreachable':
      return { to: 'unreachable' };
    case 'error':
      return { to: 'error' };
    case 'ok':
      // Every account has a verified email (decision #49: accounts exist only after the code).
      // Not finished setting up: back to the step they reached.
      if (!me.me.onboarding.done) return { to: routeForStep(me.me.onboarding.step) };
      return { to: '/home' };
  }
}
