// Onboarding building blocks (designs 09–14): the navy header with back, wordmark, Skip and
// the 6-segment progress bar (filled = step number, decision #32), choice cards, check rows,
// chips, and the loading/error states every step shares.
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ONBOARDING_STEPS } from '@oda/shared';
import type { IconName } from '@/onboarding/labels';
import { previousStep, type OnboardingStepNumber } from '@/onboarding/steps';
import { colors, radii, sizes, spacing, text } from '@/theme';
import { AuthScreen, Button, FormMessage } from './auth';

export type { IconName };

function goBack(step: OnboardingStepNumber) {
  if (router.canGoBack()) router.back();
  else {
    const previous = previousStep(step);
    if (previous) router.replace(previous);
  }
}

export function OnboardingHeader({
  step,
  onSkip,
  right,
}: {
  step: OnboardingStepNumber;
  onSkip?: () => void;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const canGoBack = router.canGoBack() || step > 1;
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <StatusBar style="light" />
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          {canGoBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={() => goBack(step)}
            >
              <Feather name="chevron-left" size={30} color={colors.textOnNavy} />
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityRole="header" accessibilityLabel="oda" style={styles.headerLogo}>
          oda<Text style={styles.headerDot}>.</Text>
        </Text>
        <View style={[styles.headerSide, styles.headerRight]}>
          {onSkip ? (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={onSkip}>
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          ) : (
            right
          )}
        </View>
      </View>
      <View
        style={styles.progress}
        accessibilityLabel={`Step ${step} of ${ONBOARDING_STEPS}`}
        accessibilityRole="progressbar"
      >
        {Array.from({ length: ONBOARDING_STEPS }, (_, i) => (
          <View key={i} style={[styles.segment, i < step && styles.segmentOn]} />
        ))}
      </View>
    </View>
  );
}

/** A step: header, scrolling form (keyboard-aware), pinned main button. */
export function OnboardingScreen({
  step,
  onSkip,
  footer,
  note,
  children,
}: {
  step: OnboardingStepNumber;
  onSkip?: () => void;
  footer?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AuthScreen
      header={<OnboardingHeader step={step} onSkip={onSkip} />}
      footer={footer}
      note={note}
    >
      {children}
    </AuthScreen>
  );
}

/** Loading the step's state, or failing to: never an endless spinner (Step 47). */
export function StepStatus({
  step,
  error,
  onRetry,
}: {
  step: OnboardingStepNumber;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <OnboardingScreen step={step}>
      {error ? (
        <View style={styles.status}>
          <FormMessage>{error}</FormMessage>
          <Button title="Try again" onPress={onRetry} />
        </View>
      ) : (
        <ActivityIndicator
          style={styles.loading}
          color={colors.primary}
          accessibilityLabel="Loading"
        />
      )}
    </OnboardingScreen>
  );
}

export function StepTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** A tappable card in a 2-column grid (step 1) or a row of 3 (step 5). */
export function ChoiceCard({
  label,
  icon,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label.replace('\n', ' ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconTile, selected && styles.iconTileSelected]}>
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={selected ? colors.primary : colors.navy}
        />
      </View>
      <Text style={[styles.cardLabel, compact && styles.cardLabelCompact]}>{label}</Text>
      {selected ? (
        <View style={styles.badge}>
          <Feather name="check" size={14} color={colors.textOnNavy} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** A full-width row with an icon, a title, an optional subtitle and a checkbox (step 2). */
export function CheckRow({
  title,
  subtitle,
  icon,
  iconNode,
  tint,
  iconColor,
  checked,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  /** Replaces `icon` (e.g. a brand mark). */
  iconNode?: ReactNode;
  tint: string;
  iconColor: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, checked && styles.rowChecked, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        {iconNode ?? <MaterialCommunityIcons name={icon} size={22} color={iconColor} />}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Feather name="check" size={16} color={colors.textOnNavy} /> : null}
      </View>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  dashed = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  dashed?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={dashed ? 'button' : 'checkbox'}
      accessibilityState={dashed ? undefined : { checked: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        dashed && styles.chipDashed,
        selected && styles.chipOn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function GreenNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.greenNote}>
      <Feather name="info" size={18} color={colors.green} />
      <Text style={styles.greenNoteText}>{children}</Text>
    </View>
  );
}

export const onboardingStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldGap: { marginTop: spacing.md },
});

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.minTapTarget },
  headerSide: { width: 64, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerLogo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Poppins_700Bold',
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -1,
    color: colors.textOnNavy,
  },
  headerDot: { color: colors.greenBright },
  skip: { ...text('subtitle'), fontFamily: text('body').fontFamily, color: colors.textMuted },
  progress: { flexDirection: 'row', gap: 6, marginTop: spacing.lg },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.navyMuted },
  segmentOn: { backgroundColor: colors.textOnNavy },

  titleBlock: { marginTop: spacing.xl, marginBottom: spacing.lg },
  title: { ...text('headline'), fontSize: 30, lineHeight: 36, color: colors.navy },
  subtitle: {
    ...text('body'),
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  status: { marginTop: spacing.xl, gap: spacing.lg },
  loading: { marginTop: spacing.xxxl },

  card: {
    flex: 1,
    minHeight: 104,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardCompact: { minHeight: 96, alignItems: 'center', justifyContent: 'center' },
  cardSelected: { borderWidth: sizes.borderWidthStrong, borderColor: colors.borderStrong },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileSelected: { backgroundColor: colors.peach },
  cardLabel: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: colors.navy,
  },
  cardLabelCompact: { textAlign: 'center', fontSize: 14, lineHeight: 18 },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 64,
  },
  rowChecked: { borderWidth: sizes.borderWidthStrong, borderColor: colors.borderStrong },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: colors.navy,
  },
  rowSubtitle: { ...text('small'), color: colors.textSecondary },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },

  chip: {
    minWidth: 52,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDashed: { borderStyle: 'dashed' },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { ...text('bodyStrong'), color: colors.navy },
  chipTextOn: { color: colors.textOnNavy },

  greenNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.greenTint,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  greenNoteText: { ...text('body'), color: colors.green, flex: 1 },
  pressed: { opacity: 0.85 },
});
