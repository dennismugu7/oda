// Official brand marks, as provided in each brand's own pack (assets/brands/README.md,
// decision #55): scaled only, never recoloured, cropped or distorted.
import { Image } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';
import { WHATSAPP_GREEN } from './brand';
import { INSTAGRAM_GLYPH_BLACK_SVG, WHATSAPP_GLYPH_GREEN_SVG } from './brandSvgs';

export type Brand = 'whatsapp' | 'instagram' | 'facebook';

const facebookLogo = require('../../assets/brands/facebook-logo-primary.png');

/** At least 16 dp (Facebook's digital minimum); square, so the aspect ratio is kept. */
export function BrandIcon({ brand, size = 26 }: { brand: Brand; size?: number }) {
  const side = Math.max(16, size);
  if (brand === 'facebook') {
    return (
      <Image
        source={facebookLogo}
        style={{ width: side, height: side }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <SvgCss
      xml={brand === 'whatsapp' ? WHATSAPP_GLYPH_GREEN_SVG : INSTAGRAM_GLYPH_BLACK_SVG}
      width={side}
      height={side}
    />
  );
}

/** WhatsApp's Status ring, drawn by oda in WhatsApp green (not a logo). */
export function StatusRing({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26" accessibilityElementsHidden>
      <Circle
        cx={13}
        cy={13}
        r={10.5}
        stroke={WHATSAPP_GREEN}
        strokeWidth={2.4}
        strokeDasharray="5.2 2.6"
        fill="none"
      />
      <Circle cx={13} cy={13} r={5} fill={WHATSAPP_GREEN} />
    </Svg>
  );
}
