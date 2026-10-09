import { describe, expect, it } from 'vitest';
import {
  finishYourShop,
  onboardingAnswer,
  onboardingPayment,
  onboardingProduct,
  onboardingShop,
  SIZE_PRESETS,
  type ChecklistFacts,
} from './onboarding';
import { BUSINESS_TYPES } from './schemas/enums';

const SHOP_ID = '6f1c2a40-1111-4abc-9def-000000000001';
const photo = (n: number) => ({
  objectKey: `products/${SHOP_ID}/p${n}.jpg`,
  thumbKey: `products/${SHOP_ID}/p${n}_thumb.jpg`,
  width: 1600,
  height: 1200,
});

describe('steps 1–2 (decision #41)', () => {
  it('takes a business type or Skip on step 1', () => {
    expect(onboardingAnswer.parse({ step: 1, businessType: 'fashion' })).toEqual({
      step: 1,
      businessType: 'fashion',
    });
    expect(onboardingAnswer.parse({ step: 1, skip: true })).toEqual({ step: 1, skip: true });
    expect(onboardingAnswer.safeParse({ step: 1, businessType: 'cars' }).success).toBe(false);
  });

  it('takes the six channels (deduplicated), an empty list for "just starting", or Skip', () => {
    expect(onboardingAnswer.parse({ step: 2, channels: ['tiktok', 'whatsapp', 'tiktok'] })).toEqual(
      { step: 2, channels: ['tiktok', 'whatsapp'] },
    );
    expect(onboardingAnswer.parse({ step: 2, channels: [] })).toEqual({ step: 2, channels: [] });
    expect(onboardingAnswer.safeParse({ step: 2, channels: ['tt'] }).success).toBe(false);
    expect(onboardingAnswer.parse({ step: 2, skip: true })).toEqual({ step: 2, skip: true });
  });

  it('rejects anything else', () => {
    for (const bad of [
      {},
      { step: 3, skip: true },
      { step: 1, skip: false },
      { step: 1, businessType: 'fashion', isAdmin: true },
    ]) {
      expect(onboardingAnswer.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('step 3', () => {
  it('normalises the WhatsApp number and checks the link', () => {
    expect(
      onboardingShop.parse({
        name: ' Amani Styles ',
        slug: 'Amani-Styles',
        whatsappPhone: '0712 345 678',
      }),
    ).toEqual({ name: 'Amani Styles', slug: 'amani-styles', whatsappPhone: '+254712345678' });
    expect(
      onboardingShop.safeParse({ name: 'A', slug: 'admin', whatsappPhone: '0712345678' }).success,
    ).toBe(false);
    expect(
      onboardingShop.safeParse({
        name: 'Amani',
        slug: 'amani',
        whatsappPhone: '0712345678',
        businessType: 'fashion',
      }).success,
    ).toBe(false);
  });
});

describe('step 4', () => {
  it('needs a name, a price of at least KSh 1 and 1–5 photos', () => {
    const ok = onboardingProduct.parse({
      name: 'Ankara wrap dress',
      price: 2500,
      sizes: ['M', 'L', 'M'],
      photos: [photo(1)],
    });
    expect(ok.sizes).toEqual(['M', 'L']);
    expect(
      onboardingProduct.safeParse({ name: 'Dress', price: 0, photos: [photo(1)] }).success,
    ).toBe(false);
    const noPhoto = onboardingProduct.safeParse({ name: 'Dress', price: 100, photos: [] });
    expect(noPhoto.error?.issues[0]?.message).toBe('Add a photo of the product.');
    expect(
      onboardingProduct.safeParse({
        name: 'Dress',
        price: 100,
        photos: [1, 2, 3, 4, 5, 6].map(photo),
      }).success,
    ).toBe(false);
  });

  it('takes no photo only with photoLater (photo uploads paused, decision #93 D1)', () => {
    const later = onboardingProduct.safeParse({
      name: 'Dress',
      price: 100,
      photos: [],
      photoLater: true,
    });
    expect(later.success).toBe(true);
    expect(
      onboardingProduct.safeParse({ name: 'Dress', price: 100, photos: [], photoLater: false })
        .success,
    ).toBe(false);
  });

  it('accepts only storage keys from our own upload flow', () => {
    const bad = { ...photo(1), objectKey: '../../etc/passwd' };
    expect(onboardingProduct.safeParse({ name: 'Dress', price: 100, photos: [bad] }).success).toBe(
      false,
    );
  });
});

describe('step 5', () => {
  it('takes Skip or a payment account (with the M1 rules)', () => {
    expect(onboardingPayment.parse({ skip: true })).toEqual({ skip: true });
    expect(
      onboardingPayment.parse({ type: 'till', number: '123456', accountName: 'AMANI STYLES' }),
    ).toMatchObject({
      type: 'till',
      number: '123456',
    });
    expect(
      onboardingPayment.parse({ type: 'pochi', number: '0712345678', accountName: 'AMANI W' }),
    ).toMatchObject({
      number: '+254712345678',
    });
    expect(
      onboardingPayment.safeParse({ type: 'till', number: '12', accountName: 'AMANI' }).success,
    ).toBe(false);
    expect(onboardingPayment.safeParse({ skip: false }).success).toBe(false);
  });
});

describe('size presets', () => {
  it('cover every business type', () => {
    for (const type of BUSINESS_TYPES) expect(SIZE_PRESETS[type], type).toBeDefined();
    expect(SIZE_PRESETS.fashion).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']);
    expect(SIZE_PRESETS.shoes_bags).toEqual([
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
      '42',
      '43',
      '44',
      '45',
    ]);
    expect(SIZE_PRESETS.food_drinks).toEqual([]);
  });

  it('fit the limits together with custom sizes (20 sizes, 20 characters each)', () => {
    const sizes = [...SIZE_PRESETS.shoes_bags, 'One size', '42 wide', 'Twenty chars exactly'];
    expect('Twenty chars exactly').toHaveLength(20);
    const ok = onboardingProduct.parse({ name: 'Sandals', price: 1800, sizes, photos: [photo(1)] });
    expect(ok.sizes).toHaveLength(13);
    const tooLong = onboardingProduct.safeParse({
      name: 'X',
      price: 1,
      sizes: ['x'.repeat(21)],
      photos: [photo(1)],
    });
    expect(tooLong.success).toBe(false);
    const tooMany = onboardingProduct.safeParse({
      name: 'X',
      price: 1,
      sizes: Array.from({ length: 21 }, (_, i) => `S${i}`),
      photos: [photo(1)],
    });
    expect(tooMany.error?.issues[0]?.message).toBe('Add at most 20 sizes.');
  });
});

describe('Finish your shop (7 items)', () => {
  const none: ChecklistFacts = {
    productCount: 0,
    hasActivePaymentAccount: false,
    hasLogo: false,
    hasSocialHandle: false,
    deliveryAreaCount: 0,
    pickupEnabled: false,
    ticks: {},
  };

  it('lists the 7 items in order with spec wording', () => {
    const result = finishYourShop(none);
    expect(result.items.map((i) => i.label)).toEqual([
      'Shop, first product and payment set',
      'Share your link',
      'Add your shop logo',
      'Add 4 more products',
      'Add more ways buyers reach you',
      'Add delivery options',
      'Test your WhatsApp link',
    ]);
    expect(result).toMatchObject({ done: 0, total: 7, complete: false });
  });

  it('ticks each item from its own data', () => {
    const afterOnboarding = finishYourShop({
      ...none,
      productCount: 1,
      hasActivePaymentAccount: true,
    });
    expect(afterOnboarding.done).toBe(1);
    const skippedPayment = finishYourShop({ ...none, productCount: 1 });
    expect(skippedPayment.items[0]!.done).toBe(false);

    const allFacts = {
      productCount: 5,
      hasActivePaymentAccount: true,
      hasLogo: true,
      hasSocialHandle: true,
      deliveryAreaCount: 2,
      pickupEnabled: false,
      ticks: { shared_link: '2026-10-04T10:00:00Z', tested_whatsapp: '2026-10-04T10:01:00Z' },
    };
    const all = finishYourShop(allFacts);
    expect(all).toMatchObject({ done: 7, complete: true });
    expect(finishYourShop({ ...none, productCount: 4 }).items[3]!.done).toBe(false);

    // A product saved while uploads were paused (decision #93 D1): an 8th item, open, so
    // the checklist isn't complete until the photo is added.
    const noPhoto = finishYourShop({ ...allFacts, productsWithoutPhoto: 1 });
    expect(noPhoto.items.at(-1)).toEqual({
      id: 'product_photo',
      label: 'Add a product photo',
      done: false,
    });
    expect(noPhoto).toMatchObject({ done: 7, total: 8, complete: false });
  });

  it('"Add delivery options" is done with a delivery area or pickup on (decision #61)', () => {
    const delivery = (facts: Partial<ChecklistFacts>) =>
      finishYourShop({ ...none, ...facts }).items.find((i) => i.id === 'delivery')!.done;
    expect(delivery({})).toBe(false);
    expect(delivery({ deliveryAreaCount: 1 })).toBe(true);
    expect(delivery({ pickupEnabled: true })).toBe(true);
  });
});
