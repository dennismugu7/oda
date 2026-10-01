import { describe, expect, it } from 'vitest';
import { PricingError, priceOrder } from './pricing';

const area = (fee: number, freeDeliveryEligible = true) =>
  ({ kind: 'area', fee, freeDeliveryEligible }) as const;

describe('priceOrder', () => {
  it('sums lines and adds the area fee (order #1042: 1,200 + 1,100 + 200)', () => {
    expect(
      priceOrder({
        lines: [
          { unitPrice: 1200, qty: 1 },
          { unitPrice: 1100, qty: 1 },
        ],
        delivery: area(200),
        freeDeliveryThreshold: 5000,
      }),
    ).toEqual({ subtotal: 2300, deliveryFee: 200, total: 2500, freeDeliveryApplied: false });
  });

  it('multiplies by quantity', () => {
    expect(
      priceOrder({
        lines: [{ unitPrice: 1800, qty: 3 }],
        delivery: area(300),
        freeDeliveryThreshold: null,
      }).total,
    ).toBe(5700);
  });

  it('pickup is free', () => {
    const r = priceOrder({
      lines: [{ unitPrice: 2500, qty: 1 }],
      delivery: { kind: 'pickup' },
      freeDeliveryThreshold: null,
    });
    expect(r).toMatchObject({ deliveryFee: 0, total: 2500, freeDeliveryApplied: false });
  });

  it('free delivery applies at exactly the threshold, not one shilling below', () => {
    const at = priceOrder({
      lines: [{ unitPrice: 5000, qty: 1 }],
      delivery: area(200),
      freeDeliveryThreshold: 5000,
    });
    expect(at).toMatchObject({ deliveryFee: 0, total: 5000, freeDeliveryApplied: true });
    const below = priceOrder({
      lines: [{ unitPrice: 4999, qty: 1 }],
      delivery: area(200),
      freeDeliveryThreshold: 5000,
    });
    expect(below).toMatchObject({ deliveryFee: 200, total: 5199, freeDeliveryApplied: false });
  });

  it('free delivery never applies to an ineligible area or without a threshold', () => {
    expect(
      priceOrder({
        lines: [{ unitPrice: 9000, qty: 1 }],
        delivery: area(450, false),
        freeDeliveryThreshold: 5000,
      }).deliveryFee,
    ).toBe(450);
    expect(
      priceOrder({
        lines: [{ unitPrice: 9000, qty: 1 }],
        delivery: area(200),
        freeDeliveryThreshold: null,
      }).deliveryFee,
    ).toBe(200);
  });

  it('a manual delivery-fee override replaces the area fee and free delivery, never item prices', () => {
    const r = priceOrder({
      lines: [{ unitPrice: 6000, qty: 1 }],
      delivery: area(200),
      freeDeliveryThreshold: 5000,
      deliveryFeeOverride: 150,
    });
    expect(r).toEqual({
      subtotal: 6000,
      deliveryFee: 150,
      total: 6150,
      freeDeliveryApplied: false,
    });
    expect(
      priceOrder({
        lines: [{ unitPrice: 100, qty: 1 }],
        delivery: { kind: 'pickup' },
        freeDeliveryThreshold: null,
        deliveryFeeOverride: 0,
      }).total,
    ).toBe(100);
  });

  it.each([
    ['an empty cart', { lines: [] }],
    ['a fractional price', { lines: [{ unitPrice: 99.5, qty: 1 }] }],
    ['a negative price', { lines: [{ unitPrice: -1, qty: 1 }] }],
    ['qty 0', { lines: [{ unitPrice: 100, qty: 0 }] }],
    ['qty 100', { lines: [{ unitPrice: 100, qty: 100 }] }],
    ['a fractional qty', { lines: [{ unitPrice: 100, qty: 1.5 }] }],
    ['a negative override', { lines: [{ unitPrice: 100, qty: 1 }], deliveryFeeOverride: -50 }],
    ['an unsafe total', { lines: [{ unitPrice: Number.MAX_SAFE_INTEGER, qty: 2 }] }],
  ])('rejects %s', (_label, partial) => {
    expect(() =>
      priceOrder({
        delivery: { kind: 'pickup' },
        freeDeliveryThreshold: null,
        ...partial,
      }),
    ).toThrow(PricingError);
  });

  it('rejects a fractional area fee', () => {
    expect(() =>
      priceOrder({
        lines: [{ unitPrice: 100, qty: 1 }],
        delivery: area(199.9),
        freeDeliveryThreshold: null,
      }),
    ).toThrow(PricingError);
  });

  it('always returns total = subtotal + delivery fee', () => {
    for (const fee of [0, 200, 450])
      for (const price of [1, 999, 5000, 12345]) {
        const r = priceOrder({
          lines: [{ unitPrice: price, qty: 2 }],
          delivery: area(fee),
          freeDeliveryThreshold: 5000,
        });
        expect(r.total).toBe(r.subtotal + r.deliveryFee);
      }
  });
});
