import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { shops } from './accounts';
import { products } from './catalogue';
import { createdAt, id, tstz, updatedAt } from './columns';
import {
  cancelReason,
  cancelledBy,
  claimOutcome,
  eventActor,
  fulfilment,
  orderSource,
  orderStatus,
  paymentMethod,
  paymentStatus,
  sentMethod,
} from './enums';

/**
 * Status and payment_status change only through transitionOrder() (apps/web/server/orders.ts);
 * a trigger rejects any other UPDATE of those columns (migration 0002).
 */
export const orders = pgTable(
  'orders',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    /** Display label only (#1042), sequential per shop. */
    number: integer('number').notNull(),
    /** 12 random URL-safe characters: the only way a buyer reaches an order. */
    publicToken: text('public_token').notNull().unique(),
    idempotencyKey: text('idempotency_key').unique(),
    status: orderStatus('status').notNull(),
    paymentMethod: paymentMethod('payment_method').notNull(),
    paymentStatus: paymentStatus('payment_status').notNull().default('unpaid'),
    buyerName: text('buyer_name').notNull(),
    buyerPhone: text('buyer_phone').notNull(),
    buyerWhatsapp: boolean('buyer_whatsapp').notNull().default(true),
    buyerEmail: text('buyer_email'),
    fulfilment: fulfilment('fulfilment').notNull(),
    /** Same-shop foreign key added in migration 0002 (on delete set null). */
    deliveryAreaId: uuid('delivery_area_id'),
    deliveryAreaName: text('delivery_area_name'),
    addressText: text('address_text'),
    sentMethod: sentMethod('sent_method'),
    riderPhone: text('rider_phone'),
    subtotal: integer('subtotal').notNull(),
    deliveryFee: integer('delivery_fee').notNull(),
    total: integer('total').notNull(),
    /** {type, number, name, accountRef?} at order time. */
    paymentAccountSnapshot: jsonb('payment_account_snapshot'),
    mpesaCode: text('mpesa_code'),
    source: orderSource('source').notNull().default('direct'),
    cancelReason: cancelReason('cancel_reason'),
    cancelNote: text('cancel_note'),
    cancelledBy: cancelledBy('cancelled_by'),
    placedAt: tstz('placed_at').notNull().defaultNow(),
    claimedAt: tstz('claimed_at'),
    confirmedAt: tstz('confirmed_at'),
    paidAt: tstz('paid_at'),
    sentAt: tstz('sent_at'),
    deliveredAt: tstz('delivered_at'),
    cancelledAt: tstz('cancelled_at'),
    refundedAt: tstz('refunded_at'),
    /** When the order last entered awaiting_payment; the 48h expiry counts from here (decision #34). */
    awaitingPaymentSince: tstz('awaiting_payment_since'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('orders_shop_number').on(t.shopId, t.number),
    // Lets claims, reviews and notifications reference (order_id, shop_id).
    uniqueIndex('orders_id_shop_id').on(t.id, t.shopId),
    index('orders_shop_status_idx').on(t.shopId, t.status, t.placedAt.desc()),
    index('orders_shop_confirmed_idx').on(t.shopId, t.confirmedAt),
    index('orders_shop_buyer_phone_idx').on(t.shopId, t.buyerPhone),
    index('orders_expiry_idx')
      .on(t.awaitingPaymentSince)
      .where(sql`${t.status} = 'awaiting_payment' and ${t.source} <> 'manual'`),
    check(
      'orders_money',
      sql`${t.subtotal} >= 0 and ${t.deliveryFee} >= 0 and ${t.total} = ${t.subtotal} + ${t.deliveryFee}`,
    ),
    check('orders_number', sql`${t.number} > 0`),
    check(
      'orders_pickup_has_no_area',
      sql`${t.fulfilment} = 'delivery' or ${t.deliveryAreaId} is null`,
    ),
  ],
);

/** Snapshot of each line at order time. */
export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    nameSnapshot: text('name_snapshot').notNull(),
    size: text('size'),
    colour: text('colour'),
    unitPrice: integer('unit_price').notNull(),
    qty: integer('qty').notNull(),
    coverPathSnapshot: text('cover_path_snapshot'),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    index('order_items_product_id_idx').on(t.productId),
    check('order_items_qty', sql`${t.qty} between 1 and 99`),
    check('order_items_unit_price', sql`${t.unitPrice} >= 0`),
  ],
);

/** History of submitted M-Pesa codes; (shop_id, mpesa_code) powers the duplicate check. */
export const paymentClaims = pgTable(
  'payment_claims',
  {
    id: id(),
    /** (order_id, shop_id) → orders(id, shop_id), added in migration 0002. */
    orderId: uuid('order_id').notNull(),
    shopId: uuid('shop_id').notNull(),
    mpesaCode: text('mpesa_code').notNull(),
    rawMessage: text('raw_message'),
    outcome: claimOutcome('outcome').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [
    index('payment_claims_shop_code_idx').on(t.shopId, t.mpesaCode),
    index('payment_claims_order_id_idx').on(t.orderId),
  ],
);

/** Audit log of every transition. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Null for the creation event. */
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    actor: eventActor('actor').notNull(),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('order_events_order_id_idx').on(t.orderId, t.createdAt)],
);
