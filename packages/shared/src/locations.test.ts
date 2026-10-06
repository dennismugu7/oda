import { describe, expect, it } from 'vitest';
import { LOCATION_CHOICES, searchLocations } from './locations';

describe('location picker', () => {
  it('lists Nairobi areas as "Area, Nairobi", then towns', () => {
    expect(LOCATION_CHOICES).toContain('Kilimani, Nairobi');
    expect(LOCATION_CHOICES).toContain('Mombasa');
    expect(new Set(LOCATION_CHOICES).size).toBe(LOCATION_CHOICES.length);
  });

  it('matches word starts first, any case', () => {
    expect(searchLocations('kil')).toEqual(['Kilimani, Nairobi', 'Kileleshwa, Nairobi', 'Kilifi']);
    expect(searchLocations('south')[0]).toBe('South B, Nairobi');
    expect(searchLocations('')).toHaveLength(8);
    expect(searchLocations('zzz')).toEqual([]);
  });
});
