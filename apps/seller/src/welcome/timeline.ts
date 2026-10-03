// Welcome animation timeline (docs/design-changes.md → 01-welcome, approved preview
// design/app/welcome-animation/01-welcome-animation-preview.html). One clock `t` in ms runs
// 0 → END on the UI thread; every element's transform/opacity is sampled from the same
// keyframes, offsets and easing curves as the preview's Web Animations. Plain functions
// marked as worklets, so Reanimated runs them on the UI thread and Vitest can test them.

export const END_MS = 2850;

type Easing = readonly [x1: number, y1: number, x2: number, y2: number];

export const EASE = {
  spring: [0.34, 1.56, 0.64, 1], // shop card: soft overshoot
  inOut: [0.42, 0, 0.58, 1], // CSS ease-in-out (finger)
  out: [0, 0, 0.58, 1], // CSS ease-out (tile, ring, order card)
  headline: [0.2, 0.8, 0.2, 1],
} as const satisfies Record<string, Easing>;

/** CSS cubic-bezier(x1, y1, x2, y2) at progress x (0–1). y may leave 0–1 (overshoot). */
export function cubicBezier(e: Easing, x: number): number {
  'worklet';
  const [x1, y1, x2, y2] = e;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  // Newton's method, then bisection if it doesn't converge.
  let s = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(s) - x;
    if (Math.abs(err) < 1e-6) return ((ay * s + by) * s + cy) * s;
    const d = slopeX(s);
    if (Math.abs(d) < 1e-6) break;
    s -= err / d;
  }
  let lo = 0;
  let hi = 1;
  s = x;
  for (let i = 0; i < 30; i++) {
    const v = sampleX(s);
    if (Math.abs(v - x) < 1e-6) break;
    if (v < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return ((ay * s + by) * s + cy) * s;
}

/** Keyframes as [offset, value] pairs, offsets 0 → 1. */
type Track = readonly (readonly [number, number])[];

export interface Anim {
  delay: number;
  duration: number;
  easing: Easing;
  tracks: Record<string, Track>;
}

/**
 * The preview's five steps. Values: opacity 0–1, translate in dp, rotate in degrees, scale.
 * Each element shows its first keyframe before its delay and its last after it ends (the
 * preview's fill: 'both').
 */
export const ANIMS = {
  // 1. 0–650 ms: shop card floats in, tilted, with a springy overshoot.
  shop: {
    delay: 0,
    duration: 650,
    easing: EASE.spring,
    tracks: {
      opacity: [
        [0, 0],
        [1, 1],
      ],
      translateY: [
        [0, 26],
        [1, 0],
      ],
      rotateX: [
        [0, 14],
        [1, 0],
      ],
      rotateZ: [
        [0, -4],
        [1, 0],
      ],
      scale: [
        [0, 0.94],
        [1, 1],
      ],
    },
  },
  // 2. 700–1450 ms: a finger glides in from 70 dp below-right of the food tile, presses, fades.
  finger: {
    delay: 700,
    duration: 750,
    easing: EASE.inOut,
    tracks: {
      opacity: [
        [0, 0],
        [0.25, 1],
        [0.7, 1],
        [0.82, 1],
        [1, 0],
      ],
      offset: [
        [0, 70],
        [0.25, 55],
        [0.7, 0],
        [0.82, 0],
        [1, 0],
      ], // dp right and down
      scale: [
        [0, 1],
        [0.25, 1],
        [0.7, 1],
        [0.82, 0.78],
        [1, 1.1],
      ],
    },
  },
  // 3a. 1300–2000 ms: the food tile presses, pops with a warm glow, settles.
  tile: {
    delay: 1300,
    duration: 700,
    easing: EASE.out,
    tracks: {
      scale: [
        [0, 1],
        [0.25, 0.92],
        [0.55, 1.06],
        [1, 1],
      ],
      glow: [
        [0, 0],
        [0.55, 1],
        [1, 0],
      ],
    },
  },
  // 3b. 1320–1920 ms: an orange ring expands from the tile and fades.
  ring: {
    delay: 1320,
    duration: 600,
    easing: EASE.out,
    // Like the preview (owner, 2026-10-03): the ring shows faintly on the food tile from the
    // start (its first keyframe, held before the delay), then expands and fades.
    tracks: {
      opacity: [
        [0, 0.9],
        [1, 0],
      ],
      scale: [
        [0, 1],
        [1, 1.6],
      ],
    },
  },
  // 4. 1550–2250 ms: the "New order #1042" card bounces in from below right.
  order: {
    delay: 1550,
    duration: 700,
    easing: EASE.out,
    tracks: {
      opacity: [
        [0, 0],
        [0.55, 1],
        [0.78, 1],
        [1, 1],
      ],
      translateX: [
        [0, 30],
        [0.55, 0],
        [0.78, 0],
        [1, 0],
      ],
      translateY: [
        [0, 70],
        [0.55, -8],
        [0.78, 3],
        [1, 0],
      ],
      scale: [
        [0, 0.9],
        [0.55, 1.02],
        [0.78, 0.995],
        [1, 1],
      ],
    },
  },
  // 5. 2250–2850 ms: the headline fades in from 14 dp below.
  headline: {
    delay: 2250,
    duration: 600,
    easing: EASE.headline,
    tracks: {
      opacity: [
        [0, 0],
        [1, 1],
      ],
      translateY: [
        [0, 14],
        [1, 0],
      ],
    },
  },
} as const satisfies Record<string, Anim>;

export type AnimName = keyof typeof ANIMS;

/** Linear interpolation through keyframes at eased progress p (extends past 0–1). */
function interpolateTrack(track: Track, p: number): number {
  'worklet';
  const n = track.length;
  if (p <= track[0]![0]) {
    // Overshoot below 0 extends the first segment.
    const [o0, v0] = track[0]!;
    const [o1, v1] = track[1]!;
    return v0 + ((p - o0) / (o1 - o0)) * (v1 - v0);
  }
  for (let i = 1; i < n; i++) {
    const [o1, v1] = track[i]!;
    if (p <= o1 || i === n - 1) {
      const [o0, v0] = track[i - 1]!;
      return v0 + ((p - o0) / (o1 - o0)) * (v1 - v0);
    }
  }
  return track[n - 1]![1];
}

/** The value of one property of one element at clock time t (ms). */
export function sample(anim: Anim, prop: string, t: number): number {
  'worklet';
  const track = anim.tracks[prop]!;
  const local = Math.min(1, Math.max(0, (t - anim.delay) / anim.duration));
  return interpolateTrack(track, cubicBezier(anim.easing, local));
}

/** Opacity clamped to 0–1 (the spring's overshoot must not exceed fully visible). */
export function opacityAt(anim: Anim, t: number): number {
  'worklet';
  return Math.min(1, Math.max(0, sample(anim, 'opacity', t)));
}
