import type { ExpoConfig } from 'expo/config';

// Android only, light theme only (docs/decisions.md #8).
// EAS project created by `eas init` (not a secret).
const easProjectId = '10f06155-8e5f-441e-b95e-7af4f4c86d38';

const config: ExpoConfig = {
  name: 'oda',
  slug: 'oda',
  scheme: 'oda',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android'],
  icon: './assets/icon.png',
  android: {
    package: 'com.mugulabs.oda',
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
  // EAS Update (decision #47): preview builds fetch JS updates published to their channel.
  // The fingerprint policy gives each set of native code its own runtime version, so an
  // update can never reach a binary whose native modules don't match it.
  runtimeVersion: { policy: 'fingerprint' },
  updates: { url: `https://u.expo.dev/${easProjectId}` },
  owner: 'dennisxenonxavier',
  extra: { eas: { projectId: easProjectId } },
};

export default config;
