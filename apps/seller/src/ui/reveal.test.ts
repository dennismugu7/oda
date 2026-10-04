import { describe, expect, it } from 'vitest';
import { revealOffset } from './reveal';

describe('revealOffset', () => {
  const base = { fieldHeight: 140, viewportHeight: 300, margin: 16 };

  it('leaves a fully visible field alone', () => {
    expect(revealOffset({ ...base, fieldTop: 100, scrollY: 0 })).toBeNull();
  });

  it('scrolls down until the field and its rules clear the keyboard', () => {
    // Password field + rules at 400–540; visible area 0–300 → scroll to 556 − 300.
    expect(revealOffset({ ...base, fieldTop: 400, scrollY: 0 })).toBe(256);
  });

  it('scrolls up to a field above the visible area', () => {
    expect(revealOffset({ ...base, fieldTop: 50, scrollY: 200 })).toBe(34);
  });

  it('shows the top of a field taller than the view', () => {
    expect(revealOffset({ ...base, fieldHeight: 400, fieldTop: 500, scrollY: 0 })).toBe(484);
  });

  it('never scrolls above the top, and waits for a measured view', () => {
    expect(revealOffset({ ...base, fieldTop: 5, scrollY: 40 })).toBe(0);
    expect(revealOffset({ ...base, viewportHeight: 0, fieldTop: 900, scrollY: 0 })).toBeNull();
  });
});
