// Cards of rows used by More and the settings screens (designs 20, 20b-settings,
// 20b-shop-profile, 20b-payments): an icon tile, a bold title with an optional line under it,
// a value or a switch on the right, and a chevron when the row opens something.
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, text } from '@/theme';

export type FeatherName = ComponentProps<typeof Feather>['name'];

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.overline}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children, padded = false }: { children: ReactNode; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.padded]}>{children}</View>;
}

export function IconTile({
  icon,
  tint = colors.surfaceMuted,
  color = colors.navy,
}: {
  icon: FeatherName;
  tint?: string;
  color?: string;
}) {
  return (
    <View style={[styles.iconTile, { backgroundColor: tint }]}>
      <Feather name={icon} size={20} color={color} />
    </View>
  );
}

export function Row({
  icon,
  title,
  line,
  value,
  right,
  onPress,
  first = false,
  danger = false,
  disabled = false,
  accessibilityLabel,
}: {
  icon?: FeatherName;
  title: string;
  /** Under the title (e.g. "+254 712 345 678"). */
  line?: string | null;
  /** Muted text on the right (e.g. "Amani Wairimu"). */
  value?: string | null;
  /** Instead of the chevron (e.g. a badge or an "Add" link). */
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {icon ? <IconTile icon={icon} color={danger ? colors.danger : colors.navy} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.title, danger && { color: colors.danger }]} numberOfLines={2}>
          {title}
        </Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ??
        (onPress ? <Feather name="chevron-right" size={20} color={colors.textMuted} /> : null)}
    </>
  );
  if (!onPress) {
    return <View style={[styles.row, !first && styles.divider]}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, line, value].filter(Boolean).join(', ')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export function ToggleRow({
  icon,
  title,
  line,
  value,
  onToggle,
  disabled = false,
  first = false,
}: {
  icon?: FeatherName;
  title: string;
  line?: string | null;
  value: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
  first?: boolean;
}) {
  return (
    <View style={[styles.row, !first && styles.divider]}>
      {icon ? <IconTile icon={icon} /> : null}
      <View style={styles.rowText}>
        <Text style={styles.title}>{title}</Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ true: colors.green, false: colors.toggleOff }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

export const rowStyles = StyleSheet.create({
  overline: { ...text('overline'), color: colors.textSecondary },
  note: { ...text('body'), color: colors.textSecondary },
});

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  overline: rowStyles.overline,
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  padded: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  title: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  line: { ...text('body'), color: colors.textSecondary },
  value: { ...text('body'), color: colors.textSecondary, maxWidth: '45%' },
  pressed: { opacity: 0.85 },
});
