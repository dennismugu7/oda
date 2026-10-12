import { describe, expect, it } from 'vitest';
import {
  addLine,
  lineOptions,
  newIdempotencyKey,
  newOrderProblem,
  stepQty,
  type DraftLine,
} from './newOrder';

const dress: DraftLine = {
  productId: 'p1',
  name: 'Ankara wrap dress',
  unitPrice: 2500,
  thumbUrl: null,
  size: 'M',
  colour: null,
  qty: 1,
};

describe('New order lines', () => {
  it('merges the same product, size and colour; keeps other sizes apart', () => {
    let lines = addLine([], dress);
    lines = addLine(lines, dress);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.qty).toBe(2);
    lines = addLine(lines, { ...dress, size: 'L' });
    expect(lines).toHaveLength(2);
  });

  it('steps quantities and removes a line at 0', () => {
    const lines = stepQty([dress], 0, 1);
    expect(lines[0]!.qty).toBe(2);
    expect(stepQty([dress], 0, -1)).toEqual([]);
    expect(lineOptions({ size: 'M', colour: 'Red' })).toBe('Size M · Red');
    expect(lineOptions({ size: null, colour: null })).toBe('');
  });

  it('says what to fix first', () => {
    const ok = {
      name: 'Njeri',
      phone: '0724880145',
      lines: [dress],
      fulfilment: { kind: 'pickup' as const },
    };
    expect(newOrderProblem(ok)).toBeNull();
    expect(newOrderProblem({ ...ok, name: ' ' })).toBe('Enter the buyer’s name.');
    expect(newOrderProblem({ ...ok, lines: [] })).toBe('Add at least one product.');
    expect(newOrderProblem({ ...ok, fulfilment: null })).toBe(
      'Choose pickup, a delivery area or Arrange with buyer.',
    );
    // Arranged with the buyer (decision #110): no address needed, the note is optional.
    expect(newOrderProblem({ ...ok, fulfilment: { kind: 'arranged', note: null } })).toBeNull();
    expect(
      newOrderProblem({ ...ok, fulfilment: { kind: 'delivery', areaId: 'a', addressText: '' } }),
    ).toBe('Enter the delivery address.');
  });

  it('makes idempotency keys the server accepts', () => {
    expect(newIdempotencyKey()).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
