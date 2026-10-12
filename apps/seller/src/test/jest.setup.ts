// Jest setup for the *.ui.test.tsx files (decision #86): quiet, predictable native modules.
import { beforeEach, jest } from '@jest/globals';

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
  return {
    router,
    useRouter: () => router,
    // jest.fn so a test can set the route params: mocked(useLocalSearchParams).mockReturnValue(...)
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (effect: () => void) => {
      // Run once, like a first focus.
      const { useEffect } = jest.requireActual<typeof import('react')>('react');
      // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like a first focus
      useEffect(() => effect(), []);
    },
    Link: ({ children }: { children: unknown }) => children,
    Stack: { Screen: () => null },
  };
});

// No native safe-area module under Jest: fixed zero insets, and the provider/view render as-is.
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    SafeAreaView: View,
    SafeAreaInsetsContext: {
      Consumer: ({ children }: { children: (i: typeof insets) => unknown }) => children(insets),
    },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

// Native-only modules the screens import: harmless stand-ins a test can inspect.
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ''),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/poster.png'),
}));
// SecureStore (sessions, drafts: decision #100): an in-memory stand-in, emptied before each test.
const mockSecureValues = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureValues.delete(key);
  }),
}));
beforeEach(() => mockSecureValues.clear());

// Google sign-in's native module (decision #107): screens use src/auth/google.ts, which tests
// usually mock; anything that still loads the library gets this quiet stand-in.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
    signOut: jest.fn(async () => null),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  isErrorWithCode: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error,
}));
