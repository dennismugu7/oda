// The only place order totals are computed (docs/order-lifecycle.md → Money).
// Runs on the server with unit prices and fees read from the database. Integer KES.

export const MAX_QTY = 99;

export interface PriceLine {
  unitPrice: number;
  qty: number;
}

export type PriceDelivery =
  { kind: 'pickup' } | { kind: 'area'; fee: number; freeDeliveryEligible: boolean };

export interface PriceInput {
  lines: PriceLine[];
  delivery: PriceDelivery;
  /** The shop's free-delivery threshold, or null when it has none. */
  freeDeliveryThreshold: number | null;
  /** Manual orders only: the seller's delivery fee, used instead of the area fee. */
  deliveryFeeOverride?: number;
}

export interface PriceResult {
  subtotal: number;
  deliveryFee: number;
  total: number;
  freeDeliveryApplied: boolean;
}

export class PricingError extends Error {
  override name = 'PricingError';
}

function shillings(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingError(`${what} must be a whole number of shillings, 0 or more (got ${value})`);
  }
  return value;
}

function safeSum(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new PricingError('Order total is too large');
  return sum;
}

export function priceOrder(input: PriceInput): PriceResult {
  if (input.lines.length === 0) throw new PricingError('An order needs at least one item');

  let subtotal = 0;
  for (const line of input.lines) {
    const unitPrice = shillings(line.unitPrice, 'Unit price');
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
      throw new PricingError(`Quantity must be between 1 and ${MAX_QTY} (got ${line.qty})`);
    }
    subtotal = safeSum(subtotal, unitPrice * line.qty);
  }

  const threshold = input.freeDeliveryThreshold;
  if (threshold !== null) shillings(threshold, 'Free-delivery threshold');

  let deliveryFee = 0;
  let freeDeliveryApplied = false;
  if (input.deliveryFeeOverride !== undefined) {
    deliveryFee = shillings(input.deliveryFeeOverride, 'Delivery fee');
  } else if (input.delivery.kind === 'area') {
    const fee = shillings(input.delivery.fee, 'Delivery fee');
    freeDeliveryApplied =
      input.delivery.freeDeliveryEligible && threshold !== null && subtotal >= threshold;
    deliveryFee = freeDeliveryApplied ? 0 : fee;
  }

  return { subtotal, deliveryFee, total: safeSum(subtotal, deliveryFee), freeDeliveryApplied };
}
