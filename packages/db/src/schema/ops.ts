import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles, shops } from './accounts';
import { createdAt, id, tstz, updatedAt } from './columns';
import { orders } from './orders';
import { feedbackKind, notificationType, orderSource, ticketStatus } from './enums';

/** One row per shop, day and source; a visitor is counted once per day (cookie). */
export const shopVisitsDaily = pgTable(
  'shop_visits_daily',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    source: orderSource('source').notNull(),
    visits: integer('visits').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.day, t.source] }),
    check('shop_visits_daily_visits', sql`${t.visits} >= 0`),
  ],
);

/**
 * In-app notifications. (order_id, shop_id) and (review_id, shop_id) foreign keys are added
 * in migration 0002 so a notification can't point at another shop's order or review.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    orderId: uuid('order_id'),
    reviewId: uuid('review_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_shop_idx').on(t.shopId, t.createdAt.desc()),
    index('notifications_unread_idx')
      .on(t.shopId)
      .where(sql`${t.readAt} is null`),
  ],
);

/** From sellers (Help → Suggest an idea / Report a problem). */
export const feedback = pgTable(
  'feedback',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    kind: feedbackKind('kind').notNull(),
    message: text('message').notNull(),
    screenshotPath: text('screenshot_path'),
    replyOnWhatsapp: boolean('reply_on_whatsapp').notNull().default(false),
    status: ticketStatus('status').notNull().default('new'),
    adminNote: text('admin_note'),
    /** The daily support digest mailed it (decisions #72 b, #74 h). */
    notifiedAt: tstz('notified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('feedback_status_idx').on(t.status, t.createdAt)],
);

/** From buyers, on the order page. */
export const reports = pgTable(
  'reports',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    contactPhone: text('contact_phone'),
    status: ticketStatus('status').notNull().default('new'),
    adminNote: text('admin_note'),
    /** The daily support digest mailed it (decisions #72 b, #74 h). */
    notifiedAt: tstz('notified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

/**
 * From the web form at /delete-account (decision #72 c): the emailed confirm link's token is
 * stored only as its sha-256 hash; single use (`confirmed_at`), valid for 1 hour.
 */
export const deletionRequests = pgTable(
  'deletion_requests',
  {
    id: id(),
    email: text('email').notNull(),
    shopSlug: text('shop_slug'),
    reason: text('reason'),
    status: ticketStatus('status').notNull().default('new'),
    processedAt: tstz('processed_at'),
    tokenHash: text('token_hash').unique(),
    expiresAt: tstz('expires_at'),
    confirmedAt: tstz('confirmed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('deletion_requests_status_idx').on(t.status, t.createdAt)],
);

/** Fixed-window counters, written only by rate_limit_hit() (migration 0002). */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: tstz('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index('rate_limits_window_idx').on(t.windowStart),
  ],
);

/**
 * Storage objects to delete (decision #52): replaced or rejected photos and logos. Rows are
 * written in the same transaction that drops the reference; the object is deleted right
 * after, and the row removed. Anything left (a failed delete) is retried by
 * /api/cron/purge (M8).
 */
export const storageDeletions = pgTable('storage_deletions', {
  objectKey: text('object_key').primaryKey(),
  createdAt: createdAt(),
});

/**
 * Audit of manual ops workflows (decision #73 c–d), e.g. removing a review. `shop_id` has no
 * foreign key so the record outlives a purged shop; `details` keeps a snapshot of what changed.
 */
export const opsEvents = pgTable(
  'ops_events',
  {
    id: id(),
    action: text('action').notNull(),
    shopId: uuid('shop_id'),
    targetId: uuid('target_id'),
    reason: text('reason').notNull(),
    /** The GitHub user who ran the workflow. */
    actor: text('actor').notNull(),
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('ops_events_created_idx').on(t.createdAt.desc())],
);

/**
 * Expo push tickets waiting for their receipt (M10 CP4, decision #85). Expo answers a send with
 * a ticket; whether the phone really got it (or the token is dead: DeviceNotRegistered) comes
 * later as a receipt. The hourly cron job reads the receipts, removes dead tokens from the
 * profile and deletes the rows; Expo keeps receipts for about a day, so older rows are dropped.
 */
export const pushTickets = pgTable(
  'push_tickets',
  {
    ticketId: text('ticket_id').primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_tickets_created_idx').on(t.createdAt)],
);
