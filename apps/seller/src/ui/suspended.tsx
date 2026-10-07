// "Your shop is suspended" (decision #81 d): shown on Home and the Shop tab while oda has
// suspended the shop. Buyers can't see it; the seller can still finish open orders. Tapping it
// emails support (the address from GET /api/support, the default one offline).
import Feather from '@expo/vector-icons/Feather';
import { suspendedMessage } from '@oda/shared';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FALLBACK_SUPPORT, supportCache } from '@/help/support';
import { growApi } from '@/insights/api';
import { useLoaded } from '@/settings/useLoaded';
import { colors, radii, spacing, text } from '@/theme';

export function SuspendedBanner() {
  const { data } = useLoaded(growApi.support, supportCache);
  const email = (data ?? FALLBACK_SUPPORT).email;
  const open = () =>
    Linking.openURL(
      `mailto:${email}?subject=${encodeURIComponent('My oda shop is suspended')}`,
    ).catch(() => {});
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${suspendedMessage(email)}. Buyers can’t see your shop. You can still finish your open orders.`}
      onPress={open}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <Feather name="alert-triangle" size={20} color={colors.warningTextStrong} />
      <View style={styles.flex}>
        <Text style={styles.title}>{suspendedMessage(email)}</Text>
        <Text style={styles.body}>
          Buyers can’t see your shop. You can still finish your open orders.
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.warningTint,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 44,
  },
  pressed: { opacity: 0.8 },
  flex: { flex: 1 },
  title: { ...text('bodyStrong'), color: colors.warningTextStrong },
  body: { ...text('small'), color: colors.warningText, marginTop: spacing.xxs },
});
