import { describe, expect, it } from 'vitest';
import { formatKsh } from './money';

describe('money formatting', () => {
  it('shows KSh everywhere (app, web, emails, link previews)', () => {
    expect(formatKsh(2500)).toBe('KSh 2,500');
    expect(formatKsh(18400)).toBe('KSh 18,400');
    expect(formatKsh(0)).toBe('KSh 0');
    expect(formatKsh(4300)).toBe('KSh 4,300');
    expect(formatKsh(1250000)).toBe('KSh 1,250,000');
  });

  it('rejects fractional or unsafe amounts', () => {
    expect(() => formatKsh(10.5)).toThrow(RangeError);
    expect(() => formatKsh(Number.NaN)).toThrow(RangeError);
  });
});
