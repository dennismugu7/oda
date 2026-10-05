import { describe, expect, it } from 'vitest';
import {
  greeting,
  manualOrderInput,
  notificationsReadInput,
  topSourceLine,
  weekBarLabels,
  weekChange,
} from './sellerHome';

const PRODUCT = '7f0c9a52-3c1b-4a5e-9a49-1d2b3c4d5e6f';

describe('Home helpers', () => {
  it('greets by the Nairobi clock', () => {
    expect(greeting(new Date('2026-10-05T04:00:00Z'))).toBe('Good morning'); // 07:00
    expect(greeting(new Date('2026-10-05T10:00:00Z'))).toBe('Good afternoon'); // 13:00
    expect(greeting(new Date('2026-10-05T16:00:00Z'))).toBe('Good evening'); // 19:00
    expect(greeting(new Date('2026-10-05T23:30:00Z'))).toBe('Good evening'); // 02:30
  });

  it('compares the week with last week', () => {
    expect(weekChange(18_400, 15_082)).toEqual({ text: '+22% vs last week', up: true });
    expect(weekChange(500, 1000)).toEqual({ text: '-50% vs last week', up: false });
    expect(weekChange(500, 0)).toBeNull();
    expect(weekBarLabels(6)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'Today']);
  });

  it('names the top source', () => {
    expect(topSourceLine({ source: 'tt', count: 8 }, 12)).toBe(
      '8 of 12 orders came from TikTok this week',
    );
    expect(topSourceLine({ source: 'direct', count: 3 }, 3)).toBeNull();
    expect(topSourceLine(null, 0)).toBeNull();
  });
});

describe('manual orders and notifications', () => {
  const order = {
    idempotencyKey: 'manual-abcdefgh12345678',
    buyer: { name: 'Njeri Kamau', phone: '0724 880 145' },
    lines: [{ productId: PRODUCT, qty: 1, size: 'M' }],
    fulfilment: { kind: 'pickup' },
    payment: 'not_paid',
  };

  it('whitelists the fields and normalises the phone', () => {
    const parsed = manualOrderInput.parse(order);
    expect(parsed.buyer).toEqual({ name: 'Njeri Kamau', phone: '+254724880145', whatsapp: true });
    expect(manualOrderInput.safeParse({ ...order, source: 'tt' }).success).toBe(false);
    expect(manualOrderInput.safeParse({ ...order, lines: [] }).success).toBe(false);
    expect(manualOrderInput.safeParse({ ...order, payment: 'free' }).success).toBe(false);
    expect(manualOrderInput.safeParse({ ...order, deliveryFeeOverride: -1 }).success).toBe(false);
    expect(manualOrderInput.safeParse({ ...order, deliveryFeeOverride: 0 }).success).toBe(true);
  });

  it('marks some or all notifications read', () => {
    expect(notificationsReadInput.parse({})).toEqual({});
    expect(notificationsReadInput.safeParse({ ids: [] }).success).toBe(false);
    expect(notificationsReadInput.safeParse({ ids: ['x'] }).success).toBe(false);
  });
});
