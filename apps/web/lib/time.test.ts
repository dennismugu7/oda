import { describe, expect, it } from 'vitest';
import { clockTime, orderDayTime, orderTime } from './time';

describe('order times (Nairobi)', () => {
  // 07:42 UTC = 10:42am in Nairobi (UTC+3).
  const at = new Date('2026-09-30T07:42:00Z');

  it('shows the clock time on the same Nairobi day, the date otherwise', () => {
    expect(clockTime(at)).toBe('10:42am');
    expect(orderTime(at, new Date('2026-09-30T20:00:00Z'))).toBe('10:42am');
    // 21:30 UTC on the 30th is already 1 Oct in Nairobi.
    expect(orderTime(at, new Date('2026-09-30T21:30:00Z'))).toBe('Wed 30 Sep');
  });

  it('formats the delivered card', () => {
    expect(orderDayTime(new Date('2026-10-03T11:05:00Z'))).toBe('Saturday, 3 Oct · 2:05pm');
  });
});
