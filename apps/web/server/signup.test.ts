import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { lastCode, signupApi } from '@/test/signup';
import { handleAuthRequest } from './authRoute';
import { getDb } from './db';
import { testOutbox } from './email/transport';
import { cleanupOldAttempts, hashCode } from './signup';

// Seller sign-up with per-attempt codes and pending passwords (decision #49), through the
// HTTP routes, against oda_test.

const VICTIM = 'wanjiku@example.test';
const VICTIM_PASSWORD = 'victim-pass-2026';
const ATTACKER_PASSWORD = 'attacker-pass-2026';

beforeEach(async () => {
  await truncateAll(getDb());
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(getDb());
});

const db = () => getDb();

async function signIn(email: string, password: string) {
  const res = await handleAuthRequest(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '10.0.0.9' },
      body: JSON.stringify({ email, password }),
    }),
  );
  return res.status;
}

async function requestReset(email: string) {
  const res = await handleAuthRequest(
    new Request('http://localhost:3000/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '10.0.0.9' },
      body: JSON.stringify({ email }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

/** Moves every code sent to `email` into the past (the 60 s cooldown is per email). */
async function ageCodes(email: string, seconds = 61) {
  await db().execute(sql`
    update signup_attempts set last_sent_at = last_sent_at - make_interval(secs => ${seconds})
    where email = ${email} and last_sent_at is not null`);
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const users = () => db().select().from(schema.authUser);
const attempts = () => db().select().from(schema.signupAttempts);

describe('start', () => {
  it('creates no account: only an attempt, and emails a 6-digit code', async () => {
    const res = await signupApi.start({
      email: ' Wanjiku@Example.test ',
      password: VICTIM_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      email: VICTIM,
      resumed: false,
      codeSent: true,
      retryAfter: 0,
    });
    expect(await users()).toHaveLength(0);
    expect(await attempts()).toHaveLength(1);
    expect(lastCode(VICTIM)).toMatch(/^\d{6}$/);
    // The attempt id is only for the phone: never in the email.
    const email = testOutbox.last(VICTIM)!;
    expect(email.html + email.text).not.toContain(res.json.attemptId!);
  });

  it('enforces the password rules and refuses an email that has a shop', async () => {
    const weak = await signupApi.start({ email: VICTIM, password: 'nonumbers' });
    expect(weak.status).toBe(422);
    expect(weak.json.error).toMatchObject({
      code: 'WEAK_PASSWORD',
      message: 'Include at least one number.',
    });

    const started = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    await signupApi.verify(started.json.attemptId!, lastCode(VICTIM));
    const again = await signupApi.start({ email: VICTIM, password: 'another2026' });
    expect(again.status).toBe(409);
    expect(again.json.error).toMatchObject({
      code: 'EMAIL_HAS_ACCOUNT',
      message: 'This email already has a shop. Sign in?',
    });
  });

  it('resumes from the same phone: same attempt, the newest password, no extra email inside 60 s', async () => {
    const first = await signupApi.start({ email: VICTIM, password: 'first-pass-1' });
    const again = await signupApi.start({
      email: VICTIM,
      password: VICTIM_PASSWORD,
      attemptId: first.json.attemptId,
    });
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({
      attemptId: first.json.attemptId,
      resumed: true,
      codeSent: false,
    });
    expect(again.json.retryAfter).toBeGreaterThan(55);
    expect(testOutbox.all()).toHaveLength(1);

    await signupApi.verify(first.json.attemptId!, lastCode(VICTIM));
    expect(await signIn(VICTIM, VICTIM_PASSWORD)).toBe(200);
    expect(await signIn(VICTIM, 'first-pass-1')).toBe(401);
  });

  it('stores codes as HMAC-SHA256 keyed from the server secret, never plain or plainly hashed', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const code = lastCode(VICTIM);
    const [row] = await attempts();
    expect(row!.codeHash).toBe(hashCode(res.json.attemptId!, code));
    expect(row!.codeHash).not.toContain(code);
    expect(row!.codeHash).not.toBe(createHash('sha256').update(code).digest('hex'));
    expect(row!.codeHash).not.toBe(
      createHash('sha256').update(`${res.json.attemptId}:${code}`).digest('hex'),
    );
    expect(row!.passwordHash).not.toContain(VICTIM_PASSWORD);
  });
});

describe('verify', () => {
  it('creates the account (user, credential, profile) with this attempt’s password', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const verified = await signupApi.verify(res.json.attemptId!, lastCode(VICTIM));
    expect(verified.status).toBe(200);

    const [user] = await users();
    expect(user).toMatchObject({ email: VICTIM, emailVerified: true });
    const accounts = await db().select().from(schema.authAccount);
    expect(accounts).toEqual([
      expect.objectContaining({ userId: user!.id, accountId: user!.id, providerId: 'credential' }),
    ]);
    const profile = await db().query.profiles.findFirst({
      where: eq(schema.profiles.id, user!.id),
    });
    expect(profile).toBeTruthy();
    expect(await attempts()).toHaveLength(0);
    expect(await signIn(VICTIM, VICTIM_PASSWORD)).toBe(200);
  });

  it('rejects a wrong code, then kills the code after 3 wrong tries', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const code = lastCode(VICTIM);
    for (let i = 0; i < 3; i++) {
      const bad = await signupApi.verify(res.json.attemptId!, wrong(code));
      expect(bad.json.error?.code).toBe('INVALID_OTP');
    }
    const right = await signupApi.verify(res.json.attemptId!, code);
    expect(right.status).toBe(403);
    expect(right.json.error?.code).toBe('TOO_MANY_ATTEMPTS');
    expect(await users()).toHaveLength(0);
  });

  it('rejects an expired code (10 minutes)', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const [row] = await attempts();
    const minutes = (row!.codeExpiresAt!.getTime() - Date.now()) / 60_000;
    // Set by the database clock, which can run a moment ahead of Node's.
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThan(10.05);
    await db().execute(
      sql`update signup_attempts set code_expires_at = now() - interval '1 second'`,
    );
    const late = await signupApi.verify(res.json.attemptId!, lastCode(VICTIM));
    expect(late.json.error?.code).toBe('OTP_EXPIRED');
  });

  it('treats an unknown attempt as expired', async () => {
    const res = await signupApi.verify('00000000-0000-4000-8000-000000000000', '123456');
    expect(res.status).toBe(404);
    expect(res.json.error?.message).toBe('This sign-up has expired. Start again.');
  });
});

describe('pre-account takeover (decision #49)', () => {
  it("only the victim's password works when an attacker started a sign-up with their email", async () => {
    // The attacker starts first with their own password; the code goes to the victim's inbox.
    const attacker = await signupApi.start(
      { email: VICTIM, password: ATTACKER_PASSWORD },
      '10.6.6.6',
    );
    const attackerCode = lastCode(VICTIM);
    expect(await users()).toHaveLength(0);

    // The victim signs up on their phone (a new attempt: the code waits out the cooldown).
    const victim = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD }, '10.1.1.1');
    expect(victim.json.attemptId).not.toBe(attacker.json.attemptId);
    expect(victim.json.codeSent).toBe(false);
    await ageCodes(VICTIM);
    expect((await signupApi.resend(victim.json.attemptId!, '10.1.1.1')).status).toBe(200);
    const victimCode = lastCode(VICTIM);

    // A code from the other attempt never works for this one.
    const cross = await signupApi.verify(victim.json.attemptId!, attackerCode, '10.1.1.1');
    expect(cross.json.error?.code).toBe('INVALID_OTP');

    expect((await signupApi.verify(victim.json.attemptId!, victimCode, '10.1.1.1')).status).toBe(
      200,
    );
    expect(await signIn(VICTIM, VICTIM_PASSWORD)).toBe(200);
    expect(await signIn(VICTIM, ATTACKER_PASSWORD)).toBe(401);

    // The attacker's attempt is gone; even with its code it can't touch the account.
    const late = await signupApi.verify(attacker.json.attemptId!, attackerCode, '10.6.6.6');
    expect(late.status).toBe(409);
    expect(late.json.error?.message).toBe('This email already has a shop. Sign in?');
    expect(await attempts()).toHaveLength(0); // and the attempt is deleted
    expect(await signIn(VICTIM, ATTACKER_PASSWORD)).toBe(401);
  });

  it('a verify that loses the race to another attempt gets "already has a shop"', async () => {
    const a = await signupApi.start({ email: VICTIM, password: 'pass-a-2026' }, '10.0.0.1');
    const codeA = lastCode(VICTIM);
    const b = await signupApi.start({ email: VICTIM, password: 'pass-b-2026' }, '10.0.0.2');
    await ageCodes(VICTIM);
    await signupApi.resend(b.json.attemptId!, '10.0.0.2');
    const codeB = lastCode(VICTIM);

    const [ra, rb] = await Promise.all([
      signupApi.verify(a.json.attemptId!, codeA, '10.0.0.1'),
      signupApi.verify(b.json.attemptId!, codeB, '10.0.0.2'),
    ]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect([ra, rb].find((r) => r.status === 409)!.json.error?.message).toBe(
      'This email already has a shop. Sign in?',
    );
    expect(await users()).toHaveLength(1);
    expect(await attempts()).toHaveLength(0);
  });

  it('two verifies of the same attempt create one account', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const code = lastCode(VICTIM);
    const results = await Promise.all([
      signupApi.verify(res.json.attemptId!, code),
      signupApi.verify(res.json.attemptId!, code),
    ]);
    // One account; the other request is refused: "already has a shop" (409) when it reached
    // the lock, or "expired" (404) when the attempt was already used before it started.
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([404, 409]).toContain(statuses[1]);
    expect(await users()).toHaveLength(1);
  });
});

