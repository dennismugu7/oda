import { formatKsh } from './money';
import type { SentMethod, SideEffect } from './orderMachine';
import { formatKePhone } from './phone';
import { firstName, type SellerActionType } from './sellerOrders';

// The pre-written WhatsApp messages the seller sends after an action (spec §5.4: "Tell {buyer}
// on WhatsApp" opens the seller's own WhatsApp; oda never sends WhatsApp messages itself in
// v1). One template per action whose side effects include `whatsapp` (order-lifecycle.md).

/** wa.me link for a Kenyan number in E.164, with an optional message. */
export function waLink(e164: string, text?: string): string {
  const number = e164.replace(/^\+/, '');
  return text
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${number}`;
}

export interface WhatsAppOrder {
  buyerName: string;
  number: number;
  total: number;
  shopName: string;
  /** The buyer's order page. */
  link: string;
  paymentStatus: 'unpaid' | 'claimed' | 'paid' | 'refund_due' | 'refunded';
  sentMethod: SentMethod | null;
  riderPhone: string | null;
  pickupLocation: string | null;
  pickupHours: string | null;
}

const CANCEL_SENTENCE: Record<string, string> = {
  out_of_stock: 'it’s out of stock',
  buyer_asked: 'you asked me to',
  payment_not_received: 'I didn’t receive the payment',
  cant_deliver: 'I can’t deliver to your area',
  other: 'I can’t fulfil it right now',
};

/**
 * The message for an action just saved, or null when the action has no WhatsApp step.
 * `order` is the order *after* the action. The delivered message links to the order page;
 * it becomes the review link in M7.
 */
export function whatsappMessage(
  action: SellerActionType,
  order: WhatsAppOrder,
  cancelReason?: string | null,
): string | null {
  const hi = `Hi ${firstName(order.buyerName)},`;
  const ref = `order #${order.number} from ${order.shopName}`;
  switch (action) {
    case 'confirmPayment':
      return `${hi} I’ve received your payment of ${formatKsh(order.total)} for ${ref}. I’ll let you know when it’s on the way. Track it here: ${order.link}`;
    case 'paymentNotFound':
      return `${hi} I can’t find your M-Pesa payment of ${formatKsh(order.total)} for ${ref} in my messages. Please check the code and send it again here: ${order.link}`;
    case 'markSent': {
      if (order.sentMethod === 'pickup') {
        const where = [order.pickupLocation, order.pickupHours].filter(Boolean).join(', ');
        return `${hi} your ${ref} is ready for pickup${where ? ` at ${where}` : ''}. Details: ${order.link}`;
      }
      const how =
        order.sentMethod === 'parcel'
          ? 'has been sent by parcel service'
          : `is on its way with a rider${order.riderPhone ? ` (${formatKePhone(order.riderPhone)})` : ''}`;
      return `${hi} your ${ref} ${how}. Track it here: ${order.link}`;
    }
    case 'markDelivered':
      return `${hi} thank you for ${ref}! I hope you love it. Your order: ${order.link}`;
    case 'sellerCancel': {
      const why = CANCEL_SENTENCE[cancelReason ?? 'other'] ?? CANCEL_SENTENCE.other;
      const money =
        order.paymentStatus === 'refund_due'
          ? ` I’ll send your ${formatKsh(order.total)} back to your M-Pesa.`
          : '';
      return `${hi} sorry, I’ve had to cancel your ${ref} because ${why}.${money} Details: ${order.link}`;
    }
    default:
      return null;
  }
}

/** True when the machine says this action has a WhatsApp step. */
export function hasWhatsAppStep(sideEffects: readonly SideEffect[]): boolean {
  return sideEffects.some((e) => e.kind === 'whatsapp');
}

/**
 * The message that sends a manual order's link to the buyer (17-new-order: "Send on WhatsApp").
 * Not paid yet: the link is where they pay; otherwise it's where they track the order.
 */
export function orderLinkMessage(o: {
  buyerName: string;
  number: number;
  total: number;
  shopName: string;
  link: string;
  awaitingPayment: boolean;
}): string {
  const hi = `Hi ${firstName(o.buyerName)},`;
  return o.awaitingPayment
    ? `${hi} here’s your order #${o.number} from ${o.shopName} (${formatKsh(o.total)}). Pay and track it here: ${o.link}`
    : `${hi} here’s your order #${o.number} from ${o.shopName}. Track it here: ${o.link}`;
}
