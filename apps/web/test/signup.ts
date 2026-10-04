import { expect } from 'vitest';
import { POST as resendRoute } from '@/app/api/signup/resend/route';
import { POST as startRoute } from '@/app/api/signup/start/route';
import { POST as verifyRoute } from '@/app/api/signup/verify/route';
import { testOutbox } from '@/server/email/transport';

// Seller sign-up through its HTTP routes (decision #49), for tests.

type Route = (request: Request) => Promise<Response>;

export interface SignupBody {
  attemptId?: string;
  email?: string;
  resumed?: boolean;
  retryAfter?: number;
  codeSent?: boolean;
  error?: { code: string; message: string; retryAfter?: number };
}

async function post(route: Route, path: string, body: unknown, ip: string) {
  const res = await route(
    new Request(`http://localhost:3000/api/signup/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as SignupBody };
}

export const signupApi = {
  start: (body: { email: string; password: string; attemptId?: string }, ip = '10.0.0.1') =>
    post(startRoute, 'start', body, ip),
  resend: (attemptId: string, ip = '10.0.0.1') => post(resendRoute, 'resend', { attemptId }, ip),
  verify: (attemptId: string, code: string, ip = '10.0.0.1') =>
    post(verifyRoute, 'verify', { attemptId, code }, ip),
};

/** The newest 6-digit code emailed to `email`. */
export function lastCode(email: string): string {
  const subject = testOutbox.last(email)?.subject ?? '';
  const code = /^(\d{6}) is your oda code$/.exec(subject)?.[1];
  if (!code) throw new Error(`no code email for ${email}`);
  return code;
}

/** A verified account through the real flow: start → emailed code → verify. */
export async function signUpThroughCode(email: string, password: string, ip = '10.0.0.1') {
  const started = await signupApi.start({ email, password }, ip);
  expect(started.status).toBe(200);
  const verified = await signupApi.verify(started.json.attemptId!, lastCode(email), ip);
  expect(verified.status).toBe(200);
}
