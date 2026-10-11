import {
  colors,
  displayFontFamily,
  fontFamily,
  headingFontFamily,
  radii,
  sizes,
  spacing,
  typography,
} from '@oda/ui-tokens';
import type { TextStyle } from 'react-native';

export { colors, radii, sizes, spacing };

/**
 * Font files by role (decision #102): `fonts.bold` etc. are Inter (body), `fonts.heading` is
 * Bricolage Grotesque bold for names and titles, `fonts.display` its extra bold.
 */
export const fonts = {
  ...fontFamily,
  heading: headingFontFamily.bold,
  headingSemibold: headingFontFamily.semibold,
  display: displayFontFamily,
} as const;

type Variant = keyof typeof typography;

/** RN text style for a typography token (one font file per weight and family). */
export function text(variant: Variant): TextStyle {
  const t = typography[variant];
  return {
    fontFamily: (t.family === 'heading' ? headingFontFamily : fontFamily)[t.weight],
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
  };
}
