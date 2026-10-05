import { describe, expect, it } from 'vitest';
import { buyerActions, checkoutInput, codeInput, reportInput, stripLinks } from './checkout';
import type { OrderState } from './orderMachine';

const valid = {
  idempotencyKey: 'abcdefghijklmnop1234',
  buyer: { name: 'Wanjiku Kamau', phone: '0712 345 678', whatsapp: true, email: '' },
  fulfilment: {
    kind: 'delivery',
    areaId: '7a4c1c5e-6b1f-4f7e-9a51-2a0d0e6d1f10',
    addressText: 'Rhapta Rd, near Sarit',
  },
  payment: 'pay_now',
  lines: [{ productId: '5f6a9d2e-3c1b-4b7a-8e0f-1d2c3b4a5f60', qty: 2, size: 'M', colour: null }],
  expectedTotal: 5200,
  source: 'tt',
};

describe('checkoutInput', () => {
  it('accepts a normal checkout and normalises it', () => {
    const parsed = checkoutInput.parse(valid);
    expect(parsed.buyer.phone).toBe('+254712345678');
    expect(parsed.buyer.email).toBeNull();
    expect(parsed.lines[0]).toEqual({
      productId: valid.lines[0]!.productId,
      qty: 2,
      size: 'M',
      colour: null,
    });
  });

  it('refuses fields the client must not send (prices, totals per line, status)', () => {
    expect(
      checkoutInput.safeParse({ ...valid, lines: [{ ...valid.lines[0], unitPrice: 1 }] }).success,
    ).toBe(false);
    expect(checkoutInput.safeParse({ ...valid, deliveryFee: 0 }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...valid, status: 'confirmed' }).success).toBe(false);
  });

  it('checks the phone, name, quantity, address and email', () => {
    const bad = (patch: object) => !checkoutInput.safeParse({ ...valid, ...patch }).success;
    expect(bad({ buyer: { ...valid.buyer, phone: '12345' } })).toBe(true);
    expect(bad({ buyer: { ...valid.buyer, name: ' ' } })).toBe(true);
    expect(bad({ buyer: { ...valid.buyer, email: 'not-an-email' } })).toBe(true);
    expect(bad({ lines: [{ ...valid.lines[0], qty: 0 }] })).toBe(true);
    expect(bad({ lines: [{ ...valid.lines[0], qty: 100 }] })).toBe(true);
    expect(bad({ lines: [] })).toBe(true);
    expect(bad({ fulfilment: { ...valid.fulfilment, addressText: '' } })).toBe(true);
    expect(bad({ idempotencyKey: 'short' })).toBe(true);
    expect(bad({ payment: 'card' })).toBe(true);
  });

  it('pickup needs no address', () => {
    expect(checkoutInput.safeParse({ ...valid, fulfilment: { kind: 'pickup' } }).success).toBe(
      true,
    );
  });

  it('strips links from the buyer name', () => {
    const parsed = checkoutInput.parse({
      ...valid,
      buyer: { ...valid.buyer, name: 'Wanjiku https://spam.example/x win.com prize' },
    });
    expect(parsed.buyer.name).toBe('Wanjiku prize');
    expect(stripLinks('Mr. Otieno www.bad.link')).toBe('Mr. Otieno');
    expect(stripLinks('Wanjiku K.')).toBe('Wanjiku K.');
  });
});

describe('codeInput and reportInput', () => {
  it('needs something to read', () => {
    expect(codeInput.safeParse({ message: '  ' }).success).toBe(false);
    expect(codeInput.parse({ message: ' SFK7Q2M9TX ' }).message).toBe('SFK7Q2M9TX');
  });

  it('reports have a length cap and an optional Kenyan phone', () => {
    expect(
      reportInput.parse({ message: 'Never arrived', contactPhone: '' }).contactPhone,
    ).toBeNull();
    expect(
      reportInput.parse({ message: 'Never arrived', contactPhone: '0712345678' }).contactPhone,
    ).toBe('+254712345678');
    expect(reportInput.safeParse({ message: 'x'.repeat(1001) }).success).toBe(false);
    expect(reportInput.safeParse({ message: 'Never arrived', contactPhone: '123' }).success).toBe(
      false,
    );
  });
});

describe('buyerActions', () => {
  const order = (patch: Partial<OrderState>): OrderState => ({
    status: 'awaiting_payment',
    paymentStatus: 'unpaid',
    paymentMethod: 'pay_before',
    source: 'wa',
    ...patch,
  });
  const open = { acceptsPayOnDelivery: true, closed: false };

  it('follows the machine', () => {
    expect(buyerActions(order({}), open)).toEqual(['submitCode', 'switchToPod', 'cancel']);
    expect(buyerActions(order({}), { ...open, acceptsPayOnDelivery: false })).toEqual([
      'submitCode',
      'cancel',
    ]);
    expect(
      buyerActions(
        order({ status: 'awaiting_acceptance', paymentMethod: 'pay_on_delivery' }),
        open,
      ),
    ).toEqual(['cancel']);
    expect(
      buyerActions(order({ status: 'payment_claimed', paymentStatus: 'claimed' }), open),
    ).toEqual(['cancel']);
    for (const status of ['confirmed', 'sent', 'delivered', 'cancelled'] as const) {
      expect(buyerActions(order({ status }), open)).toEqual([]);
    }
  });

  it('a closed shop allows nothing but a report', () => {
    expect(buyerActions(order({}), { ...open, closed: true })).toEqual([]);
  });
});
