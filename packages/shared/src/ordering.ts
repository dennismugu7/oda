// Can buyers order from a shop? One rule for the buyer web (storefront `takingOrders`) and the
// seller app's Home banner (decision #109), so the two can't drift (spec §5.2, decision #61 c).

/** The shop facts the rule reads. */
export interface OrderingFacts {
  isPaused: boolean;
  /** Pay-now needs pay-before on and an active payment account (spec §5.2 step 5). */
  payNowAvailable: boolean;
  acceptsPayOnDelivery: boolean;
  /** At least one delivery area, or pickup on (decision #61 c). */
  hasDeliveryOption: boolean;
}

/** What stops a shop taking orders, in the order the seller should fix them. */
export type OrderingBlocker = 'delivery' | 'payment' | 'paused';

/** The two derived facts, from the shop row and whether it has an account / an area. */
export function orderingFacts(shop: {
  isPaused: boolean;
  acceptsPayBefore: boolean;
  acceptsPayOnDelivery: boolean;
  pickupEnabled: boolean;
  hasActivePaymentAccount: boolean;
  hasDeliveryArea: boolean;
}): OrderingFacts {
  return {
    isPaused: shop.isPaused,
    payNowAvailable: shop.acceptsPayBefore && shop.hasActivePaymentAccount,
    acceptsPayOnDelivery: shop.acceptsPayOnDelivery,
    hasDeliveryOption: shop.pickupEnabled || shop.hasDeliveryArea,
  };
}

export function orderingBlockers(shop: OrderingFacts): OrderingBlocker[] {
  const blockers: OrderingBlocker[] = [];
  if (!shop.hasDeliveryOption) blockers.push('delivery');
  if (!shop.payNowAvailable && !shop.acceptsPayOnDelivery) blockers.push('payment');
  if (shop.isPaused) blockers.push('paused');
  return blockers;
}

/**
 * Can buyers order at all? A way to pay (pay now or on delivery) and a way to get the order
 * (a delivery area or pickup), and not paused.
 */
export function takingOrders(shop: OrderingFacts): boolean {
  return orderingBlockers(shop).length === 0;
}
