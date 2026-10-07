// Pieces of the order detail (17-order-detail, 17b-*): the stepper on the navy header, the
// bottom sheet the actions open in, and the "Message {buyer} on WhatsApp" toggle.
import Feather from '@expo/vector-icons/Feather';
import type { StepperStep } from '@oda/shared';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, text } from '@/theme';

export function Stepper({ steps }: { steps: StepperStep[] }) {
  return (
    <View style={styles.stepper} accessibilityRole="progressbar">
      {steps.map((s, i) => (
        <View
          key={s.step}
          style={styles.step}
          accessible
          accessibilityLabel={`${s.sellerLabel}: ${s.state === 'done' ? 'done' : s.state === 'in_progress' ? 'in progress' : 'not yet'}`}
        >
          <View style={styles.stepTrack}>
            <View
              style={[
                styles.line,
                i === 0 && styles.lineHidden,
                s.state === 'done' && styles.lineDone,
              ]}
            />
            <View
              style={[
                styles.dot,
                s.state === 'done' && styles.dotDone,
                s.state === 'in_progress' && styles.dotCurrent,
              ]}
            >
              {s.state === 'done' ? (
                <Feather name="check" size={16} color={colors.textOnNavy} />
              ) : s.state === 'in_progress' ? (
                <View style={styles.dotInner} />
              ) : null}
            </View>
            <View
              style={[
                styles.line,
                i === steps.length - 1 && styles.lineHidden,
                steps[i + 1]?.state === 'done' && styles.lineDone,
              ]}
            />
          </View>
          <Text
            style={[
              styles.stepLabel,
              (s.state === 'in_progress' ||
                (s.state === 'todo' && steps[i - 1]?.state === 'done')) &&
                styles.stepLabelCurrent,
            ]}
            numberOfLines={1}
          >
            {s.sellerLabel}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A bottom sheet for one action: title, a line under it, a close button, content. */
export function ActionSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.sheetSub}>{subtitle}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={styles.close}
            >
              <Feather name="x" size={22} color={colors.navy} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "Message Wanjiku on WhatsApp" (design-changes: the seller's own WhatsApp opens after saving). */
export function WhatsAppToggle({
  name,
  line,
  value,
  onChange,
}: {
  name: string;
  line: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>Message {name} on WhatsApp</Text>
        <Text style={styles.toggleLine}>{line}</Text>
      </View>
      <Switch
        accessibilityLabel={`Message ${name} on WhatsApp`}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.green, false: colors.toggleOff }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

/** A big checkbox row ("The amount and code match my M-Pesa message"). */
export function CheckBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={[styles.check, checked && styles.checkOn]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Feather name="check" size={18} color={colors.textOnNavy} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

/** Label / value rows inside a bordered box (the confirm sheet's summary). */
export function Summary({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <View style={styles.summary}>
      {rows.map(([label, value, big], i) => (
        <View key={label} style={[styles.summaryRow, i > 0 && styles.summaryDivider]}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={[styles.summaryValue, big && styles.summaryBig]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** The quiet button under the main one ("Not yet", "Keep order"). */
export function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
    >
      <Text style={styles.textButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stepper: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: spacing.xs },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2, backgroundColor: colors.navyMuted },
  lineHidden: { backgroundColor: 'transparent' },
  lineDone: { backgroundColor: colors.green },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.navyMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  dotCurrent: { borderColor: colors.warningAccent },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warningAccent },
  stepLabel: { ...text('small'), color: colors.toggleOff },
  stepLabelCurrent: { fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,46,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.toggleOff,
    marginBottom: spacing.md,
  },
  sheetHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  sheetTitle: { ...text('headline'), fontSize: 26, color: colors.navy },
  sheetSub: { ...text('body'), color: colors.textSecondary },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { gap: spacing.md, paddingTop: spacing.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  toggleTitle: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  toggleLine: { ...text('small'), color: colors.textSecondary },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  checkOn: { borderWidth: 2, borderColor: colors.borderStrong },
  box: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  checkLabel: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy, flex: 1 },
  summary: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  summaryDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  summaryLabel: { ...text('body'), color: colors.textSecondary },
  summaryValue: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.navy,
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryBig: { ...text('title') },
  textButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  textButtonText: { ...text('button'), color: colors.navy },
  pressed: { opacity: 0.7 },
});
