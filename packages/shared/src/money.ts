// Money is integer KES everywhere (see docs/spec.md §3). These helpers only format;
// totals are computed by pricing.ts on the server.

const grouping = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

function assertShillings(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Money must be a whole number of shillings, got ${amount}`);
  }
}

/** "KSh 2,500": the seller app's convention. */
export function formatKsh(amount: number): string {
  assertShillings(amount);
  return `KSh ${grouping.format(amount)}`;
}

/** "KES 2,500": the buyer web's convention. */
export function formatKes(amount: number): string {
  assertShillings(amount);
  return `KES ${grouping.format(amount)}`;
}
