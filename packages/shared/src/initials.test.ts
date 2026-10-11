import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('one word: its first letter', () => {
    expect(initials('Furaha')).toBe('F');
    expect(initials('  amani ')).toBe('A');
  });

  it('two or more words: the first letters of the first two', () => {
    expect(initials('Furaha Styles')).toBe('FS');
    expect(initials('Mama Njeri Fabrics')).toBe('MN');
    expect(initials('demo   duka')).toBe('DD');
  });

  it('keeps whole characters and handles empty names', () => {
    expect(initials('Élan Wear')).toBe('ÉW');
    expect(initials('😀 Shop')).toBe('😀S');
    expect(initials('')).toBe('');
  });
});
