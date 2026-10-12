// Can buyers order from a shop? One rule for the buyer web (storefront `takingOrders`, checkout)
// and the seller app's Home banner (decision #109 c), so the two can't drift. Delivery options
// are optional (decision #110 a): without an area or pickup, buyer and seller arrange delivery.

/** The shop facts the rule reads. */
export interface OrderingFacts {
  isPaused: boolean;
  /** Pay-now needs pay-before on and an active payment account (spec §5.2 step 5). */
  payNowAvailable: boolean;
  acceptsPayOnDelivery: boolean;
}

/** What stops a shop taking orders, in the order the seller should fix them. */
export type OrderingBlocker = 'payment' | 'paused';

/** The derived facts, from the shop row and whether it has an active payment account. */
export function orderingFacts(shop: {
  isPaused: boolean;
  acceptsPayBefore: boolean;
  acceptsPayOnDelivery: boolean;
  hasActivePaymentAccount: boolean;
}): OrderingFacts {
  return {
    isPaused: shop.isPaused,
    payNowAvailable: shop.acceptsPayBefore && shop.hasActivePaymentAccount,
    acceptsPayOnDelivery: shop.acceptsPayOnDelivery,
  };
}

export function orderingBlockers(shop: OrderingFacts): OrderingBlocker[] {
  const blockers: OrderingBlocker[] = [];
  if (!shop.payNowAvailable && !shop.acceptsPayOnDelivery) blockers.push('payment');
  if (shop.isPaused) blockers.push('paused');
  return blockers;
}

/** Can buyers order at all? A way to pay (pay now or on delivery), and not paused. */
export function takingOrders(shop: OrderingFacts): boolean {
  return orderingBlockers(shop).length === 0;
}
