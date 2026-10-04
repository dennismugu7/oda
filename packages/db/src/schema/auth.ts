import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt } from './columns';

// Better Auth's core tables (decision #34): prefixed auth_ because "user" is reserved in
// Postgres, with uuid ids. Field keys are the names Better Auth expects;
// apps/web/server/auth.test.ts fails if they drift from Better Auth's own schema.

export const authUser = pgTable('auth_user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSession = pgTable(
  'auth_session',
  {
    id: id(),
    expiresAt: tstz('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_session_user_id_idx').on(t.userId)],
);

export const authAccount = pgTable(
  'auth_account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tstz('access_token_expires_at'),
    refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_account_user_id_idx').on(t.userId)],
);

export const authVerification = pgTable(
  'auth_verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
);

/**
 * Sign-ups in progress (decision #49). Nothing exists in auth_user until the code is
 * entered: each attempt holds its own pending password hash and its own code (HMAC), and
 * only the attempt whose code is entered creates the account. Attempts older than 7 days
 * are deleted lazily (and by /api/cron/purge in M8).
 */
export const signupAttempts = pgTable(
  'signup_attempts',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** HMAC-SHA256 of `${id}:${code}`; null until a code has been sent (cooldown). */
    codeHash: text('code_hash'),
    codeExpiresAt: tstz('code_expires_at'),
    codeAttempts: integer('code_attempts').notNull().default(0),
    lastSentAt: tstz('last_sent_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('signup_attempts_email_idx').on(t.email),
    index('signup_attempts_created_at_idx').on(t.createdAt),
  ],
);
