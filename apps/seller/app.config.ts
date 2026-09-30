import type { ExpoConfig } from 'expo/config';

// Android only, light theme only (docs/decisions.md #8).
// EAS_PROJECT_ID is filled in by `eas init` (step 12 of the M0 plan).
const easProjectId = process.env.EAS_PROJECT_ID;

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
  extra: easProjectId ? { eas: { projectId: easProjectId } } : {},
};

export default config;
