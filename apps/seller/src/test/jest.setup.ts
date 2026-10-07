// Jest setup for the *.ui.test.tsx files (decision #86): quiet, predictable native modules.
import { jest } from '@jest/globals';

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
