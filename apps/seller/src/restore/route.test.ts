import { describe, expect, it } from 'vitest';
import { restorable, restorePlan, routeMemory, tabFor } from './route';

describe('restorable', () => {
  it('never reopens sign-in, codes, passwords, account deletion, M-Pesa details or setup', () => {
    for (const path of [
      '/',
      '/welcome',
      '/sign-in',
      '/sign-up',
      '/verify',
      '/forgot-password',
      '/settings/password',
      '/settings/delete',
      '/payments',
      '/payments/till',
      '/onboarding/name-shop',
      '/add',
    ]) {
      expect(restorable(path), path).toBe(false);
    }
  });

  it('reopens the tabs and the screens above them', () => {
    for (const path of ['/home', '/orders', '/orders/abc', '/products/new', '/settings/details']) {
      expect(restorable(path), path).toBe(true);
    }
  });

  it('doesn’t confuse /settings/deleted-ish names with /settings/delete', () => {
    expect(restorable('/settings/delete-x')).toBe(true);
  });
});

describe('tabFor', () => {
  it('puts each screen on the tab it opens from', () => {
    expect(tabFor('/orders/abc')).toBe('/orders');
    expect(tabFor('/orders/new')).toBe('/orders');
    expect(tabFor('/products/p1')).toBe('/shop');
    expect(tabFor('/categories/c1')).toBe('/shop');
    expect(tabFor('/reviews')).toBe('/more');
    expect(tabFor('/shop-profile')).toBe('/more');
    expect(tabFor('/delivery/area')).toBe('/more');
    expect(tabFor('/notifications')).toBe('/home');
    expect(tabFor('/shop')).toBe('/shop');
    expect(tabFor('/something-new')).toBe('/home');
  });
});

describe('routeMemory', () => {
  it('keeps search params but not the path’s own [id]', () => {
    expect(
      routeMemory('/orders/o1', { id: 'o1', quick: 'confirmPayment' }, ['orders', '[id]']),
    ).toEqual({ pathname: '/orders/o1', params: { quick: 'confirmPayment' } });
  });

  it('records nothing for a screen that is never reopened', () => {
    expect(routeMemory('/settings/password', {}, ['settings', 'password'])).toBeNull();
  });
});

describe('restorePlan', () => {
  it('opens the tab, then the screen on top', () => {
    expect(restorePlan({ pathname: '/orders/o1', params: { quick: 'markSent' } })).toEqual({
      tab: '/orders',
      screen: '/orders/o1?quick=markSent',
    });
  });

  it('opens just the tab when the screen is a tab', () => {
    expect(restorePlan({ pathname: '/shop', params: {} })).toEqual({ tab: '/shop', screen: null });
  });

  it('opens Home without a memory or for a forbidden screen', () => {
    expect(restorePlan(null)).toEqual({ tab: '/home', screen: null });
    expect(restorePlan({ pathname: '/settings/delete', params: {} })).toEqual({
      tab: '/home',
      screen: null,
    });
  });
});
