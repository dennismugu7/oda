import { authClient } from '@/auth/client';
import { CALL_TIMEOUT_MS, guardedCall } from '@/auth/call';
import type { MeResult } from '@/auth/route';
import { API_URL } from '@/config';
import { isOnline } from '@/net';

// Calls to our own API (/api/*) with the seller's session, the same way Better Auth's
// client sends it. 15 s timeout (Neon's free plan can take a few seconds to wake up).

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookie = await authClient.getCookie();
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'omit',
    headers: {
      accept: 'application/json',
      'expo-origin': 'oda://',
      ...(cookie ? { cookie } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: init.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
}

export async function fetchMe(): Promise<MeResult> {
  const result = await guardedCall(
    async () => {
      const res = await apiFetch('/api/me');
      if (res.status === 401) return { data: { kind: 'signed-out' } as MeResult };
      if (!res.ok) return { data: { kind: 'error' } as MeResult };
      return { data: { kind: 'ok', me: await res.json() } as MeResult };
    },
    { isOnline },
  );
  if (result.data) return result.data;
  return result.error?.code === 'OFFLINE' ? { kind: 'offline' } : { kind: 'unreachable' };
}
