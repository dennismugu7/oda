import { describe, expect, it } from 'vitest';
import { extractMpesaCode } from './mpesa';

const SMS =
  'TIG4K7XQ2P Confirmed. Ksh2,500.00 paid to AMANI STYLES. on 1/10/26 at 10:31 AM.New M-PESA balance is Ksh3,120.00. Transaction cost, Ksh0.00.';

describe('extractMpesaCode: accepted', () => {
  it.each([
    ['a bare code', 'TIG4K7XQ2P', 'TIG4K7XQ2P'],
    ['an all-letters code', 'QWERTYUIOP', 'QWERTYUIOP'],
    ['lower case', 'tig4k7xq2p', 'TIG4K7XQ2P'],
    ['surrounding spaces', '   TIG4K7XQ2P  ', 'TIG4K7XQ2P'],
    ['a trailing dot', 'TIG4K7XQ2P.', 'TIG4K7XQ2P'],
    ['a full confirmation SMS', SMS, 'TIG4K7XQ2P'],
  ])('%s', (_label, input, code) => {
    expect(extractMpesaCode(input)).toBe(code);
  });
});

describe('extractMpesaCode: several candidates', () => {
  it('prefers the token right before "Confirmed"', () => {
    expect(extractMpesaCode('Hi WANJIKUMWA here: SJK4X7PQ2M Confirmed. Ksh4,300.00 sent')).toBe(
      'SJK4X7PQ2M',
    );
  });

  it('otherwise takes the first match', () => {
    expect(extractMpesaCode('paid with SJK4X7PQ2M and TIG4K7XQ2P')).toBe('SJK4X7PQ2M');
  });
});

describe('extractMpesaCode: rejected', () => {
  it.each([
    ['no code', 'I have paid, please check'],
    ['9 characters', 'TIG4K7XQ2'],
    ['11 characters', 'TIG4K7XQ2PX'],
    ['starts with a digit', '1IG4K7XQ2P'],
    ['empty', ''],
  ])('%s', (_label, input) => {
    expect(extractMpesaCode(input)).toBeNull();
  });
});
