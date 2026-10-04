// Pieces shared by the tab screens (designs 15–20): the navy header with the screen title,
// and the card a tab shows until its real content arrives in a later milestone.
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, text } from '@/theme';

export function TabScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
    </View>
  );
}

/** "Coming soon" without saying so: what will be here, in one friendly line. */
export function TabPlaceholder({
  icon,
  title,
  line,
  children,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  line: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconTile}>
        <Feather name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardLine}>{line}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  title: { ...text('display'), color: colors.textOnNavy },
  subtitle: { ...text('subtitle'), fontFamily: text('body').fontFamily, color: colors.toggleOff },
  body: { padding: spacing.lg, gap: spacing.lg },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: spacing.xs },
  cardTitle: { ...text('title'), fontSize: 18, color: colors.navy },
  cardLine: { ...text('body'), color: colors.textSecondary },
});
