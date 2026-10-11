// oda's own confirmation, instead of Android's grey alert (decision #109 a): a bottom sheet in
// the "Add photos" sheet's look (photoSourceSheet.tsx) with a title, a message, one main button
// (red when the action is destructive) and Cancel. The back button and a tap outside cancel.
// A notice (no choice to make) has only its main button, which closes it.
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Button } from '@/ui/auth';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** The main button, e.g. "Log out", "Delete". */
  confirmLabel: string;
  /** Red main button for an action that removes or stops something. */
  destructive?: boolean;
  /** Default "Cancel"; e.g. "Keep editing". */
  cancelLabel?: string;
  /** A notice: only the main button, no Cancel. */
  notice?: boolean;
  onConfirm?: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  cancelLabel = 'Cancel',
  notice = false,
  onConfirm,
  onClose,
}: ConfirmOptions & { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      testID="confirm-sheet"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        accessibilityViewIsModal
      >
        <View style={styles.handle} />
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        <Button
          title={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          onPress={() => {
            onClose();
            onConfirm?.();
          }}
        />
        {notice ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

/**
 * `const confirm = useConfirm();` then `confirm.ask({ … })` where an alert used to be, and
 * `{confirm.sheet}` once in the screen.
 */
export function useConfirm(): { ask: (options: ConfirmOptions) => void; sheet: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const ask = useCallback((next: ConfirmOptions) => setOptions(next), []);
  const sheet = options ? (
    <ConfirmSheet visible {...options} onClose={() => setOptions(null)} />
  ) : null;
  return { ask, sheet };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,46,0.45)' }, // navy at 45%
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.toggleOff,
    marginBottom: spacing.sm,
  },
  title: { ...text('title'), color: colors.navy },
  // Long text (a full email address) wraps; never truncated.
  message: { ...text('body'), color: colors.textSecondary, marginBottom: spacing.md },
  cancel: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { ...text('button'), fontFamily: fonts.bold, color: colors.navy },
  pressed: { opacity: 0.7 },
});
