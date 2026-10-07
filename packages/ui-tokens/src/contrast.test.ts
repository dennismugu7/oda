import { describe, expect, it } from 'vitest';
import { colors } from './tokens';

// M10 CP3 accessibility (decision #84): the colour pairs the app and the web actually use,
// against WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold) and
// for icons and other graphics that carry meaning.

type Name = keyof typeof colors;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT: [Name, Name, string][] = [
  ['text', 'background', 'body text'],
  ['text', 'surface', 'body text on cards'],
  ['textSecondary', 'background', 'secondary text'],
  ['textSecondary', 'surface', 'secondary text on cards'],
  ['textSecondary', 'surfaceMuted', 'secondary text on tiles'],
  ['textSecondary', 'peach', 'bookmark note'],
  ['textSecondary', 'beige', 'preview card'],
  ['textMuted', 'surface', 'placeholders, "Optional"'],
  ['textMuted', 'background', 'placeholders on the page'],
  ['toggleOff', 'navyRaised', 'placeholders and icons in header search fields'],
  ['textOnNavy', 'navy', 'headers'],
  ['textOnNavy', 'navyRaised', 'pills on the header'],
  ['textOnPrimary', 'green', 'WhatsApp buttons'],
  ['green', 'surface', 'success text'],
  ['green', 'greenTint', 'info cards'],
  ['warningText', 'warningTint', '"Says paid" chip'],
  ['warningTextStrong', 'warningTint', 'payment-claimed card, banners'],
  ['textOnPrimary', 'danger', 'destructive buttons'],
  ['danger', 'surface', '"Delete account"'],
  ['info', 'infoTint', 'blue initials'],
  ['navy', 'primaryTint', 'text on the tinted card'],
];

/**
 * Brand pairs below AA, waiting for the owner's decision (review stop B): the primary orange
 * with white button text (4.23:1) and as text on white (4.23:1) or its tint (3.80:1).
 */
const PENDING_TEXT: [Name, Name, string][] = [
  ['textOnPrimary', 'primary', 'primary buttons'],
  ['primary', 'surface', 'primary links'],
  ['primary', 'primaryTint', 'secondary buttons'],
];

const GRAPHICS: [Name, Name, string][] = [
  ['navy', 'surface', 'selected borders, icons'],
  ['green', 'surface', 'toggles on, progress'],
  ['primary', 'surface', 'badges, today bar'],
];

/** Graphics below 3:1, waiting for the owner's decision: rating stars on white (2.19:1). */
const PENDING_GRAPHICS: [Name, Name, string][] = [['star', 'surface', 'rating stars']];

describe('colour contrast (WCAG 2.2 AA)', () => {
  it.each(TEXT)('%s on %s (%s): at least 4.5:1', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS)('%s on %s (%s): at least 3:1', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
  });

  it('the pending pairs are still the known ones (fails once fixed: move them up)', () => {
    for (const [fg, bg] of PENDING_TEXT) {
      expect(contrast(colors[fg], colors[bg]), `${fg} on ${bg}`).toBeLessThan(4.5);
    }
    for (const [fg, bg] of PENDING_GRAPHICS) {
      expect(contrast(colors[fg], colors[bg]), `${fg} on ${bg}`).toBeLessThan(3);
    }
  });

  it('computes WCAG ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
