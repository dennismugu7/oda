import { describe, expect, it } from 'vitest';
import { ANIMS, cubicBezier, EASE, END_MS, opacityAt, sample } from './timeline';

const at = (name: keyof typeof ANIMS, prop: string, t: number) => sample(ANIMS[name], prop, t);

describe('cubicBezier', () => {
  /** Independent reference: walk the curve's parameter finely and read y at x. */
  function bruteForce(e: readonly [number, number, number, number], x: number): number {
    const [x1, y1, x2, y2] = e;
    const bez = (a: number, b: number, s: number) =>
      3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
    let best = 0;
    let bestErr = Infinity;
    for (let i = 0; i <= 200_000; i++) {
      const s = i / 200_000;
      const err = Math.abs(bez(x1, x2, s) - x);
      if (err < bestErr) {
        bestErr = err;
        best = bez(y1, y2, s);
      }
    }
    return best;
  }

  it('matches the CSS curves', () => {
    for (const e of Object.values(EASE)) {
      for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        expect(cubicBezier(e, x)).toBeCloseTo(bruteForce(e, x), 4);
      }
    }
    expect(cubicBezier(EASE.inOut, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('overshoots for the spring curve', () => {
    const peak = Math.max(
      ...Array.from({ length: 101 }, (_, i) => cubicBezier(EASE.spring, i / 100)),
    );
    expect(peak).toBeGreaterThan(1.05);
    expect(cubicBezier(EASE.spring, 1)).toBe(1);
  });
});

describe('the five steps (design-changes.md → 01-welcome)', () => {
  it('play inside their windows, ~2.85 s in total', () => {
    const windows = Object.fromEntries(
      Object.entries(ANIMS).map(([k, a]) => [k, [a.delay, a.delay + a.duration]]),
    );
    expect(windows).toEqual({
      shop: [0, 650],
      finger: [700, 1450],
      tile: [1300, 2000],
      ring: [1320, 1920],
      order: [1550, 2250],
      headline: [2250, 2850],
    });
    expect(END_MS).toBe(2850);
  });

  it('start hidden: card, finger, ring, order card and headline', () => {
    for (const name of ['shop', 'finger', 'ring', 'order', 'headline'] as const) {
      expect(opacityAt(ANIMS[name], 0), name).toBe(0);
    }
    expect(at('shop', 'translateY', 0)).toBe(26);
    expect(at('shop', 'rotateX', 0)).toBe(14);
    expect(at('shop', 'rotateZ', 0)).toBe(-4);
    expect(at('shop', 'scale', 0)).toBe(0.94);
    expect(at('order', 'translateX', 0)).toBe(30);
    expect(at('order', 'translateY', 0)).toBe(70);
  });

  it('end still in the final state (also what Remove animations shows)', () => {
    for (const t of [END_MS, END_MS + 5000]) {
      expect(opacityAt(ANIMS.shop, t)).toBe(1);
      expect(opacityAt(ANIMS.order, t)).toBe(1);
      expect(opacityAt(ANIMS.headline, t)).toBe(1);
      expect(opacityAt(ANIMS.finger, t)).toBe(0);
      expect(opacityAt(ANIMS.ring, t)).toBe(0);
      expect(at('tile', 'glow', t)).toBe(0);
      for (const [name, prop] of [
        ['shop', 'translateY'],
        ['shop', 'rotateX'],
        ['shop', 'rotateZ'],
        ['order', 'translateX'],
        ['order', 'translateY'],
        ['headline', 'translateY'],
      ] as const) {
        expect(at(name, prop, t), `${name}.${prop}`).toBeCloseTo(0, 6);
      }
      expect(at('shop', 'scale', t)).toBe(1);
      expect(at('tile', 'scale', t)).toBe(1);
      expect(at('order', 'scale', t)).toBe(1);
    }
  });

  it('the shop card springs past rest before settling', () => {
    const scales = Array.from({ length: 66 }, (_, i) => at('shop', 'scale', i * 10));
    expect(Math.max(...scales)).toBeGreaterThan(1.001);
  });

  it('the finger reaches the tile centre and presses to 0.78', () => {
    const press = 700 + 0.82 * 750;
    // At the eased progress where the press keyframe sits, the finger is at the tile.
    let closest = Infinity;
    let minScale = Infinity;
    for (let t = 700; t <= 1450; t += 5) {
      closest = Math.min(closest, Math.abs(at('finger', 'offset', t)));
      minScale = Math.min(minScale, at('finger', 'scale', t));
    }
    expect(closest).toBeLessThan(0.5);
    expect(minScale).toBeCloseTo(0.78, 2);
    expect(press).toBeLessThan(1450);
  });

  it('the tile presses to 0.92, pops to 1.06 with the glow, and the ring grows to 1.6', () => {
    const tile = Array.from({ length: 71 }, (_, i) => at('tile', 'scale', 1300 + i * 10));
    expect(Math.min(...tile)).toBeCloseTo(0.92, 2);
    expect(Math.max(...tile)).toBeCloseTo(1.06, 2);
    const glow = Array.from({ length: 701 }, (_, i) => at('tile', 'glow', 1300 + i));
    expect(Math.max(...glow)).toBeCloseTo(1, 2);
    expect(opacityAt(ANIMS.ring, 1319)).toBe(0);
    expect(opacityAt(ANIMS.ring, 1320)).toBeCloseTo(0.9, 5);
    expect(at('ring', 'scale', 1920)).toBeCloseTo(1.6, 5);
  });

  it('the order card bounces: up past rest (−8), back (+3), then rest', () => {
    const ys = Array.from({ length: 71 }, (_, i) => at('order', 'translateY', 1550 + i * 10));
    expect(Math.min(...ys)).toBeCloseTo(-8, 0);
    const afterPeak = ys.slice(ys.indexOf(Math.min(...ys)));
    expect(Math.max(...afterPeak)).toBeGreaterThan(2);
  });
});
