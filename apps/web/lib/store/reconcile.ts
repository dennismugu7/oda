// The cart against the server's current products (spec §6.3): sold out, gone (hidden,
// deleted, or an option the seller removed) and price changes are flagged on the line; the
// line keeps the current price so the totals are right. Pure, unit-tested.
import { formatKsh } from '@oda/shared';
import type { CartLine } from './cart';

export interface CurrentProduct {
  id: string;
  name: string;
  price: number;
  status: string;
  sizes: string[];
  colours: { name: string }[];
  categoryId: string | null;
  coverUrl: string | null;
}

export interface CheckedLine {
  line: CartLine;
  /** What the buyer must know; checkout stays blocked while any line has one. */
  problem: string | null;
  /** "Update my cart" drops this line (sold out or gone). */
  remove: boolean;
}

export function reconcile(
  lines: readonly CartLine[],
  current: ReadonlyMap<string, CurrentProduct>,
): CheckedLine[] {
  return lines.map((line) => {
    const product = current.get(line.productId);
    if (!product) {
      return { line, problem: 'No longer available. Remove it to continue.', remove: true };
    }
    if (product.status === 'sold_out') {
      return { line, problem: 'Sold out. Remove it to continue.', remove: true };
    }
    if (line.size && !product.sizes.includes(line.size)) {
      return { line, problem: `Size ${line.size} is no longer available.`, remove: true };
    }
    if (line.colour && !product.colours.some((c) => c.name === line.colour)) {
      return { line, problem: `${line.colour} is no longer available.`, remove: true };
    }
    const updated = { ...line, name: product.name, coverUrl: product.coverUrl ?? line.coverUrl };
    if (product.price !== line.price) {
      return {
        line: { ...updated, price: product.price },
        problem: `Price changed from ${formatKsh(line.price)} to ${formatKsh(product.price)}.`,
        remove: false,
      };
    }
    return { line: updated, problem: null, remove: false };
  });
}
