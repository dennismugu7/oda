import { z } from 'zod';

/** Order links carry 12 random URL-safe characters (9 random bytes, base64url). */
export const ORDER_TOKEN_LENGTH = 12;
export const orderToken = z.string().regex(/^[A-Za-z0-9_-]{12}$/);

export function isOrderToken(value: unknown): value is string {
  return orderToken.safeParse(value).success;
}
