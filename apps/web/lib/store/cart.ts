// The buyer's cart and favourites (spec §6.1, §6.3): per shop, on this device only
// (localStorage). Pure helpers, unit-tested; prices here are what the buyer last saw — the
// server re-checks them (cart lookup now, checkout in M5).

export interface CartLine {
  productId: string;
  size: string | null;
  colour: string | null;
  qty: number;
  /** Shown in the cart bar until the cart page re-checks it with the server. */
  price: number;
  name: string;
  coverUrl: string | null;
}

export const MAX_QTY = 99;

const sameLine = (a: CartLine, b: Pick<CartLine, 'productId' | 'size' | 'colour'>) =>
  a.productId === b.productId && a.size === b.size && a.colour === b.colour;

export function addLine(lines: readonly CartLine[], line: CartLine): CartLine[] {
  const existing = lines.find((l) => sameLine(l, line));
  if (!existing) return [...lines, { ...line, qty: Math.min(MAX_QTY, Math.max(1, line.qty)) }];
  return lines.map((l) =>
    sameLine(l, line)
      ? { ...l, qty: Math.min(MAX_QTY, l.qty + line.qty), price: line.price, name: line.name }
      : l,
  );
}

export function setQty(lines: readonly CartLine[], index: number, qty: number): CartLine[] {
  if (qty < 1) return lines.filter((_, i) => i !== index);
  return lines.map((l, i) => (i === index ? { ...l, qty: Math.min(MAX_QTY, qty) } : l));
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function cartTotal(lines: readonly CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty * l.price, 0);
}

export function inCart(lines: readonly CartLine[], productId: string): boolean {
  return lines.some((l) => l.productId === productId);
}

/** Reads what localStorage holds, dropping anything malformed (it is user-editable). */
export function parseLines(raw: string | null): CartLine[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (l): l is CartLine =>
          !!l &&
          typeof l.productId === 'string' &&
          Number.isInteger(l.qty) &&
          l.qty >= 1 &&
          Number.isInteger(l.price) &&
          l.price >= 0 &&
          typeof l.name === 'string',
      )
      .slice(0, 50)
      .map((l) => ({
        productId: l.productId,
        size: typeof l.size === 'string' ? l.size : null,
        colour: typeof l.colour === 'string' ? l.colour : null,
        qty: Math.min(MAX_QTY, l.qty),
        price: l.price,
        name: l.name,
        coverUrl: typeof l.coverUrl === 'string' ? l.coverUrl : null,
      }));
  } catch {
    return [];
  }
}

export function parseIds(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string').slice(0, 200)
      : [];
  } catch {
    return [];
  }
}

export const cartKey = (shopId: string) => `oda.cart.${shopId}`;
export const favouritesKey = (shopId: string) => `oda.fav.${shopId}`;
