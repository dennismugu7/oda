import { describe, expect, it } from 'vitest';
import {
  canReviewOrder,
  cleanReviewText,
  reviewDisplayName,
  reviewInput,
  reviewRemoveInput,
  reviewReplyInput,
  starText,
  stripPhones,
} from './reviews';

const itemId = '6f1c1d8e-3a52-4c1b-9a43-0d6c2b1e7f10';

describe('review text cleaning (decision #73 b)', () => {
  it.each([
    ['Call me on 0712 345 678 for more', 'Call me on for more'],
    ['WhatsApp +254-712-345-678 now', 'WhatsApp now'],
    ['254712345678', ''],
    ['(0712) 345.678 thanks', 'thanks'],
  ])('strips the phone number in %j', (input, expected) => {
    expect(stripPhones(input)).toBe(expected);
  });

  it('keeps prices, sizes and short numbers', () => {
    expect(stripPhones('Paid KSh 2,500 for size 42, arrived in 2 days')).toBe(
      'Paid KSh 2,500 for size 42, arrived in 2 days',
    );
  });

  it('strips links and phones together', () => {
    expect(cleanReviewText('Great! See https://spam.example and www.x.com or 0712345678')).toBe(
      'Great! See and or',
    );
    expect(cleanReviewText('visit cheapdeals.co.ke today')).toBe('visit today');
  });
});

describe('reviewDisplayName (decision #73 e)', () => {
  it.each([
    ['Wanjiku Mwangi', 'Wanjiku M.'],
    ['wanjiku mary mwangi', 'Wanjiku M.'],
    ['Otieno', 'Otieno'],
    ['  Achieng   Odhiambo  ', 'Achieng O.'],
    ['Amina 0712345678', 'Amina'],
    ['0712345678', 'Buyer'],
    ['Zoë Ölander', 'Zoë Ö.'],
  ])('%j → %j', (name, shown) => {
    expect(reviewDisplayName(name)).toBe(shown);
  });
});

describe('reviewInput', () => {
  it('accepts a full review and cleans the item text', () => {
    const parsed = reviewInput.parse({
      rating: 5,
      tags: ['Well packed', 'As described', 'Well packed'],
      items: [
        { orderItemId: itemId, rating: 4, text: 'Lovely, call 0712 345 678', photoKey: null },
      ],
    });
    expect(parsed.tags).toEqual(['As described', 'Well packed']);
    expect(parsed.items[0]).toEqual({
      orderItemId: itemId,
      rating: 4,
      text: 'Lovely, call',
      photoKey: null,
    });
  });

  it('needs the overall stars, allows an unrated item, refuses unknown tags and fields', () => {
    expect(reviewInput.safeParse({ tags: [] }).success).toBe(false);
    expect(reviewInput.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewInput.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewInput.safeParse({ rating: 4, tags: ['Cheap'] }).success).toBe(false);
    expect(reviewInput.safeParse({ rating: 4, buyerDisplayName: 'Me' }).success).toBe(false);
    const unrated = reviewInput.parse({ rating: 3, items: [{ orderItemId: itemId }] });
    expect(unrated.items[0]).toMatchObject({ rating: null, text: null, photoKey: null });
  });

  it('limits item text to 500 characters after cleaning', () => {
    const long = { rating: 4, items: [{ orderItemId: itemId, text: 'a'.repeat(501) }] };
    expect(reviewInput.safeParse(long).success).toBe(false);
    const ok = { rating: 4, items: [{ orderItemId: itemId, text: 'a'.repeat(500) }] };
    expect(reviewInput.safeParse(ok).success).toBe(true);
  });

  it('refuses photo keys that are not storage keys', () => {
    const bad = { rating: 4, items: [{ orderItemId: itemId, photoKey: '../etc/passwd' }] };
    expect(reviewInput.safeParse(bad).success).toBe(false);
  });
});

describe('other review rules', () => {
  it('only delivered, buyer-placed orders can be reviewed (decision #73 i)', () => {
    expect(canReviewOrder({ status: 'delivered', source: 'whatsapp' })).toBe(true);
    expect(canReviewOrder({ status: 'delivered', source: 'manual' })).toBe(false);
    expect(canReviewOrder({ status: 'sent', source: 'direct' })).toBe(false);
    expect(canReviewOrder({ status: 'cancelled', source: 'direct' })).toBe(false);
  });

  it('starText, reply and removal inputs', () => {
    expect(starText(4)).toBe('★★★★☆');
    expect(reviewReplyInput.parse({ reply: '  ' }).reply).toBeNull();
    expect(reviewReplyInput.parse({ reply: 'Thanks! Call 0712345678' }).reply).toBe('Thanks! Call');
    expect(
      reviewRemoveInput.safeParse({ reviewId: itemId, reason: 'abuse', actor: 'dennismugu7' })
        .success,
    ).toBe(true);
    expect(
      reviewRemoveInput.safeParse({ reviewId: itemId, reason: 'abuse', actor: 'a b' }).success,
    ).toBe(false);
    const bySlug = { shopSlug: 'amani-styles', orderNumber: 1042, reason: 'abuse', actor: 'x' };
    expect(reviewRemoveInput.safeParse(bySlug).success).toBe(true);
    expect(reviewRemoveInput.safeParse({ ...bySlug, reviewId: itemId }).success).toBe(false);
    expect(reviewRemoveInput.safeParse({ reason: 'abuse', actor: 'x' }).success).toBe(false);
  });
});
