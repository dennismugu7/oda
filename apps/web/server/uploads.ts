import 'server-only';
import type { SellerCtx } from './authz';
import { ForbiddenError } from './errors';

// Storage key ownership (docs/data-model.md → File storage). The presign route (M2) and every
// write that saves a key check that the key sits under the seller's own shop prefix.

export const SHOP_KEY_PREFIXES = ['products', 'logos', 'feedback'] as const;
export type ShopKeyPrefix = (typeof SHOP_KEY_PREFIXES)[number];

/** Throws 403 unless `key` is `{prefix}/{ctx.shopId}/…` for one of `allowed`. */
export function assertOwnsKey(
  ctx: SellerCtx,
  key: string,
  allowed: readonly ShopKeyPrefix[] = SHOP_KEY_PREFIXES,
): void {
  const owns = allowed.some((prefix) => {
    const start = `${prefix}/${ctx.shopId}/`;
    return key.startsWith(start) && key.length > start.length && !key.includes('..');
  });
  if (!owns) throw new ForbiddenError('This photo upload is not valid.');
}
