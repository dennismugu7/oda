import { describe, expect, it } from 'vitest';
import { clock24, headerTime, listTime, shortDate } from './nairobiTime';

// 2026-10-05 10:31 in Nairobi = 07:31 UTC.
const now = new Date('2026-10-05T07:31:00Z');

describe('Nairobi times for the seller app', () => {
  it('formats the clock and date in Nairobi, whatever the phone’s zone', () => {
    expect(clock24(new Date('2026-10-05T05:48:00Z'))).toBe('08:48');
    expect(clock24(new Date('2026-10-04T21:05:00Z'))).toBe('00:05');
    expect(shortDate(new Date('2026-09-30T09:00:00Z'))).toBe('Wed 30 Sep');
  });

  it('list rows: minutes ago, today’s time, yesterday, then the date', () => {
    expect(listTime(new Date('2026-10-05T07:30:40Z'), now)).toBe('Just now');
    expect(listTime(new Date('2026-10-05T07:19:00Z'), now)).toBe('12 min ago');
    expect(listTime(new Date('2026-10-05T05:48:00Z'), now)).toBe('08:48');
    // 23:30 Nairobi the day before (20:30 UTC) is yesterday, not today.
    expect(listTime(new Date('2026-10-04T20:30:00Z'), now)).toBe('Yesterday');
    // 00:05 Nairobi today (21:05 UTC the day before) is today.
    expect(listTime(new Date('2026-10-04T21:05:00Z'), now)).toBe('00:05');
    expect(listTime(new Date('2026-09-30T09:00:00Z'), now)).toBe('Wed 30 Sep');
  });

  it('the order header', () => {
    expect(headerTime(new Date('2026-10-05T07:00:00Z'), now)).toBe('Today, 10:00');
    expect(headerTime(new Date('2026-10-04T15:02:00Z'), now)).toBe('Yesterday, 18:02');
    expect(headerTime(new Date('2026-09-30T06:15:00Z'), now)).toBe('Wed 30 Sep, 09:15');
  });
});
