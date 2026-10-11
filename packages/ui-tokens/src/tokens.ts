// Design tokens measured from design/app and design/web. See ../README.md for where each
// value was sampled. Units: dp in the app, CSS px on the web (the same number in both).

export const colors = {
  // Brand
  primary: '#C44323', // buttons, today bar, badges (darkened in M10 for AA contrast, decision #88)
  primaryTint: '#FDF0EA', // secondary button fill ("Create new shop")
  primarySoft: '#F2C7B9', // chart bars (past days)
  navy: '#1C1A2E', // headers, headings, selected borders, dark chips
  navyRaised: '#2D2B3E', // fields/pills sitting on a navy header
  navyMuted: '#444353', // inactive progress segments on navy
  green: '#1F7A55', // WhatsApp buttons, toggles, progress, success text
  greenBright: '#2FAE74', // success circle ("Your shop is live"), logo dot
  greenTint: '#E4F2EC', // info cards, positive chips, "Save x%"

  // Surfaces
  background: '#F7F7F8', // app page background
  surface: '#FFFFFF', // cards, inputs, web page background
  surfaceMuted: '#F1F1F4', // icon tiles, close buttons, count pills
  beige: '#EFE8E0', // "what buyers see" preview card, product photo placeholder
  peach: '#FBE9E3', // avatar / icon tile tint

  // Lines
  border: '#E3E2E8', // card and input borders (1dp)
  borderStrong: '#1C1A2E', // focused input / selected card (2dp)
  track: '#ECECF1', // progress track, toggle-off track is darker (below)
  toggleOff: '#D9D8E0',

  // Text
  text: '#1C1A2E',
  textSecondary: '#55536A',
  textMuted: '#717081', // placeholders, "Optional" (darkened in M10 for 4.5:1 contrast, decision #84)
  textOnPrimary: '#FFFFFF',
  textOnNavy: '#FFFFFF',

  // Status
  warningTint: '#FBF1DC', // "Says paid" chip, payment-claimed card, refund box
  warningText: '#936511', // darkened in M10 for 4.5:1 on warningTint (decision #84)
  warningTextStrong: '#6B4A0C',
  warningAccent: '#CC9B44', // stepper "in progress" ring
  danger: '#B3261E', // destructive button, "Delete account"
  star: '#E0A52B', // rating star fill (2.19:1 on white: always drawn with starOutline)
  starOutline: '#936511', // thin outline on every rating star, 5.11:1 on white (decision #89)
  info: '#2D5FA8', // blue avatar initial
  infoTint: '#E6EDF8',
} as const;

/** Body text: Inter (decision #102). The app loads one font file per weight. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Headings (display, headline, title): Bricolage Grotesque (decision #102). */
export const headingFontFamily = {
  regular: 'BricolageGrotesque_600SemiBold',
  medium: 'BricolageGrotesque_600SemiBold',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
} as const;

/** The welcome logo and hero headline (extra bold). */
export const displayFontFamily = 'BricolageGrotesque_800ExtraBold';

/** Web uses one family with weights; the app loads one font file per weight. */
export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

type TextStyle = {
  size: number;
  lineHeight: number;
  weight: keyof typeof fontWeight;
  letterSpacing: number;
  /** heading = Bricolage Grotesque, body = Inter. */
  family: 'heading' | 'body';
};

export const typography = {
  display: { size: 34, lineHeight: 38, weight: 'bold', letterSpacing: -0.7, family: 'heading' }, // "Turn your posts into orders."
  headline: { size: 28, lineHeight: 32, weight: 'bold', letterSpacing: -0.6, family: 'heading' }, // screen titles, "What do you sell?"
  title: { size: 20, lineHeight: 26, weight: 'bold', letterSpacing: -0.3, family: 'heading' }, // card titles, sheet titles
  subtitle: { size: 17, lineHeight: 24, weight: 'semibold', letterSpacing: 0, family: 'body' }, // list row titles
  button: { size: 17, lineHeight: 22, weight: 'bold', letterSpacing: 0, family: 'body' },
  body: { size: 15, lineHeight: 22, weight: 'regular', letterSpacing: 0, family: 'body' },
  bodyStrong: { size: 15, lineHeight: 22, weight: 'semibold', letterSpacing: 0, family: 'body' },
  small: { size: 13, lineHeight: 18, weight: 'regular', letterSpacing: 0, family: 'body' },
  overline: { size: 12, lineHeight: 16, weight: 'bold', letterSpacing: 1.2, family: 'body' }, // "BUYER", "YOUR BUSINESS"
} as const satisfies Record<string, TextStyle>;

/** 4-point scale. Screen side padding is `lg` (20). */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8, // small chips ("Hidden", "Sold out")
  md: 12, // icon tiles, thumbnails
  lg: 16, // inputs
  xl: 20, // cards
  sheet: 24, // navy header bottom corners, bottom sheets
  pill: 999, // buttons, filter chips, toggles
} as const;

export const sizes = {
  buttonHeight: 48,
  inputHeight: 44,
  minTapTarget: 44,
  borderWidth: 1,
  borderWidthStrong: 2,
} as const;

export const shadows = {
  // Floating elements: web sticky cart bar, "Add product" FAB.
  float: { color: '#1C1A2E', opacity: 0.18, radius: 16, offsetY: 6 },
} as const;

export const tokens = {
  colors,
  fontFamily,
  fontWeight,
  typography,
  spacing,
  radii,
  sizes,
  shadows,
};
export type Tokens = typeof tokens;
