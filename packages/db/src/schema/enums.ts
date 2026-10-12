import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ACCOUNT_REF_MODES,
  ACTORS,
  BUSINESS_TYPES,
  CANCEL_REASONS,
  DELIVERY_METHODS,
  FULFILMENTS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_ACCOUNT_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  SENT_METHODS,
} from '@oda/shared';

// Order enums take their values from the shared state machine so the two can't drift.
export const orderStatus = pgEnum('order_status', ORDER_STATUSES);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const orderSource = pgEnum('order_source', ORDER_SOURCES);
export const sentMethod = pgEnum('sent_method', SENT_METHODS);
export const cancelReason = pgEnum('cancel_reason', CANCEL_REASONS);
export const eventActor = pgEnum('event_actor', ACTORS);
export const cancelledBy = pgEnum('cancelled_by', ['buyer', 'seller', 'system']);
export const fulfilment = pgEnum('fulfilment', FULFILMENTS);
export const claimOutcome = pgEnum('claim_outcome', ['pending', 'confirmed', 'not_found']);

// Seller-editable enums share their values with the write whitelists in @oda/shared.
export const businessType = pgEnum('business_type', BUSINESS_TYPES);
export const paymentAccountType = pgEnum('payment_account_type', PAYMENT_ACCOUNT_TYPES);
export const accountRefMode = pgEnum('account_ref_mode', ACCOUNT_REF_MODES);
export const verificationStatus = pgEnum('verification_status', [
  'unverified',
  'pending',
  'verified',
  'rejected',
]);
export const deliveryMethod = pgEnum('delivery_method', DELIVERY_METHODS);
export const productStatus = pgEnum('product_status', PRODUCT_STATUSES);

export const notificationType = pgEnum('notification_type', [
  'new_order',
  'payment_claimed',
  'switched_to_pod',
  'buyer_cancelled',
  'order_expired',
  'new_review',
]);
export const feedbackKind = pgEnum('feedback_kind', [
  'idea',
  'broken',
  'confusing',
  'love',
  'problem',
]);
export const ticketStatus = pgEnum('ticket_status', ['new', 'in_progress', 'closed']);
