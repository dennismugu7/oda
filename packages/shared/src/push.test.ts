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
});
