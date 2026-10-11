// Screen and component tests (M10 CP5, decisions #81 a, #86): jest-expo + React Native Testing
// Library render the app's components without a phone. Only *.ui.test.tsx files; the plain
// logic tests stay on Vitest (src/**/*.test.ts).
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Not in app/: Expo Router would turn a test file there into a route and bundle it.
  testMatch: ['**/src/**/*.ui.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/src/test/jest.setup.ts'],
  // A cold run (CI, a cleared cache) transforms each screen on its first test: over 5 s.
  testTimeout: 30_000,
  // pnpm keeps packages under node_modules/.pnpm: transform React Native and Expo code there too.
  transformIgnorePatterns: [
    'node_modules/(?!(\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@oda/.*|@better-auth/.*|better-auth|phosphor-react-native))',
  ],
};
