import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Helpers for the staging regression (M10 CP6, decision #92): runs only from Actions →
// staging-regression against staging, as throwaway sellers on Resend test addresses.
// Never logs email codes, links, order tokens or keys: each one is masked (GitHub hides it in
// the log) before it is used, and the summary reporter redacts them from error messages.

export const STAGING = 'https://oda-eta.vercel.app';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (the staging-regression workflow sets it).`);
  return value;
}

export const env = {
  get runId() {
    const id = required('REGRESSION_RUN_ID');
    if (!/^[0-9]{1,20}$/.test(id)) throw new Error('REGRESSION_RUN_ID must be the run number.');
    return id;
  },
  get resendKey() {
    return required('RESEND_API_KEY');
  },
  get opsSecret() {
    return required('OPS_SECRET');
  },
  get cronSecret() {
    return required('CRON_SECRET');
  },
  get databaseUrl() {
    return required('DATABASE_URL');
  },
};

/** The run's own test address for seller `label` (a, b, …): Resend's test inbox. */
export function testEmail(label: string): string {
  return `delivered+${env.runId}-${label}@resend.dev`;
}

/** Hides a value in the GitHub Actions log from here on (the reporter passes this through). */
export function mask(value: string): void {
  if (value) process.stdout.write(`::add-mask::${value}\n`);
}

// Screenshots ---------------------------------------------------------------------------------

export const OUTPUT_DIR = path.resolve('regression-output');

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(path.join(OUTPUT_DIR, 'screens'), { recursive: true });
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screens', `${name}.png`), fullPage: true });
}

// Resend: read this run's own test emails (GET only; decision #92 c) ------------------------

interface SentEmail {
  id: string;
  to: string[];
  subject: string;
  created_at: string;
}

async function resendGet<T>(request: APIRequestContext, url: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.get(`https://api.resend.com${url}`, {
      headers: { authorization: `Bearer ${env.resendKey}` },
    });
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    expect(res.status(), 'Resend API (read-only)').toBe(200);
    return (await res.json()) as T;
  }
  throw new Error('Resend kept answering 429.');
}

/**
 * The newest email to `to` whose subject matches, sent after `since`; waits for it. Returns
 * the subject and plain text (links and codes are masked by the caller).
 */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject: RegExp,
  since: Date,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const list = await resendGet<{ data: SentEmail[] }>(request, '/emails?limit=100');
    const hit = list.data.find(
      (e) =>
        e.to.map((t) => t.toLowerCase()).includes(to.toLowerCase()) &&
        subject.test(e.subject) &&
        new Date(e.created_at).getTime() >= since.getTime() - 5_000,
    );
    if (hit) {
      const full = await resendGet<{ subject: string; text: string | null; html: string | null }>(
        request,
        `/emails/${hit.id}`,
      );
      const text = full.text ?? (full.html ?? '').replace(/<[^>]+>/g, ' ');
      return { subject: full.subject, text };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`No email to ${to} matching ${subject} within 90 s.`);
}

/** The 6-digit sign-up code from the newest code email (masked before it is returned). */
export async function signupCode(request: APIRequestContext, to: string, since: Date) {
  const mail = await waitForEmail(request, to, /^\d{6} is your oda code$/, since);
  const code = /^(\d{6}) is your oda code$/.exec(mail.subject)![1]!;
  mask(code);
  return code;
}

/** The first link in an email's text matching `pattern` (masked before it is returned). */
export async function emailLink(
  request: APIRequestContext,
  to: string,
  subject: RegExp,
  pattern: RegExp,
  since: Date,
) {
  const mail = await waitForEmail(request, to, subject, since);
  const link = pattern.exec(mail.text)?.[0];
  if (!link) throw new Error(`The email "${mail.subject}" has no matching link.`);
  mask(link);
  const hash = new URL(link).hash;
  if (hash) mask(hash.slice(1));
  return link;
}

// The seller app's API calls -------------------------------------------------------------------

