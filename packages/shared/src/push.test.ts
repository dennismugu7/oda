import { describe, expect, it } from 'vitest';
import { pushRoute, pushTokenInput } from './push';

describe('push', () => {
  it('accepts only Expo push tokens', () => {
    expect(pushTokenInput.safeParse({ token: 'ExponentPushToken[abcDEF123_-xyz]' }).success).toBe(
      true,
    );
    expect(pushTokenInput.safeParse({ token: 'ExpoPushToken[abcdefgh12]' }).success).toBe(true);
    expect(pushTokenInput.safeParse({ token: 'fcm-token-abc' }).success).toBe(false);
    expect(pushTokenInput.safeParse({ token: 'ExponentPushToken[a b]' }).success).toBe(false);
    expect(
      pushTokenInput.safeParse({ token: 'ExponentPushToken[abcdefgh12]', userId: 'x' }).success,
    ).toBe(false);
  });

  it('a tapped notification opens its order', () => {
    const id = '7f0c9a52-3c1b-4a5e-9a49-1d2b3c4d5e6f';
    expect(pushRoute({ type: 'new_order', orderId: id })).toEqual({
      pathname: '/orders/[id]',
      params: { id },
    });
    expect(pushRoute({ type: 'new_order', orderId: '../settings' })).toBeNull();
    expect(pushRoute(null)).toBeNull();
  });

  it('a new review opens the Reviews screen at that review (M7)', () => {
    const orderId = '6f1c1d8e-3a52-4c1b-9a43-0d6c2b1e7f10';
    const reviewId = '0b7a2c3d-4e5f-4a1b-8c9d-0e1f2a3b4c5d';
    expect(pushRoute({ type: 'new_review', orderId, reviewId })).toEqual({
      pathname: '/reviews',
      params: { review: reviewId },
    });
    expect(pushRoute({ type: 'new_review', orderId, reviewId: 'x' })).toEqual({
      pathname: '/orders/[id]',
      params: { id: orderId },
    });
  });
});
