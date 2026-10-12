// "Your shop isn't taking orders yet" (decision #109): on top of Home while buyers can't order,
// with one button per missing item straight to the screen that fixes it. The items come from
// GET /api/home (`ordering.blockers`), worked out with the buyer web's own rule
// (`orderingBlockers` in @oda/shared), so the app and the shop page always agree. Delivery
// options are optional (decision #110 a): a blocker this app doesn't know (an older server's
// "delivery") is skipped.
import type { OrderingBlocker } from '@oda/shared';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';

export const BLOCKER_ACTIONS: Record<OrderingBlocker, { label: string; href: Href }> = {
  payment: { label: 'Add a way to get paid', href: '/payments' },
  paused: { label: 'Turn off Pause shop', href: '/settings' },
};

export function NotTakingOrdersBanner({ blockers: sent }: { blockers: readonly string[] }) {
  const blockers = sent.filter((b): b is OrderingBlocker => Object.hasOwn(BLOCKER_ACTIONS, b));
  if (blockers.length === 0) return null;
  return (
    <View style={styles.banner} accessibilityRole="summary">
      <View style={styles.head}>
        <Icon name="alert-triangle" size={20} color={colors.warningTextStrong} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.title}>
            Your shop isn’t taking orders yet
          </Text>
          <Text style={styles.body}>Buyers can look around, but they can’t order until you:</Text>
        </View>
      </View>
      {blockers.map((blocker) => (
        <Pressable
          key={blocker}
          accessibilityRole="button"
          onPress={() => router.push(BLOCKER_ACTIONS[blocker].href)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{BLOCKER_ACTIONS[blocker].label}</Text>
          <Icon name="chevron-right" size={20} color={colors.warningTextStrong} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warningTint,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  title: { ...text('bodyStrong'), color: colors.warningTextStrong },
  body: { ...text('small'), color: colors.warningText, marginTop: spacing.xxs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  actionText: { ...text('bodyStrong'), color: colors.warningTextStrong, flex: 1 },
  pressed: { opacity: 0.8 },
});
