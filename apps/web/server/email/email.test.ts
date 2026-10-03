import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OutboxPage from '@/app/dev/outbox/page';
import { devOutboxEnabled, readOutbox } from './outbox';
import { resetPasswordEmail, verificationCodeEmail } from './templates';
import { emailConfig, sendEmail } from './transport';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

  it('fails loudly when Resend refuses', async () => {
    vi.stubEnv('EMAIL_TRANSPORT', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_FROM', 'oda <hello@mail.oda.mugu-labs.com>');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 })),
    );
    await expect(sendEmail(resetPasswordEmail('a@example.test', 'https://x.test'))).rejects.toThrow(
      /403.*domain not verified/,
    );
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
      await sendEmail(verificationCodeEmail('a@example.test', '111111'));
      await new Promise((r) => setTimeout(r, 5));
      await sendEmail(verificationCodeEmail('a@example.test', '222222'));
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
