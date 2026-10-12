import { z } from 'zod';
import { formatKsh } from './money';
import type { DeliveryMethod } from './schemas/enums';

// Delivery (screen 20b-delivery, spec §5.7; moved to M6 by decision #61): request shapes the
// seller app sends besides the area fields in schemas/write.ts, and the lines both the app
// and the server show.

/** The new order of all the shop's delivery areas (buyers see them in this order). */
export const deliveryAreaOrderInput = z.strictObject({
  ids: z
    .array(z.uuid({ error: 'Unknown delivery area.' }))
    .min(1, { error: 'No delivery areas.' })
    .max(100, { error: 'Too many delivery areas at once.' })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: 'A delivery area is listed twice.',
    }),
});

/**
 * At least one delivery area, or pickup on. Optional since decision #110: without one, buyers
 * still order and arrange delivery with the seller (it no longer decides taking orders).
 */
export function hasDeliveryOption(facts: { areaCount: number; pickupEnabled: boolean }): boolean {
  return facts.areaCount > 0 || facts.pickupEnabled;
}

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  rider: 'By rider',
  parcel: 'Bus parcel or courier',
};

/** "Free · Kilimani stall, Mon–Sat 9am–6pm" under "Buyers can pick up". */
export function pickupLine(location: string | null, hours: string | null): string {
  return ['Free', [location, hours].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

/** The line under "On orders over KSh 5,000": which areas it applies to. */
export function freeDeliveryLine(areas: { name: string; freeDeliveryEligible: boolean }[]): string {
  const eligible = areas.filter((a) => a.freeDeliveryEligible).map((a) => a.name);
  if (eligible.length === 0) return 'No areas included yet: turn it on in an area';
  if (eligible.length === areas.length) return 'All delivery areas';
  return eligible.join(', ');
}

export function freeDeliveryTitle(threshold: number | null): string {
  return threshold === null ? 'Free delivery is off' : `On orders over ${formatKsh(threshold)}`;
}
