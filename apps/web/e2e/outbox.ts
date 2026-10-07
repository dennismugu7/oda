import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';

// Reads the emails the web server under test wrote (EMAIL_TRANSPORT=file), and creates
// verified sellers through the real HTTP flow.

export const E2E_OUTBOX_DIR = '.outbox-e2e';

interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

/**
 * The newest email to `to` (waits briefly for the server to write it). Pass `match` when an
 * earlier email to the same address may already be there (e.g. the sign-up code before a
 * deletion link that is sent after the response).
 */
export async function lastEmailTo(
  to: string,
  match: (email: OutboxEmail) => boolean = () => true,
): Promise<OutboxEmail> {
  let found: OutboxEmail | undefined;
  await expect
    .poll(
      async () => {
        const dir = path.resolve(E2E_OUTBOX_DIR);
        const files = (await readdir(dir).catch(() => [] as string[])).sort().reverse();
        for (const file of files) {
          const email = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as OutboxEmail;
          if (email.to === to && match(email)) {
            found = email;
            return true;
          }
        }
        return false;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  return found!;
}

/** A random client IP per test, so the per-IP limits never carry over between runs. */
export function randomIp(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

/**
 * Requests as the seller app sends them: its scheme as origin (Better Auth checks it once
 * a session cookie is present) and a client IP.
 */
export function appHeaders(ip: string): Record<string, string> {
  return { 'x-real-ip': ip, 'expo-origin': 'oda://' };
}

/** Signs up and enters the emailed code: a verified seller with this email and password. */
export async function createVerifiedSeller(
  request: APIRequestContext,
  email: string,
  password: string,
  ip: string,
) {
  const headers = appHeaders(ip);
  // Sign-up is oda's own flow (decision #49): start → emailed code → verify.
  const signUp = await request.post('/api/signup/start', { data: { email, password }, headers });
  expect(signUp.status()).toBe(200);
  const { attemptId } = (await signUp.json()) as { attemptId: string };
  const code = /^(\d{6}) is your oda code$/.exec((await lastEmailTo(email)).subject)?.[1];
  expect(code).toBeTruthy();
  const verify = await request.post('/api/signup/verify', {
    data: { attemptId, code },
    headers,
  });
  expect(verify.status()).toBe(200);
}
