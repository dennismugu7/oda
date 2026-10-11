import { describe, expect, it } from 'vitest';
import { orderingBlockers, orderingFacts, takingOrders, type OrderingFacts } from './ordering';

const READY: OrderingFacts = {
  isPaused: false,
  payNowAvailable: true,
  acceptsPayOnDelivery: false,
  hasDeliveryOption: true,
};

describe('ordering rule (decision #109)', () => {
  it('all fine: takes orders, nothing to fix', () => {
    expect(orderingBlockers(READY)).toEqual([]);
    expect(takingOrders(READY)).toBe(true);
    expect(takingOrders({ ...READY, payNowAvailable: false, acceptsPayOnDelivery: true })).toBe(
      true,
    );
  });

  it('each missing item on its own', () => {
    expect(orderingBlockers({ ...READY, hasDeliveryOption: false })).toEqual(['delivery']);
    expect(orderingBlockers({ ...READY, payNowAvailable: false })).toEqual(['payment']);
    expect(orderingBlockers({ ...READY, isPaused: true })).toEqual(['paused']);
  });

  it('several at once, delivery first', () => {
    expect(
      orderingBlockers({
        isPaused: true,
        payNowAvailable: false,
        acceptsPayOnDelivery: false,
        hasDeliveryOption: false,
      }),
    ).toEqual(['delivery', 'payment', 'paused']);
  });

  it('derives pay now and delivery from the shop row', () => {
    const row = {
      isPaused: false,
      acceptsPayBefore: true,
      acceptsPayOnDelivery: false,
      pickupEnabled: false,
      hasActivePaymentAccount: true,
      hasDeliveryArea: false,
    };
    expect(orderingFacts(row)).toEqual({ ...READY, hasDeliveryOption: false });
    expect(orderingFacts({ ...row, hasActivePaymentAccount: false }).payNowAvailable).toBe(false);
    expect(orderingFacts({ ...row, acceptsPayBefore: false }).payNowAvailable).toBe(false);
    expect(orderingFacts({ ...row, pickupEnabled: true }).hasDeliveryOption).toBe(true);
    expect(orderingFacts({ ...row, hasDeliveryArea: true }).hasDeliveryOption).toBe(true);
  });
});
