import { describe, expect, it } from 'vitest';
import { barOf, periodChange, periodWindow } from './insights';

// Nairobi = UTC+3. 2026-10-07 is a Wednesday.
const at = (iso: string) => new Date(iso);

describe('insight periods (Nairobi time)', () => {
  it('today: from Nairobi midnight, hourly bars, vs the same time yesterday', () => {
    const now = at('2026-10-07T07:30:00Z'); // 10:30 Nairobi
    const w = periodWindow('today', now);
    expect(w.start).toEqual(at('2026-10-06T21:00:00Z'));
    expect(w.prevStart).toEqual(at('2026-10-05T21:00:00Z'));
    expect(w.prevEnd).toEqual(at('2026-10-06T07:30:00Z'));
    expect(w).toMatchObject({ bars: 24, current: 10, firstDay: '2026-10-07', today: '2026-10-07' });
    expect(w.labels[0]).toBe('12am');
    expect(w.labels[10]).toBe('Now');
    expect(w.labels[18]).toBe('6pm');
    // 00:30 Nairobi on the 7th is still "today" though it's the 6th in UTC.
    expect(barOf(w, at('2026-10-06T21:30:00Z'))).toBe(0);
    expect(barOf(w, at('2026-10-06T20:59:59Z'))).toBeNull();
  });

  it('week: Monday first, vs the same stretch of last week', () => {
    const now = at('2026-10-07T07:30:00Z');
    const w = periodWindow('week', now);
    expect(w.start).toEqual(at('2026-10-04T21:00:00Z')); // Mon 5 Oct 00:00 Nairobi
    expect(w.prevStart).toEqual(at('2026-09-27T21:00:00Z'));
    expect(w.prevEnd).toEqual(at('2026-09-30T07:30:00Z'));
    expect(w).toMatchObject({ bars: 7, current: 2, firstDay: '2026-10-05' });
    expect(w.labels).toEqual(['M', 'T', 'Today', 'T', 'F', 'S', 'S']);
    expect(barOf(w, at('2026-10-11T20:00:00Z'))).toBe(6); // Sun 23:00 Nairobi
  });

  it('a Sunday night in Nairobi is still that week', () => {
    const w = periodWindow('week', at('2026-10-11T20:30:00Z')); // Sun 23:30 Nairobi
    expect(w.current).toBe(6);
    expect(periodWindow('week', at('2026-10-11T21:30:00Z')).current).toBe(0); // Mon 00:30
  });

  it('month: from the 1st, daily bars, vs as far into last month (never past its end)', () => {
    const w = periodWindow('month', at('2026-10-07T07:30:00Z'));
    expect(w.start).toEqual(at('2026-09-30T21:00:00Z'));
    expect(w.prevStart).toEqual(at('2026-08-31T21:00:00Z'));
    expect(w.prevEnd).toEqual(at('2026-09-07T07:30:00Z'));
    expect(w).toMatchObject({ bars: 31, current: 6, firstDay: '2026-10-01' });
    // 31 March vs February: last month's stretch stops at its end.
    const march = periodWindow('month', at('2026-03-31T09:00:00Z'));
    expect(march.prevEnd).toEqual(at('2026-02-28T21:00:00Z'));
  });

  it('says the change, or nothing without a previous period', () => {
    expect(periodChange(18400, 15082, 'week')).toEqual({ text: '+22% vs last week', up: true });
    expect(periodChange(500, 1000, 'today')).toEqual({ text: '-50% vs yesterday', up: false });
    expect(periodChange(500, 0, 'month')).toBeNull();
  });
});