/** A real, decodable PNG (staging checks every uploaded photo's bytes). */
export function realPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// As the seller app sends them; this app knows arranged orders (decision #110 f).
const APP = { 'expo-origin': 'oda://', 'x-oda-app-features': 'arranged' };

export class Seller {
  token = '';
  constructor(
    readonly request: APIRequestContext,
    readonly email: string,
    public password: string,
  ) {}

  private headers() {
    return { ...APP, authorization: `Bearer ${this.token}` };
  }

  /** Sign-up as the app does it: start → the emailed code (read from Resend) → verify. */
  async signUp() {
    const since = new Date();
    const start = await this.request.post('/api/signup/start', {
      data: { email: this.email, password: this.password },
      headers: APP,
    });
    expect(start.status(), 'signup/start').toBe(200);
    const { attemptId } = (await start.json()) as { attemptId: string };
    return { attemptId, since };
  }

  async verify(attemptId: string, code: string) {
    return this.request.post('/api/signup/verify', { data: { attemptId, code }, headers: APP });
  }

  async signIn(password = this.password) {
    const res = await this.request.post('/api/auth/sign-in/email', {
      data: { email: this.email, password },
      headers: APP,
    });
    if (res.status() === 200) {
      this.token = ((await res.json()) as { token: string }).token;
      mask(this.token);
    }
    return res.status();
  }

  async call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, data?: unknown) {
    return this.request.fetch(url, { method, data, headers: this.headers() });
  }

  /** A call that must answer `status`; returns the JSON body (or null for 204). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON for chained API calls
  async ok<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    data?: unknown,
    status = 200,
  ): Promise<T> {
    const res = await this.call(method, url, data);
    expect(res.status(), `${method} ${url}: ${(await res.text()).slice(0, 300)}`).toBe(status);
    return (res.status() === 204 ? null : await res.json()) as T;
  }

  /** A signed upload, as the app does it (kind product, logo or feedback). */
  async upload(kind: 'product' | 'logo' | 'feedback', rgb: [number, number, number]) {
    const bytes = realPng(600, 600, rgb);
    const up = await this.ok('POST', '/api/uploads', {
      kind,
      contentType: 'image/png',
      size: bytes.length,
    });
    const put = await this.request.fetch(up.url, {
      method: 'PUT',
      headers: up.headers,
      data: bytes,
    });
    expect(put.status(), 'upload PUT').toBeLessThan(300);
    return up.key as string;
  }

  async photo(rgb: [number, number, number]) {
    const objectKey = await this.upload('product', rgb);
    const thumbKey = await this.upload('product', rgb);
    return { objectKey, thumbKey, width: 600, height: 600 };
  }

  async action(orderId: string, body: Record<string, unknown>) {
    return this.ok('POST', `/api/orders/${orderId}/actions`, body);
  }

  async latestOrder(): Promise<{ id: string; number: number; status: string }> {
    const list = await this.ok('GET', '/api/orders?tab=all');
    return list.orders[0];
  }
}

/** The order token from a seller's order detail (its buyer link), masked. */
export function tokenOf(order: { link: string }): string {
  const token = order.link.split('/o/')[1]!;
  mask(token);
  return token;
}

// Ops and jobs, the way their workflows call them -------------------------------------------

export async function ops(request: APIRequestContext, url: string, data: unknown) {
  const res = await request.post(url, {
    data,
    headers: { authorization: `Bearer ${env.opsSecret}` },
  });
  expect(res.status(), `${url}: ${(await res.text()).slice(0, 300)}`).toBe(200);
  return res.json();
}

export async function cron(request: APIRequestContext, job: string, data?: unknown) {
  const res = await request.post(`/api/cron/${job}`, {
    data,
    headers: { authorization: `Bearer ${env.cronSecret}`, 'x-oda-actor': 'staging-regression' },
    timeout: 90_000,
  });
  expect(res.status(), `cron ${job}`).toBe(200);
  return res.json();
}
