// The New order form (17-new-order): its lines and checks. Pure, so it is unit-tested; prices
// and totals always come from the server's quote.

export interface DraftLine {
  productId: string;
  name: string;
  unitPrice: number;
  thumbUrl: string | null;
  size: string | null;
  colour: string | null;
  qty: number;
}

const same = (a: DraftLine, b: Pick<DraftLine, 'productId' | 'size' | 'colour'>) =>
  a.productId === b.productId && a.size === b.size && a.colour === b.colour;

/** Adds a line, or one more of the same product, size and colour. */
export function addLine(lines: readonly DraftLine[], line: DraftLine): DraftLine[] {
  const existing = lines.find((l) => same(l, line));
  if (!existing) return [...lines, line];
  return lines.map((l) => (same(l, line) ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l));
}

/** +1 / −1; reaching 0 removes the line. */
export function stepQty(lines: readonly DraftLine[], index: number, by: 1 | -1): DraftLine[] {
  return lines
    .map((l, i) => (i === index ? { ...l, qty: Math.min(99, l.qty + by) } : l))
    .filter((l) => l.qty > 0);
}

/** "Size M · Red · KSh 2,500" without the price (the screen adds it). */
export function lineOptions(l: Pick<DraftLine, 'size' | 'colour'>): string {
  return [l.size ? `Size ${l.size}` : null, l.colour].filter(Boolean).join(' · ');
}

/** The first thing to fix before creating the order, or null. */
export function newOrderProblem(d: {
  name: string;
  phone: string;
  lines: readonly DraftLine[];
  fulfilment: { kind: 'pickup' } | { kind: 'delivery'; areaId: string; addressText: string } | null;
}): string | null {
  if (d.name.trim().length < 2) return 'Enter the buyer’s name.';
  if (!d.phone.trim()) return 'Enter the buyer’s phone number.';
  if (d.lines.length === 0) return 'Add at least one product.';
  if (!d.fulfilment) return 'Choose pickup or a delivery area.';
  if (d.fulfilment.kind === 'delivery' && d.fulfilment.addressText.trim().length < 3) {
    return 'Enter the delivery address.';
  }
  return null;
}

/** A key that makes a retried "Create order" return the same order (16–64 safe characters). */
export function newIdempotencyKey(random: () => number = Math.random): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'manual-';
  for (let i = 0; i < 24; i++) key += chars[Math.floor(random() * chars.length)];
  return key;
}
