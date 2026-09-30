import { describe, expect, it } from 'vitest';
import { formatKes, formatKsh } from './money';

describe('money formatting', () => {
  it('formats the seller app style', () => {
    expect(formatKsh(2500)).toBe('KSh 2,500');
    expect(formatKsh(18400)).toBe('KSh 18,400');
    expect(formatKsh(0)).toBe('KSh 0');
  });

  it('formats the buyer web style', () => {
    expect(formatKes(4300)).toBe('KES 4,300');
    expect(formatKes(1250000)).toBe('KES 1,250,000');
  });

  it('rejects fractional or unsafe amounts', () => {
    expect(() => formatKsh(10.5)).toThrow(RangeError);
    expect(() => formatKes(Number.NaN)).toThrow(RangeError);
  });
});
