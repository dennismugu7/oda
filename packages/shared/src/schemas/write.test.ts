import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { isOrderToken } from './orderToken';
import { ORDER_SERVER_OWNED_FIELDS, SERVER_OWNED_FIELDS } from './serverOwned';
import {
  paymentAccountInput,
  productInput,
  productUpdate,
  profileUpdate,
  shopCreate,
  shopUpdate,
  WRITE_SCHEMAS,
} from './write';

/** The object keys a write schema accepts (unwrapping a trailing transform). */
function keysOf(schema: z.ZodType): string[] {
  const s = schema as unknown as { shape?: object; in?: { shape?: object } };
  const shape = s.shape ?? s.in?.shape;
  if (!shape) throw new Error('Write schemas must be objects');
  return Object.keys(shape);
}

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('write whitelists vs server-owned columns', () => {
  for (const [name, schema] of Object.entries(WRITE_SCHEMAS)) {
    const owned: readonly string[] = name.startsWith('product')
      ? SERVER_OWNED_FIELDS
      : ORDER_SERVER_OWNED_FIELDS;

    it(`${name} has no server-owned key`, () => {
      const overlap = keysOf(schema).filter((k) => owned.includes(k));
      expect(overlap).toEqual([]);
    });

    it(`${name} rejects every server-owned key (camelCase and snake_case)`, () => {
      for (const key of owned) {
        for (const variant of new Set([key, snake(key)])) {
          const result = schema.safeParse({ [variant]: true });
          expect(result.success, `${name}.${variant}`).toBe(false);
          const unrecognized = result.error?.issues.some(
            (i) => i.code === 'unrecognized_keys' && i.keys.includes(variant),
          );
          expect(unrecognized, `${name}.${variant} is reported as not allowed`).toBe(true);
        }
      }
    });
  }
});

describe('profileUpdate', () => {
  it('normalises the recovery phone and clears empty names', () => {
    expect(profileUpdate.parse({ recoveryPhone: '0712 345 678', firstName: '  ' })).toEqual({
      recoveryPhone: '+254712345678',
      firstName: null,
    });
  });
  it('rejects a non-Kenyan phone with a friendly message', () => {
    const r = profileUpdate.safeParse({ recoveryPhone: '+1 202 555 0100' });
    expect(r.error?.issues[0]?.message).toBe('Enter a Kenyan mobile number, e.g. 0712 345 678.');
  });
});

describe('shopCreate / shopUpdate', () => {
  it('lower-cases and validates the slug, normalises WhatsApp', () => {
    expect(
      shopCreate.parse({ name: 'Amani Styles', slug: 'Amani-Styles', whatsappPhone: '0712345678' }),
    ).toEqual({ name: 'Amani Styles', slug: 'amani-styles', whatsappPhone: '+254712345678' });
    expect(
      shopCreate.safeParse({ name: 'X Y', slug: 'admin', whatsappPhone: '0712345678' }).success,
    ).toBe(false);
  });
  it('strips @ from handles', () => {
    expect(shopUpdate.parse({ tiktokHandle: '@amani.styles', instagramHandle: '' })).toEqual({
      tiktokHandle: 'amani.styles',
      instagramHandle: null,
    });
  });
  it('needs at least one payment option when both are sent', () => {
    expect(
      shopUpdate.safeParse({ acceptsPayBefore: false, acceptsPayOnDelivery: false }).success,
    ).toBe(false);
    expect(
      shopUpdate.safeParse({ acceptsPayBefore: false, acceptsPayOnDelivery: true }).success,
    ).toBe(true);
  });
  it('accepts only known checklist items', () => {
    expect(shopUpdate.safeParse({ checklist: { shared_link: true } }).success).toBe(true);
    expect(shopUpdate.safeParse({ checklist: { arrange_delivery: true } }).success).toBe(true);
    expect(shopUpdate.safeParse({ checklist: { first_product: true } }).success).toBe(false);
  });
});

describe('paymentAccountInput', () => {
  const till = { type: 'till', number: '5123456', accountName: 'Amani Styles' };
  it('accepts a till and defaults the paybill fields to null', () => {
    expect(paymentAccountInput.parse(till)).toEqual({
      ...till,
      accountRefMode: null,
      accountRef: null,
    });
  });
  it('stores a Pochi number in E.164', () => {
    expect(
      paymentAccountInput.parse({ ...till, type: 'pochi', number: '0712 345 678' }).number,
    ).toBe('+254712345678');
  });
  it('applies the paybill reference rules', () => {
    const paybill = { ...till, type: 'paybill', number: '247247' };
    expect(paymentAccountInput.safeParse(paybill).success).toBe(false);
    expect(paymentAccountInput.safeParse({ ...paybill, accountRefMode: 'fixed' }).success).toBe(
      false,
    );
    expect(
      paymentAccountInput.safeParse({
        ...paybill,
        accountRefMode: 'fixed',
        accountRef: '0123456789',
      }).success,
    ).toBe(true);
    expect(
      paymentAccountInput.safeParse({ ...paybill, accountRefMode: 'order_number' }).success,
    ).toBe(true);
    expect(
      paymentAccountInput.safeParse({ ...till, accountRefMode: 'fixed', accountRef: '1' }).success,
    ).toBe(false);
  });
});

describe('productInput / productUpdate', () => {
  it('fills defaults and de-duplicates sizes', () => {
    expect(
      productInput.parse({ name: 'Kitenge top', price: 1200, sizes: ['S', 'M', 'S'] }),
    ).toEqual({
      name: 'Kitenge top',
      price: 1200,
      description: null,
      compareAtPrice: null,
      categoryId: null,
      status: 'available',
      sizes: ['S', 'M'],
      colours: [],
      position: 0,
    });
  });
  it('rejects non-integer, negative and zero prices', () => {
    for (const price of [12.5, -1, 0, '1200']) {
      expect(productInput.safeParse({ name: 'Top', price }).success, String(price)).toBe(false);
    }
  });
  it('needs the was-price above the price', () => {
    expect(productInput.safeParse({ name: 'Top', price: 1200, compareAtPrice: 1200 }).success).toBe(
      false,
    );
    expect(productUpdate.safeParse({ price: 1200, compareAtPrice: 1500 }).success).toBe(true);
  });
});

describe('order tokens', () => {
  it('accepts exactly 12 URL-safe characters', () => {
    expect(isOrderToken('aB3_-xYz9QwE')).toBe(true);
    for (const bad of ['aB3_-xYz9Qw', 'aB3_-xYz9QwEr', 'aB3_-xYz9Qw!', 1042, null]) {
      expect(isOrderToken(bad), String(bad)).toBe(false);
    }
  });
});
