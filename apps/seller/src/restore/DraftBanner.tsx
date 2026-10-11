// "Unsaved changes restored · Discard" above a form whose draft came back after Android
// closed oda (decision #100).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';

export const RESTORED_TEXT = 'Unsaved changes restored';

export function DraftBanner({ visible, onDiscard }: { visible: boolean; onDiscard: () => void }) {
  if (!visible) return null;
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Icon name="rotate-ccw" size={16} color={colors.navy} />
      <Text style={styles.text}>{RESTORED_TEXT}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Discard unsaved changes"
        onPress={onDiscard}
        hitSlop={8}
        style={({ pressed }) => [styles.discard, pressed && styles.pressed]}
      >
        <Text style={styles.discardText}>Discard</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoTint,
    borderRadius: radii.md,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  text: { ...text('small'), fontFamily: fonts.semibold, color: colors.navy, flex: 1 },
  discard: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  discardText: {
    ...text('small'),
    fontFamily: fonts.bold,
    color: colors.navy,
    textDecorationLine: 'underline',
  },
  pressed: { opacity: 0.85 },
});
