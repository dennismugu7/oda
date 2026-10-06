import { z } from 'zod';

// Push notifications (M6 CP4, spec §5.8, decision #65): the Expo push token the app registers
// on sign-in and removes on sign-out, and where tapping a notification goes.

/** Expo push tokens look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`. */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,100}\]$/;

/** POST / DELETE /api/me/push-tokens. */
export const pushTokenInput = z.strictObject({
  token: z.string().regex(EXPO_PUSH_TOKEN, { error: 'This is not an Expo push token.' }),
});

/** Most phones a seller keeps getting pushes on; the oldest token drops off. */
export const MAX_PUSH_TOKENS = 5;

/** The data every order push carries: tapping it opens that order's detail (decision #65 a). */
export interface PushData {
  type: string;
  orderId: string | null;
  /** new_review pushes (M7): the review to open. */
  reviewId?: string | null;
}

export type PushRoute =
  | { pathname: '/orders/[id]'; params: { id: string } }
  | { pathname: '/reviews'; params: { review: string } };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Where a tapped notification goes, or null when it has nowhere to go: a new review opens the
 * Reviews screen at that review (M7); everything else opens its order.
 */
export function pushRoute(data: unknown): PushRoute | null {
  const d = data as Partial<PushData> | null | undefined;
  if (typeof d?.reviewId === 'string' && UUID.test(d.reviewId)) {
    return { pathname: '/reviews', params: { review: d.reviewId } };
  }
  const orderId = d?.orderId;
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return null;
  return { pathname: '/orders/[id]', params: { id: orderId } };
}
