// The frame of every M8a settings screen: the navy header, then loading / error / offline
// states until the data is there, then a scrolling body (offline: the saved copy, read-only).
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { ScreenHeader } from '@/ui/screenHeader';
import { colors, spacing } from '@/theme';

/** Back to the previous screen, or to `fallback` when opened directly. */
export function goBack(fallback: Href = '/more') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function SettingsLayout({
  title,
  subtitle,
  loaded,
  error,
  offline,
  onRetry,
  retryLabel = 'Try again',
  back = () => goBack(),
  overlay,
  header,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** False while the first load hasn't answered. */
  loaded: boolean;
  error?: string | null;
  offline?: boolean;
  onRetry?: () => void;
  /** The error button's label: "Back" when the thing no longer exists. */
  retryLabel?: string;
  back?: () => void;
  /** Sheets and modals, outside the scroll view. */
  overlay?: ReactNode;
  /** Under the title, inside the navy header (e.g. Share's channel tabs). */
  header?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (!loaded) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={title} subtitle={subtitle} onBack={back} />
        <View style={styles.body}>
          {error ? (
            <>
              {offline ? <OfflineBar saved={false} /> : <FormMessage>{error}</FormMessage>}
              {onRetry ? <Button title={retryLabel} onPress={onRetry} /> : null}
            </>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={title} subtitle={subtitle} onBack={back}>
        {header}
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {offline ? <OfflineBar /> : error ? <FormMessage>{error}</FormMessage> : null}
        {children}
      </ScrollView>
      {overlay}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xxl },
});
