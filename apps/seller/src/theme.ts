import { colors, fontFamily, radii, sizes, spacing, typography } from '@oda/ui-tokens';
import type { TextStyle } from 'react-native';

export { colors, radii, sizes, spacing };

type Variant = keyof typeof typography;

/** RN text style for a typography token (one font file per weight). */
export function text(variant: Variant): TextStyle {
  const t = typography[variant];
  return {
    fontFamily: fontFamily[t.weight],
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
  };
}
