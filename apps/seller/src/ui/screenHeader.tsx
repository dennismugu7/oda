// The navy header of a pushed screen (designs 18-edit-product, 20b-categories, 20b1): back,
// a title with an optional line under it, and an optional ⋮ menu.
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, text } from '@/theme';

export function ScreenHeader({
  title,
  subtitle,
  link,
  onBack,
  onMenu,
}: {
  title: string;
  subtitle?: string | null;
  /** A tappable link after the subtitle, e.g. "View in shop". */
  link?: { label: string; onPress: () => void } | null;
  onBack: () => void;
  onMenu?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <StatusBar style="light" />
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack}>
        <Feather name="chevron-left" size={30} color={colors.textOnNavy} />
      </Pressable>
      <View style={styles.headerText}>
        <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle || link ? (
          <Text style={styles.headerSub}>
            {subtitle}
            {subtitle && link ? ' · ' : null}
            {link ? (
              <Text accessibilityRole="link" onPress={link.onPress} style={styles.headerLink}>
                {link.label}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>
      {onMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          hitSlop={12}
          onPress={onMenu}
        >
          <Feather name="more-vertical" size={26} color={colors.textOnNavy} />
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  headerText: { flex: 1 },
  headerTitle: { ...text('headline'), color: colors.textOnNavy },
  headerSub: { ...text('body'), color: colors.toggleOff },
  headerLink: { color: colors.textOnNavy, textDecorationLine: 'underline' },
  headerSpacer: { width: 26 },
});
