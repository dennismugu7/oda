// Official brand marks, as provided in each brand's own pack (assets/brands/README.md,
// decision #55): scaled only, never recoloured, cropped or distorted.
import { Image } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';
import { WHATSAPP_GREEN } from './brand';
import { GOOGLE_G_SVG, INSTAGRAM_GLYPH_BLACK_SVG, WHATSAPP_GLYPH_GREEN_SVG } from './brandSvgs';

export type Brand = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';

// PNG marks (their packs have no SVG of the variant used).
const PNG_MARKS = {
  facebook: require('../../assets/brands/facebook-logo-primary.png'),
  // TikTok's full-colour icon on its black circle, from TikTok's developer logo pack
  // (decision #108, amends #101 c).
  tiktok: require('../../assets/brands/tiktok-icon-black-circle.png'),
};

/** At least 16 dp (Facebook's digital minimum); square, so the aspect ratio is kept. */
export function BrandIcon({ brand, size = 26 }: { brand: Brand; size?: number }) {
  const side = Math.max(16, size);
  if (brand === 'facebook' || brand === 'tiktok') {
    return (
      <Image
        source={PNG_MARKS[brand]}
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

/** Google's "G" for the Sign in with Google buttons (decision #107): unmodified, 18–20 dp. */
export function GoogleMark({ size = 20 }: { size?: number }) {
  return <SvgCss xml={GOOGLE_G_SVG} width={size} height={size} />;
}

/** WhatsApp's Status ring, drawn by oda in WhatsApp green (not a logo). */
export function StatusRing({ size = 26 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
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
