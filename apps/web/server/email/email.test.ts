import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OutboxPage from '@/app/dev/outbox/page';
import { devOutboxEnabled, readOutbox } from './outbox';
import {
  orderCancelledEmail,
  orderReceiptEmail,
  resetPasswordEmail,
  verificationCodeEmail,
} from './templates';
import { emailConfig, EmailSendError, redact, RESEND_TIMEOUT_MS, sendEmail } from './transport';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('buyer order emails (M5)', () => {
  const order = {
    to: 'w@example.test',
    shopName: 'Amani <b>Styles</b>',
    number: 1042,
    buyerName: 'Wanjiku <script>',
    paymentMethod: 'pay_before' as const,
    fulfilment: 'delivery' as const,
    deliveryAreaName: 'CBD',
    items: [{ name: 'Wrap dress', size: 'M', colour: 'Maroon', qty: 2, unitPrice: 2500 }],
    subtotal: 5000,
    deliveryFee: 0,
    total: 5000,
    link: 'https://oda-eta.vercel.app/o/AbCdEfGhIjKl',
  };

  it('the receipt has the items, total, next step and order link, with names escaped', () => {
    const mail = orderReceiptEmail(order);
    expect(mail.kind).toBe('order-receipt');
    expect(mail.subject).toBe('Your order #1042 from Amani <b>Styles</b>');
    expect(mail.text).toContain('Wrap dress — Maroon · Size M × 2: KSh 5,000');
    expect(mail.text).toContain('Delivery (CBD): Free');
    expect(mail.text).toContain('Pay KSh 5,000 to Amani <b>Styles</b> on M-Pesa');
    expect(mail.html).toContain('href="https://oda-eta.vercel.app/o/AbCdEfGhIjKl"');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Styles');
  });

  it('"you cancelled" mentions a refund only after a claim', () => {
    expect(orderCancelledEmail({ ...order, claimed: false }).text).toContain(
      'You haven’t been charged',
    );
    expect(orderCancelledEmail({ ...order, claimed: true }).text).toContain(
      'send it back to your M-Pesa',
    );
  });
});

describe('templates', () => {
  const code = verificationCodeEmail('amani@example.test', '482913');
  const reset = resetPasswordEmail(
    'amani@example.test',
    'https://oda-eta.vercel.app/reset-password?token=abc_123',
  );

  it('04: puts the 6-digit code in the subject, the HTML and the text', () => {
    expect(code.subject).toBe('482913 is your oda code');
    expect(code.html).toContain('482913');
    expect(code.text).toContain('482913');
    expect(code.text).toContain('10 minutes');
  });

  it('06: links to the web reset page', () => {
    expect(reset.subject).toBe('Reset your oda password');
    expect(reset.html).toContain('href="https://oda-eta.vercel.app/reset-password?token=abc_123"');
    expect(reset.text).toContain('https://oda-eta.vercel.app/reset-password?token=abc_123');
  });

  it('writes the brand in lowercase and has no footer links yet (decision #43)', () => {
    for (const email of [code, reset]) {
      for (const body of [email.subject, email.html, email.text]) {
        expect(body).not.toMatch(/\bOda\b/);
      }
      expect(email.html).not.toMatch(/contact us/i);
      expect(email.html).not.toMatch(/facebook|instagram|twitter|youtube|linkedin|discord/i);
      expect(email.html).toContain('The oda team');
    }
  });

  it('escapes what it puts into HTML', () => {
    const evil = resetPasswordEmail('a@example.test', 'https://x.test/?a="><script>1</script>');
    expect(evil.html).not.toContain('<script>');
    expect(evil.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('transport config', () => {
  it('uses the file outbox locally without a Resend key', () => {
    expect(emailConfig({ NODE_ENV: 'development' }).transport).toBe('file');
  });

  it('uses Resend when a key is set', () => {
    const config = emailConfig({
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'oda <hello@mail.oda.mugu-labs.com>',
    });
    expect(config).toMatchObject({
      transport: 'resend',
      from: 'oda <hello@mail.oda.mugu-labs.com>',
    });
  });

  it('refuses anything but Resend on Vercel, and needs the key and the sender', () => {
    expect(() =>
      emailConfig({ NODE_ENV: 'production', VERCEL: '1', EMAIL_TRANSPORT: 'file' }),
    ).toThrow(/must be resend/);
    expect(() => emailConfig({ NODE_ENV: 'production', VERCEL: '1' })).toThrow(/RESEND_API_KEY/);
    expect(() =>
      emailConfig({ NODE_ENV: 'production', VERCEL: '1', RESEND_API_KEY: 're_test' }),
    ).toThrow(/EMAIL_FROM/);
  });

  it('sends through the Resend API with the configured sender', async () => {
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_FROM', 'oda <hello@mail.oda.mugu-labs.com>');
    const fetchMock = vi.fn(async () => Response.json({ id: 'email_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail(verificationCodeEmail('amani@example.test', '482913'));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'oda <hello@mail.oda.mugu-labs.com>',
      to: ['amani@example.test'],
      subject: '482913 is your oda code',
    });
  });

  describe('failures (decision #45)', () => {
    const KEY = 're_secret_key_123';
    const RESET_URL = 'https://oda-eta.vercel.app/reset-password#token=SeCrEtToKeN123';
    let logged: string[];

    beforeEach(() => {
      vi.stubEnv('EMAIL_TRANSPORT', 'resend');
      vi.stubEnv('RESEND_API_KEY', KEY);
      vi.stubEnv('EMAIL_FROM', 'oda <hello@mail.oda.mugu-labs.com>');
      logged = [];
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    });
    afterEach(() => vi.restoreAllMocks());

    async function failure(email = resetPasswordEmail('amani@example.test', RESET_URL)) {
      const error = await sendEmail(email).then(
        () => null,
        (e: unknown) => e as Error,
      );
      expect(error).toBeInstanceOf(EmailSendError);
      return { message: error!.message, logs: logged.join(' | ') };
    }

    function expectNoSecrets(text: string) {
      for (const secret of [KEY, 'SeCrEtToKeN123', '482913', 'amani@']) {
        expect(text).not.toContain(secret);
      }
    }

    it('names the problem when Resend refuses, without secrets', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json(
            {
              name: 'validation_error',
              message: `The mail.oda.mugu-labs.com domain is not verified. Key ${KEY}, link ${RESET_URL}`,
            },
            { status: 403 },
          ),
        ),
      );
      const { message, logs } = await failure();
      expect(message).toContain('reset-link email: Resend refused it (403 validation_error)');
      expect(message).toContain('domain is not verified');
      expect(logs).toContain('[email] reset-link → @example.test failed');
      expectNoSecrets(message);
      expectNoSecrets(logs);
    });

    it('gives up after 10 seconds', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          expect(init.signal).toBeInstanceOf(AbortSignal);
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }),
      );
      const { message, logs } = await failure(
        verificationCodeEmail('amani@example.test', '482913'),
      );
      expect(message).toBe(
        'Could not send the verification-code email: Resend did not answer within 10 s',
      );
      expect(RESEND_TIMEOUT_MS).toBe(10_000);
      expectNoSecrets(logs);
    });

    it('reports an unreachable Resend', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError(`fetch failed for ${RESET_URL}`);
        }),
      );
      const { message } = await failure();
      expect(message).toBe('Could not send the reset-link email: Resend could not be reached');
    });
  });

  it('sends a plain-text version alongside the HTML for both emails', async () => {
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_FROM', 'oda <hello@mail.oda.mugu-labs.com>');
    const fetchMock = vi.fn(async () => Response.json({ id: 'email_1' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(verificationCodeEmail('a@example.test', '482913'));
    await sendEmail(resetPasswordEmail('a@example.test', 'https://x.test/reset-password#token=t'));
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      const body = JSON.parse(init.body as string) as { html: string; text: string };
      expect(body.html).toMatch(/^<!doctype html>/);
      expect(body.text.length).toBeGreaterThan(50);
      expect(body.text).not.toContain('<');
    }
  });

  it('redacts keys, links, tokens and codes', () => {
    expect(redact('key re_AbC_123 link https://x.test/a?token=zz code 123456 and 2026')).toBe(
      'key [key] link [link] code [code] and 2026',
    );
    expect(redact('token=abc&x=1')).toBe('token=[token]&x=1');
  });
});

