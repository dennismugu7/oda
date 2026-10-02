import { describe, expect, it } from 'vitest';
import { formatKePhone, normalizeKePhone } from './phone';

describe('normalizeKePhone', () => {
  it.each([
    ['0712345678', '+254712345678'],
    ['0112345678', '+254112345678'],
    ['712345678', '+254712345678'],
    ['112345678', '+254112345678'],
    ['254712345678', '+254712345678'],
    ['+254712345678', '+254712345678'],
    ['0712 345 678', '+254712345678'],
    ['+254 712-345-678', '+254712345678'],
    ['(0712) 345.678', '+254712345678'],
    ['  0724880145 ', '+254724880145'],
  ])('%s → %s', (input, e164) => {
    expect(normalizeKePhone(input)).toBe(e164);
  });

  it.each([
    ['empty', ''],
    ['a landline (020…)', '0201234567'],
    ['another prefix (08…)', '0812345678'],
    ['too short', '071234567'],
    ['too long', '07123456789'],
    ['letters', '07123ABC78'],
    ['another country', '+255712345678'],
    ['a double plus', '++254712345678'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeKePhone(input)).toBeNull();
  });
});

describe('formatKePhone', () => {
  it('formats E.164 for display', () => {
    expect(formatKePhone('+254712345678')).toBe('0712 345 678');
    expect(formatKePhone('+254112345678')).toBe('0112 345 678');
  });

  it('leaves anything else unchanged', () => {
    expect(formatKePhone('not a phone')).toBe('not a phone');
  });
});
