import 'server-only';
import { serverEnv } from './env';

/** The buyer's order page. The token is in the path (decision #61); our logs never print it. */
export function orderLink(token: string): string {
  return `${serverEnv().PUBLIC_SHOP_BASE_URL}/o/${token}`;
}
