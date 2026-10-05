import { describe, expect, it } from 'vitest';
import {
  deliveryAreaOrderInput,
  freeDeliveryLine,
  freeDeliveryTitle,
  hasDeliveryOption,
  pickupLine,
} from './delivery';

describe('delivery', () => {
  it('a shop needs an area or pickup to take orders (decision #61 c)', () => {
    expect(hasDeliveryOption({ areaCount: 0, pickupEnabled: false })).toBe(false);
    expect(hasDeliveryOption({ areaCount: 1, pickupEnabled: false })).toBe(true);
    expect(hasDeliveryOption({ areaCount: 0, pickupEnabled: true })).toBe(true);
  });

  it('writes the pickup and free-delivery lines from 20b-delivery', () => {
    expect(pickupLine('Kilimani stall', 'Mon–Sat 9am–6pm')).toBe(
      'Free · Kilimani stall, Mon–Sat 9am–6pm',
    );
    expect(pickupLine('Kilimani stall', null)).toBe('Free · Kilimani stall');
    expect(pickupLine(null, null)).toBe('Free');
    expect(freeDeliveryTitle(5000)).toBe('On orders over KSh 5,000');
    expect(freeDeliveryTitle(null)).toBe('Free delivery is off');
    const areas = [
      { name: 'Kilimani', freeDeliveryEligible: true },
      { name: 'Rest of Nairobi', freeDeliveryEligible: true },
      { name: 'Outside Nairobi', freeDeliveryEligible: false },
    ];
    expect(freeDeliveryLine(areas)).toBe('Kilimani, Rest of Nairobi');
    expect(freeDeliveryLine(areas.slice(0, 2))).toBe('All delivery areas');
    expect(freeDeliveryLine(areas.slice(2))).toBe('No areas included yet: turn it on in an area');
  });

  it('a reorder lists each area once', () => {
    const id = '7f0c9a52-3c1b-4a5e-9a49-1d2b3c4d5e6f';
    expect(deliveryAreaOrderInput.safeParse({ ids: [id] }).success).toBe(true);
    expect(deliveryAreaOrderInput.safeParse({ ids: [id, id] }).success).toBe(false);
    expect(deliveryAreaOrderInput.safeParse({ ids: [] }).success).toBe(false);
    expect(deliveryAreaOrderInput.safeParse({ ids: ['x'] }).success).toBe(false);
  });
});
