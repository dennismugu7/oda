import { colors } from '@oda/ui-tokens/tokens';
import type { ExpoConfig } from 'expo/config';

// Android only, light theme only (docs/decisions.md #8).
// EAS project created by `eas init` (not a secret).
const easProjectId = '10f06155-8e5f-441e-b95e-7af4f4c86d38';

// Preview (staging) builds are a separate app, "oda staging" (`com.mugulabs.oda.preview`), so
// it installs next to the Play app on one phone (decision #93 D6). EAS sets APP_VARIANT in the
// preview build profile (eas.json) and when publishing preview updates; everything else
// (production, development, local) is the real app.
const preview = process.env.APP_VARIANT === 'preview';

// Local release builds only (decision #113; scripts/build-release.mjs sets both). EAS builds set
// the versionCode (remote counter, eas.json) and the update channel themselves, so these stay
// unset there and in everyday dev builds.
const localVersionCode = process.env.ODA_VERSION_CODE
  ? Number(process.env.ODA_VERSION_CODE)
  : undefined;
const localChannel = process.env.ODA_UPDATES_CHANNEL;

// Native colours come from the shared tokens (decision #88: #C44323), never written here.
const brand = colors.primary;

const config: ExpoConfig = {
  name: preview ? 'oda staging' : 'oda',
  slug: 'oda',
  scheme: 'oda',
  // 0.2.0: native modules for onboarding photos and later milestones (decision #53).
  // 0.3.0: push (expo-notifications + Firebase) and Sentry, inactive until M10 (decision #70).
  // 0.3.1: Expo SDK 57 patch releases (decisions #80, #81 f).
  // 0.4.0: production build (M11 CP3): brand colour #C44323, separate preview app id.
  // 0.5.0: Google sign-in (@react-native-google-signin/google-signin, decision #107).
  // Bump on every native change (decision #48).
  version: '0.5.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android'],
  icon: './assets/icon.png',
  android: {
    package: preview ? 'com.mugulabs.oda.preview' : 'com.mugulabs.oda',
    ...(localVersionCode ? { versionCode: localVersionCode } : {}),
    // Firebase config for push (FCM). Never committed (the repo is public): the laptop keeps
    // apps/seller/google-services.json; EAS builds get it from the file variable
    // GOOGLE_SERVICES_JSON (decision #70).
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: brand,
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    'expo-sharing',
    // Google sign-in (decision #107). Without options the plugin uses the Firebase file above
    // (google-services.json, already applied for push); Android needs nothing else.
    '@react-native-google-signin/google-signin',
    // Local release builds can sign with a private test key (ODA_LOCAL_SIGNING; no-op when unset).
    './plugins/withLocalSigning',
    [
      'expo-notifications',
      {
        // Android draws the status-bar icon in one colour: a white "o" with the logo's dot.
        icon: './assets/notification-icon.png',
        color: brand,
        defaultChannel: 'orders',
      },
    ],
    // @sentry/react-native has no config plugin: source maps are uploaded by the eas-update
    // workflows (decision #90); the DSN comes from the EAS environment (src/sentry.ts).
    [
      'expo-image-picker',
      {
        photosPermission: 'oda uses your photos to show your products to buyers.',
        cameraPermission: 'oda uses the camera to take photos of your products.',
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        // Android 12+ draws the icon on a 288dp canvas and clips it to a centred
        // 192dp circle. At 160dp wide the wordmark + tick reach ~84dp from the centre,
        // inside the 96dp safe radius with ~12% margin (200dp clipped the "o" and tick).
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: brand,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  // EAS Update (decisions #47, #48): preview builds fetch JS updates published to their
  // channel. Runtime version = app version: bump `version` whenever native code changes
  // (`deps:check` fails otherwise). Fingerprints can't be used: pnpm names its folders
  // differently on Windows and on EAS's Linux builders, so the two never match.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: `https://u.expo.dev/${easProjectId}`,
    // Without a channel a build asks EAS Update for nothing and runs its own JS.
    ...(localChannel ? { requestHeaders: { 'expo-channel-name': localChannel } } : {}),
  },
  owner: 'dennisxenonxavier',
  extra: { eas: { projectId: easProjectId } },
};

export default config;
