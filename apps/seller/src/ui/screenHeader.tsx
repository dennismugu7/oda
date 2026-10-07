// The navy header of a pushed screen (designs 18-edit-product, 20b-categories, 20b1): back,
// a title with an optional line under it, and an optional ⋮ menu.
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinkButton } from '@/ui/auth';
import { colors, radii, spacing, text } from '@/theme';

export function ScreenHeader({
  title,
  subtitle,
  link,
  onBack,
  onMenu,
  menuIcon = 'more-vertical',
  menuLabel = 'More actions',
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** A tappable link after the subtitle, e.g. "View in shop" (role link) or "Mark all read". */
  link?: { label: string; onPress: () => void; role?: 'button' | 'link' } | null;
  onBack: () => void;
  onMenu?: () => void;
  menuIcon?: 'more-vertical' | 'search' | 'x';
  menuLabel?: string;
  /** Under the title row, inside the navy header (period tabs, filter chips). */
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <StatusBar style="light" />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={onBack}
        >
          <Feather name="chevron-left" size={30} color={colors.textOnNavy} />
        </Pressable>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle || link ? (
            <View style={styles.subRow}>
              {subtitle ? (
                <Text style={styles.headerSub}>
                  {subtitle}
                  {link ? ' · ' : null}
                </Text>
              ) : null}
              {link ? (
                <LinkButton
                  role={link.role}
                  onPress={link.onPress}
                  textStyle={[styles.headerSub, styles.headerLink]}
                >
                  {link.label}
                </LinkButton>
              ) : null}
            </View>
          ) : null}
        </View>
        {onMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={menuLabel}
            hitSlop={12}
            onPress={onMenu}
          >
            <Feather name={menuIcon} size={26} color={colors.textOnNavy} />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1 },
  headerTitle: { ...text('headline'), color: colors.textOnNavy },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  headerSub: { ...text('body'), color: colors.toggleOff },
  headerLink: { color: colors.textOnNavy, textDecorationLine: 'underline' },
  headerSpacer: { width: 26 },
});
