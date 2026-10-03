import { authClient } from '@/auth/client';
import type { MeResult } from '@/auth/route';
import { API_URL } from '@/config';

// Calls to our own API (/api/*) with the seller's session, the same way Better Auth's
// client sends it.

const TIMEOUT_MS = 15_000; // Neon's free plan can take a few seconds to wake up

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
    signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function fetchMe(): Promise<MeResult> {
  try {
    const res = await apiFetch('/api/me');
    if (res.status === 401) return { kind: 'signed-out' };
    if (!res.ok) return { kind: 'error' };
    return { kind: 'ok', me: await res.json() };
  } catch {
    return { kind: 'offline' };
  }
}
