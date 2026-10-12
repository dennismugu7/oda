import { describe, expect, it } from 'vitest';
import type { MoreData } from './api';
import {
  avatarTint,
  barFractions,
  compactNumber,
  customerLine,
  daysAgoWord,
  moreRowValues,
} from './view';

const more: MoreData = {
  shop: { name: 'Amani Styles', slug: 'amani-styles', url: '', linkPrefix: '', logoUrl: null },
  salesThisWeek: 18400,
  customers: 42,
  rating: { avg: 4.8, count: 38 },
  activeAccount: { type: 'till', number: '123456' },
  acceptsPayOnDelivery: false,
  deliveryAreas: 3,
  pickupEnabled: false,
  categories: 4,
};

describe('More row values (20-more)', () => {
  it('match the design wording', () => {
    expect(moreRowValues(more)).toEqual({
      insights: 'KSh 18,400 this week',
      customers: '42',
      reviews: '4.8 ★ · 38',
      payments: 'Till 123 456',
      delivery: '3 areas',
      categories: '4',
    });
  });

  it('say what to do when something is missing', () => {
    const empty = moreRowValues({
      ...more,
      salesThisWeek: 0,
      rating: { avg: null, count: 0 },
      activeAccount: null,
      deliveryAreas: 0,
    });
    expect(empty).toMatchObject({
      insights: 'KSh 0 this week',
      reviews: 'From buyers',
      payments: 'Add M-Pesa',
      delivery: 'Arranged with buyers',
    });
    expect(
      moreRowValues({ ...more, activeAccount: null, acceptsPayOnDelivery: true }).payments,
    ).toBe('Pay on delivery');
    expect(moreRowValues({ ...more, deliveryAreas: 1 }).delivery).toBe('1 area');
    expect(moreRowValues({ ...more, deliveryAreas: 0, pickupEnabled: true }).delivery).toBe(
      'Pickup',
    );
  });
});

describe('Insights and Customers', () => {
  it('scales bars to the tallest, and keeps big numbers short', () => {
    expect(barFractions([0, 500, 1000])).toEqual([0, 0.5, 1]);
    expect(barFractions([0, 0])).toEqual([0, 0]);
    expect(compactNumber(1530)).toBe('1,530');
    expect(compactNumber(18400)).toBe('18.4k');
    expect(compactNumber(250000)).toBe('250k');
  });

  it('says when a customer last ordered, in Nairobi days', () => {
    const now = new Date('2026-10-07T09:00:00Z'); // 12:00 Nairobi
    expect(daysAgoWord('2026-10-06T21:30:00Z', now)).toBe('today'); // 00:30 Nairobi
    expect(daysAgoWord('2026-10-06T20:30:00Z', now)).toBe('yesterday');
    expect(daysAgoWord('2026-10-04T09:00:00Z', now)).toBe('3 days ago');
    expect(daysAgoWord('2026-09-01T09:00:00Z', now)).toBe('5 weeks ago');
    expect(customerLine({ orderCount: 1, lastOrderAt: '2026-10-07T08:00:00Z' }, now)).toBe(
      '1 order · today',
    );
  });

  it('gives each customer a steady avatar colour', () => {
    expect(avatarTint('+254712345678')).toEqual(avatarTint('+254712345678'));
  });
});
