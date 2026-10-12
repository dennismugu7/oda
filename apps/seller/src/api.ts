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
      // This app shows arranged orders as they are (decision #110 f); without it the server
      // sends them as a delivery, for older apps.
      'x-oda-app-features': 'arranged',
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

export interface ApiError {
  status: number;
  code?: string;
  message?: string;
  /** Per-field messages from the server's input checks. */
  fields?: Record<string, string>;
  retryAfter?: number;
}

/**
 * A JSON call to our API with the session, the offline check and the 15 s timeout; never
 * throws. Errors carry the server's own wording (written for sellers).
 */
export async function apiJson<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<{ data: T | null; error: ApiError | null }> {
  const result = await guardedCall<T>(
    async () => {
      const res = await apiFetch(path, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const json = (await res.json().catch(() => null)) as
        (T & { error?: Omit<ApiError, 'status'> }) | null;
      if (res.ok && json) return { data: json };
      // 204 No Content (e.g. a delete): success without a body.
      if (res.status === 204) return { data: {} as T };
      return { error: { status: res.status, ...(json?.error ?? {}) } };
    },
    { isOnline },
  );
  return { data: result.data, error: result.error as ApiError | null };
}
