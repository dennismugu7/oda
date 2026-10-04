// Where the app opens, from the session and GET /api/me (pure, so it is unit-tested).

export interface Me {
  email: string;
  emailVerified: boolean;
  onboarding: { step: number | null; done: boolean };
  shop: { id: string; name: string; slug: string } | null;
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
  | { to: '/start' } // placeholder until M2b's onboarding and M6's Home
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
      return me.me.emailVerified ? { to: '/start' } : { to: '/verify', email: me.me.email };
  }
}
