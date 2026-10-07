// The thin "You're offline" bar (design-changes NEW: offline bar; spec §8): saved data is shown
// read-only and nothing is queued. `saved={false}` when there's no saved copy to show.
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, text } from '@/theme';

export function OfflineBar({ saved = true }: { saved?: boolean }) {
  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Feather name="wifi-off" size={16} color={colors.textOnNavy} />
      <Text style={styles.text}>
        {saved ? 'You’re offline · showing saved data' : 'You’re offline. Connect to load this.'}
      </Text>
    </View>
  );
}

/** A list's footer when the next page didn't load: tap to try again. */
export function LoadMoreFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Couldn’t load more. Try again"
      onPress={onRetry}
      style={({ pressed }) => [styles.more, pressed && styles.pressed]}
    >
      <Feather name="refresh-cw" size={16} color={colors.textSecondary} />
      <Text style={styles.moreText}>Couldn’t load more · Try again</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: { ...text('small'), fontFamily: 'Poppins_600SemiBold', color: colors.textOnNavy },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.sm,
  },
  moreText: { ...text('small'), fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary },
  pressed: { opacity: 0.85 },
});
