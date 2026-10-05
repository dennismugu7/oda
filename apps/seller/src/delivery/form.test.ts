import { describe, expect, it } from 'vitest';
import { areaProblem, emptyArea, fieldsFromDraft, parseShillings } from './form';

describe('delivery area form', () => {
  it('parses whole shillings with commas and spaces', () => {
    expect(parseShillings('1,200')).toBe(1200);
    expect(parseShillings(' 300 ')).toBe(300);
    expect(parseShillings('0')).toBe(0);
    expect(parseShillings('12.5')).toBeNull();
    expect(parseShillings('-1')).toBeNull();
    expect(parseShillings('')).toBeNull();
  });

  it('needs a name and a fee; 0 is a valid fee', () => {
    expect(areaProblem(emptyArea())?.field).toBe('name');
    expect(areaProblem({ ...emptyArea(), name: 'CBD' })?.field).toBe('fee');
    expect(areaProblem({ ...emptyArea(), name: 'CBD', fee: 'abc' })?.message).toBe(
      'Enter whole shillings.',
    );
    expect(areaProblem({ ...emptyArea(), name: 'CBD', fee: '0' })).toBeNull();
  });

  it('trims text and sends an empty delivery time as null', () => {
    expect(fieldsFromDraft({ ...emptyArea(), name: '  CBD ', fee: '200', etaLabel: '  ' })).toEqual(
      { name: 'CBD', fee: 200, method: 'rider', etaLabel: null, freeDeliveryEligible: false },
    );
  });
});
