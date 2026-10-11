// "Add a photo": oda's own bottom sheet instead of Android's grey dialog (QA round 1, approved
// design): Take a photo / Choose from gallery, each with an icon, then Cancel. Used by the
// product form and the onboarding first product.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PickSource } from '@/onboarding/nativePhotos';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';

const CHOICES: { source: PickSource; label: string; icon: IconName }[] = [
  { source: 'camera', label: 'Take a photo', icon: 'camera' },
  { source: 'library', label: 'Choose from gallery', icon: 'images' },
];

export function PhotoSourceSheet({
  visible,
  title = 'Add photos',
  onPick,
  onClose,
}: {
  visible: boolean;
  title?: string;
  onPick: (source: PickSource) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {CHOICES.map((c) => (
          <Pressable
            key={c.source}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onPick(c.source);
            }}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
          >
            <View style={styles.tile}>
              <Icon name={c.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.choiceText}>{c.label}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
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
  title: { ...text('title'), color: colors.navy, marginBottom: spacing.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { ...text('subtitle'), color: colors.navy, flex: 1 },
  cancel: {
    minHeight: 52,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { ...text('button'), fontFamily: fonts.bold, color: colors.navy },
  pressed: { opacity: 0.7 },
});
