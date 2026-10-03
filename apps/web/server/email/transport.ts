import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

// Where emails go (decision #43):
// - resend: the Resend API (staging, production). Needs RESEND_API_KEY and EMAIL_FROM.
// - file:   JSON files in OUTBOX_DIR, shown at /dev/outbox. Local development and Playwright.
// - memory: an in-process list for Vitest.
// Default: resend when RESEND_API_KEY is set, otherwise file (local) or an error on Vercel.
// Never file on Vercel: the outbox page must stay a local-only tool.

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SentEmail extends Email {
  id: string;
  from: string;
  sentAt: string;
}

const envSchema = z.object({
  EMAIL_TRANSPORT: z.enum(['resend', 'file', 'memory']).optional(),
  EMAIL_FROM: z.string().min(3).default('oda <hello@localhost>'),
  RESEND_API_KEY: z.string().optional(),
  OUTBOX_DIR: z.string().default('.outbox'),
  VERCEL: z.string().optional(),
});

export type Transport = 'resend' | 'file' | 'memory';

/** True on any Vercel deployment (Preview or Production), where VERCEL=1 is always set. */
export function isDeployed(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.VERCEL;
}

export function emailConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const transport: Transport =
    parsed.EMAIL_TRANSPORT ??
    (parsed.RESEND_API_KEY ? 'resend' : isDeployed(env) ? 'resend' : 'file');
  if (isDeployed(env) && transport !== 'resend') {
    throw new Error('EMAIL_TRANSPORT must be resend on Vercel');
  }
  if (transport === 'resend') {
    if (!parsed.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
    if (!env.EMAIL_FROM) throw new Error('EMAIL_FROM is not set');
  }
  return {
    transport,
    from: parsed.EMAIL_FROM,
    resendApiKey: parsed.RESEND_API_KEY,
    outboxDir: path.resolve(parsed.OUTBOX_DIR),
  };
}

const memoryOutbox: SentEmail[] = [];

/** Vitest only: the emails "sent" with the memory transport, oldest first. */
export const testOutbox = {
  all: (): readonly SentEmail[] => memoryOutbox,
  last: (to?: string) => memoryOutbox.findLast((e) => !to || e.to === to),
  clear: () => {
    memoryOutbox.length = 0;
  },
};

export async function sendEmail(email: Email): Promise<void> {
  const config = emailConfig();
  const sent: SentEmail = {
    ...email,
    id: randomUUID(),
    from: config.from,
    sentAt: new Date().toISOString(),
  };
  switch (config.transport) {
    case 'memory':
      memoryOutbox.push(sent);
      return;
    case 'file':
      await mkdir(config.outboxDir, { recursive: true });
      // Sortable names: newest last.
      await writeFile(
        path.join(config.outboxDir, `${Date.now()}-${sent.id}.json`),
        JSON.stringify(sent, null, 2),
      );
      console.info(`[email] ${email.subject} → ${email.to} (saved to the outbox)`);
      return;
    case 'resend':
      await sendWithResend(sent, config.resendApiKey!);
      return;
  }
}

/** Resend's REST API with fetch: one call, no SDK dependency. */
async function sendWithResend(email: SentEmail, apiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      // Retries of the same email are sent once.
      'idempotency-key': email.id,
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // The body names the problem (e.g. an unverified domain); it never contains the key.
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend refused the email (${res.status}): ${detail.slice(0, 300)}`);
  }
}
