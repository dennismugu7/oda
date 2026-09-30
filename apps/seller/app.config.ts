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
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#D94A27',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  owner: 'dennisxenonxavier',
  extra: { eas: { projectId: easProjectId } },
};

export default config;
