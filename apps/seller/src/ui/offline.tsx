// The thin "You're offline" bar (design-changes NEW: offline bar; spec §8): saved data is shown
// read-only and nothing is queued.
import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, text } from '@/theme';

export function OfflineBar() {
  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Feather name="wifi-off" size={16} color={colors.textOnNavy} />
      <Text style={styles.text}>You’re offline · showing saved data</Text>
    </View>
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
});
