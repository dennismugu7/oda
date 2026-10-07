import type { ExpoConfig } from 'expo/config';

// Android only, light theme only (docs/decisions.md #8).
// EAS project created by `eas init` (not a secret).
const easProjectId = '10f06155-8e5f-441e-b95e-7af4f4c86d38';

const config: ExpoConfig = {
  name: 'oda',
  slug: 'oda',
  scheme: 'oda',
  // 0.2.0: native modules for onboarding photos and later milestones (decision #53).
  // 0.3.0: push (expo-notifications + Firebase) and Sentry, inactive until M10 (decision #70).
  // 0.3.1: Expo SDK 57 patch releases (decisions #80, #81 f).
  // Bump on every native change (decision #48).
  version: '0.3.1',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android'],
  icon: './assets/icon.png',
  android: {
    package: 'com.mugulabs.oda',
    // Firebase config for push (FCM). Never committed (the repo is public): the laptop keeps
    // apps/seller/google-services.json; EAS builds get it from the file variable
    // GOOGLE_SERVICES_JSON (decision #70).
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#D94A27',
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    'expo-sharing',
    [
      'expo-notifications',
      {
        // Android draws the status-bar icon in one colour: a white "o" with the logo's dot.
        icon: './assets/notification-icon.png',
        color: '#D94A27',
        defaultChannel: 'orders',
      },
    ],
    // @sentry/react-native is installed for M10 but stays inactive: no config plugin (so no
    // source-map upload step), no DSN, Sentry.init is never called, nothing is sent.
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
        backgroundColor: '#D94A27',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  // EAS Update (decisions #47, #48): preview builds fetch JS updates published to their
  // channel. Runtime version = app version: bump `version` whenever native code changes
  // (`deps:check` fails otherwise). Fingerprints can't be used: pnpm names its folders
  // differently on Windows and on EAS's Linux builders, so the two never match.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: `https://u.expo.dev/${easProjectId}` },
  owner: 'dennisxenonxavier',
  extra: { eas: { projectId: easProjectId } },
};

export default config;
