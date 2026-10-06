import { describe, expect, it } from 'vitest';
import {
  hasWhatsAppStep,
  orderLinkMessage,
  waLink,
  whatsappMessage,
  type WhatsAppOrder,
} from './whatsapp';

const order: WhatsAppOrder = {
  buyerName: 'Wanjiku Mwangi',
  number: 1042,
  total: 2500,
  shopName: 'Amani Styles',
  link: 'https://oda.example/o/abcdefghijkl',
  paymentStatus: 'paid',
  sentMethod: null,
  riderPhone: null,
  pickupLocation: null,
  pickupHours: null,
};

describe('WhatsApp prefills', () => {
  it('build wa.me links with the message encoded', () => {
    expect(waLink('+254712345901')).toBe('https://wa.me/254712345901');
    expect(waLink('+254712345901', 'Hi & bye?')).toBe(
      'https://wa.me/254712345901?text=Hi%20%26%20bye%3F',
    );
  });

  it('has a message for each action with a WhatsApp step, each with the order link', () => {
    expect(whatsappMessage('confirmPayment', order)).toBe(
      'Hi Wanjiku, I’ve received your payment of KSh 2,500 for order #1042 from Amani Styles. I’ll let you know when it’s on the way. Track it here: https://oda.example/o/abcdefghijkl',
    );
    expect(whatsappMessage('paymentNotFound', { ...order, paymentStatus: 'unpaid' })).toContain(
      'can’t find your M-Pesa payment of KSh 2,500',
    );
    expect(
      whatsappMessage('markSent', { ...order, sentMethod: 'rider', riderPhone: '+254722000111' }),
    ).toBe(
      'Hi Wanjiku, your order #1042 from Amani Styles is on its way with a rider (0722 000 111). Track it here: https://oda.example/o/abcdefghijkl',
    );
    expect(whatsappMessage('markSent', { ...order, sentMethod: 'parcel' })).toContain(
      'has been sent by parcel service',
    );
    expect(
      whatsappMessage('markSent', {
        ...order,
        sentMethod: 'pickup',
        pickupLocation: 'Kilimani stall',
        pickupHours: 'Mon–Sat 9am–6pm',
      }),
    ).toContain('is ready for pickup at Kilimani stall, Mon–Sat 9am–6pm');
    expect(whatsappMessage('markDelivered', order)).toContain(order.link);
    // M7: buyer-placed orders get the review link; manual orders keep the order link (#73 i).
    expect(whatsappMessage('markDelivered', { ...order, reviewLink: `${order.link}/review` })).toBe(
      'Hi Wanjiku, thank you for order #1042 from Amani Styles! I hope you love it. Please rate your order here: https://oda.example/o/abcdefghijkl/review',
    );
    expect(whatsappMessage('markDelivered', { ...order, reviewLink: null })).toContain(
      'Your order: https://oda.example/o/abcdefghijkl',
    );
    expect(
      whatsappMessage('sellerCancel', { ...order, paymentStatus: 'refund_due' }, 'out_of_stock'),
    ).toBe(
      'Hi Wanjiku, sorry, I’ve had to cancel your order #1042 from Amani Styles because it’s out of stock. I’ll send your KSh 2,500 back to your M-Pesa. Details: https://oda.example/o/abcdefghijkl',
    );
    expect(
      whatsappMessage('sellerCancel', { ...order, paymentStatus: 'unpaid' }, 'cant_deliver'),
    ).not.toContain('M-Pesa');
  });

  it('has none for actions without a WhatsApp step', () => {
    expect(whatsappMessage('accept', order)).toBeNull();
    expect(whatsappMessage('markRefundSent', order)).toBeNull();
    expect(hasWhatsAppStep([{ kind: 'whatsapp' }])).toBe(true);
    expect(hasWhatsAppStep([{ kind: 'email', template: 'accepted' }])).toBe(false);
  });
});

describe('the manual order link message', () => {
  it('says pay when unpaid, track otherwise', () => {
    const base = {
      buyerName: 'Njeri Kamau',
      number: 1050,
      total: 3900,
      shopName: 'Amani Styles',
      link: 'https://x/o/abc',
    };
    expect(orderLinkMessage({ ...base, awaitingPayment: true })).toBe(
      'Hi Njeri, here’s your order #1050 from Amani Styles (KSh 3,900). Pay and track it here: https://x/o/abc',
    );
    expect(orderLinkMessage({ ...base, awaitingPayment: false })).toBe(
      'Hi Njeri, here’s your order #1050 from Amani Styles. Track it here: https://x/o/abc',
    );
  });
});