describe('dev outbox (decision #43)', () => {
  it('is on locally with the file transport', () => {
    expect(devOutboxEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it.each(['preview', 'production'])('is off on a Vercel %s deployment', (vercelEnv) => {
    for (const env of [
      { VERCEL: '1', VERCEL_ENV: vercelEnv },
      { VERCEL: '1', VERCEL_ENV: vercelEnv, EMAIL_TRANSPORT: 'file' },
      { VERCEL: '1', VERCEL_ENV: vercelEnv, RESEND_API_KEY: 're_x', EMAIL_FROM: 'oda <a@b.c>' },
    ]) {
      expect(devOutboxEnabled({ NODE_ENV: 'production', ...env })).toBe(false);
    }
  });

  it.each(['preview', 'production'])('the page is a 404 on a Vercel %s deployment', async (v) => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', v);
    vi.stubEnv('EMAIL_TRANSPORT', 'file');
    await expect(readOutbox()).resolves.toBeNull();
    await expect(OutboxPage()).rejects.toMatchObject({
      digest: expect.stringMatching(/404/),
    });
  });

  it('is off with the Resend transport, even locally', () => {
    expect(
      devOutboxEnabled({
        NODE_ENV: 'development',
        RESEND_API_KEY: 're_x',
        EMAIL_FROM: 'a <a@b.c>',
      }),
    ).toBe(false);
  });

  it('lists what the file transport wrote, newest first', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'oda-outbox-'));
    try {
      vi.stubEnv('EMAIL_TRANSPORT', 'file');
      vi.stubEnv('OUTBOX_DIR', dir);
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      await sendEmail(verificationCodeEmail('a@example.test', '111111'));
      await new Promise((r) => setTimeout(r, 5));
      await sendEmail(verificationCodeEmail('a@example.test', '222222'));
      // The log names the kind of email, never the code in its subject.
      expect(info.mock.calls.map((c) => c.join(' '))).toEqual([
        '[email] verification-code → @example.test (saved to the outbox)',
        '[email] verification-code → @example.test (saved to the outbox)',
      ]);
      info.mockRestore();
      const emails = await readOutbox();
      expect(emails?.map((e) => e.subject)).toEqual([
        '222222 is your oda code',
        '111111 is your oda code',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
