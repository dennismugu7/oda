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
// Logs never contain a subject, body, link, code or key (decision #45): only the email's
// kind and the recipient's domain.

/** What the email is, for logs (the subject can contain the code). */
export type EmailKind = 'verification-code' | 'reset-link';

export interface Email {
  kind: EmailKind;
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

/** Masks anything secret-looking in text that may reach a log or an error message. */
export function redact(text: string): string {
  return text
    .replace(/re_[A-Za-z0-9_]+/g, '[key]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/token=[^\s&"']+/gi, 'token=[token]')
    .replace(/\b\d{6}\b/g, '[code]');
}

/** For logs: the recipient's domain only. */
const domainOf = (email: string) => email.split('@')[1] ?? 'unknown';

export class EmailSendError extends Error {
  constructor(kind: EmailKind, reason: string) {
    super(`Could not send the ${kind} email: ${redact(reason)}`);
    this.name = 'EmailSendError';
  }
}

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
      console.info(`[email] ${email.kind} → @${domainOf(email.to)} (saved to the outbox)`);
      return;
    case 'resend':
      try {
        await sendWithResend(sent, config.resendApiKey!);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const failure = new EmailSendError(email.kind, reason);
        console.error(`[email] ${email.kind} → @${domainOf(email.to)} failed: ${failure.message}`);
        throw failure;
      }
      return;
  }
}

export const RESEND_TIMEOUT_MS = 10_000;

/** Resend's REST API with fetch: one call, no SDK dependency. */
async function sendWithResend(email: SentEmail, apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
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
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new Error(timedOut ? 'Resend did not answer within 10 s' : 'Resend could not be reached');
  }
  if (!res.ok) {
    // Resend's error names the problem (e.g. an unverified domain); only its name and
    // message are kept, redacted.
    const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
    throw new Error(
      `Resend refused it (${res.status}${body?.name ? ` ${body.name}` : ''}): ${(body?.message ?? '').slice(0, 200)}`,
    );
  }
}
