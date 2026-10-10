import { describe, expect, it } from 'vitest';
import { PRODUCT_PAGE_URL, homeHrefFor, homeRedirects } from './home';

describe('homeHrefFor', () => {
  it('points at the product page on production only', () => {
    expect(homeHrefFor('production')).toBe('https://mugu-labs.com/products/oda/');
    expect(homeHrefFor(' production ')).toBe(PRODUCT_PAGE_URL);
    expect(homeHrefFor('staging')).toBe('/');
    expect(homeHrefFor(undefined)).toBe('/');
  });
});

describe('homeRedirects', () => {
  it('redirects only production’s root, permanently', () => {
    expect(homeRedirects('production')).toEqual([
      { source: '/', destination: PRODUCT_PAGE_URL, permanent: true },
    ]);
    expect(homeRedirects('staging')).toEqual([]);
    expect(homeRedirects('preview')).toEqual([]);
    expect(homeRedirects(undefined)).toEqual([]);
  });
});
