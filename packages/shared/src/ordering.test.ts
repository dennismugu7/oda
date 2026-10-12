import { describe, expect, it } from 'vitest';
import { orderingBlockers, orderingFacts, takingOrders, type OrderingFacts } from './ordering';

const READY: OrderingFacts = {
  isPaused: false,
  payNowAvailable: true,
  acceptsPayOnDelivery: false,
};

describe('ordering rule (decisions #109 c, #110 a)', () => {
  it('all fine: takes orders, nothing to fix', () => {
    expect(orderingBlockers(READY)).toEqual([]);
    expect(takingOrders(READY)).toBe(true);
    expect(takingOrders({ ...READY, payNowAvailable: false, acceptsPayOnDelivery: true })).toBe(
      true,
    );
  });

  it('each missing item on its own', () => {
    expect(orderingBlockers({ ...READY, payNowAvailable: false })).toEqual(['payment']);
    expect(orderingBlockers({ ...READY, isPaused: true })).toEqual(['paused']);
  });

  it('both at once, payment first', () => {
    expect(
      orderingBlockers({ isPaused: true, payNowAvailable: false, acceptsPayOnDelivery: false }),
    ).toEqual(['payment', 'paused']);
  });

  it('delivery options are optional: no area and no pickup still takes orders', () => {
    const row = {
      isPaused: false,
      acceptsPayBefore: false,
      acceptsPayOnDelivery: true,
      hasActivePaymentAccount: false,
      // Extra shop columns callers may pass along are ignored by the rule.
      pickupEnabled: false,
      hasDeliveryArea: false,
    };
    expect(takingOrders(orderingFacts(row))).toBe(true);
    expect(orderingFacts(row)).not.toHaveProperty('hasDeliveryOption');
  });

  it('derives pay now from the shop row', () => {
    const row = {
      isPaused: false,
      acceptsPayBefore: true,
      acceptsPayOnDelivery: false,
      hasActivePaymentAccount: true,
    };
    expect(orderingFacts(row)).toEqual(READY);
    expect(orderingFacts({ ...row, hasActivePaymentAccount: false }).payNowAvailable).toBe(false);
    expect(orderingFacts({ ...row, acceptsPayBefore: false }).payNowAvailable).toBe(false);
  });
});