describe('a mid-sign-up email has no account', () => {
  it('sign-in fails like an unknown email; forgot password sends nothing and answers the same', async () => {
    await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    testOutbox.clear();
    expect(await signIn(VICTIM, VICTIM_PASSWORD)).toBe(401);
    const pending = await requestReset(VICTIM);
    const unknown = await requestReset('nobody@example.test');
    expect(pending).toEqual(unknown);
    expect(pending.status).toBe(200);
    expect(testOutbox.all()).toHaveLength(0);
  });
});

describe('limits', () => {
  it('waits 60 seconds between codes to an email, then sends a new one that replaces the old', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const first = lastCode(VICTIM);
    const tooSoon = await signupApi.resend(res.json.attemptId!);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.json.error?.retryAfter).toBeGreaterThan(55);
    await ageCodes(VICTIM);
    expect((await signupApi.resend(res.json.attemptId!)).status).toBe(200);
    const second = lastCode(VICTIM);
    if (second !== first) {
      expect((await signupApi.verify(res.json.attemptId!, first)).json.error?.code).toBe(
        'INVALID_OTP',
      );
    }
    expect((await signupApi.verify(res.json.attemptId!, second)).status).toBe(200);
  });

  it('sends at most 5 codes per email per hour', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD }); // 1
    for (let i = 0; i < 4; i++) {
      await ageCodes(VICTIM);
      expect((await signupApi.resend(res.json.attemptId!)).status, `code ${i + 2}`).toBe(200);
    }
    await ageCodes(VICTIM);
    const sixth = await signupApi.resend(res.json.attemptId!);
    expect(sixth.status).toBe(429);
    expect(sixth.json.error?.message).toMatch(/^Too many codes\./);
  });

  it('allows 10 code checks per email per hour', async () => {
    const res = await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    for (let i = 0; i < 10; i++) {
      expect((await signupApi.verify(res.json.attemptId!, '000000')).status).not.toBe(429);
    }
    expect((await signupApi.verify(res.json.attemptId!, lastCode(VICTIM))).status).toBe(429);
  });

  it('allows 30 sign-up starts per IP per hour', async () => {
    for (let i = 0; i < 30; i++) {
      expect(
        (await signupApi.start({ email: `s${i}@example.test`, password: VICTIM_PASSWORD })).status,
      ).toBe(200);
    }
    const res = await signupApi.start({ email: 's30@example.test', password: VICTIM_PASSWORD });
    expect(res.status).toBe(429);
    expect(res.json.error?.message).toMatch(/^Too many new accounts\./);
  });
});

describe('cleanup (decision #49)', () => {
  it('each start deletes attempts older than 7 days, and old attempts no longer work', async () => {
    const old = await signupApi.start({ email: 'old@example.test', password: VICTIM_PASSWORD });
    const oldCode = lastCode('old@example.test');
    await db().execute(sql`update signup_attempts set created_at = now() - interval '8 days'`);
    expect((await signupApi.verify(old.json.attemptId!, oldCode)).status).toBe(404);

    await signupApi.start({ email: VICTIM, password: VICTIM_PASSWORD });
    const left = await attempts();
    expect(left.map((a) => a.email)).toEqual([VICTIM]);
  });

  it('deletes in small batches', async () => {
    await db().execute(sql`
      insert into signup_attempts (email, password_hash, created_at)
      select 'bulk' || g || '@example.test', 'x', now() - interval '30 days'
      from generate_series(1, 150) g`);
    expect(await cleanupOldAttempts()).toBe(100);
    expect(await cleanupOldAttempts()).toBe(50);
    expect(await cleanupOldAttempts()).toBe(0);
  });
});
