// A bottom sheet with a list of choices (Android alerts show at most three buttons): the
// category picker, photo actions and the product ⋮ menu.
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, text } from '@/theme';

export interface SheetOption {
  key: string;
  label: string;
  icon?: ComponentProps<typeof Feather>['name'];
  /** A colour swatch instead of an icon. */
  swatch?: string;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}

export function Sheet({
  visible,
  title,
  options,
  onClose,
  header,
  children,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  onClose: () => void;
  /** Above the options (e.g. a search field). */
  header?: ReactNode;
  /** Extra content under the options (e.g. a "custom colour" field). */
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {header}
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {options.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              accessibilityState={o.selected === undefined ? undefined : { selected: o.selected }}
              onPress={() => {
                onClose();
                o.onPress();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              {o.swatch ? (
                <View style={[styles.swatch, { backgroundColor: o.swatch }]} />
              ) : o.icon ? (
                <Feather
                  name={o.icon}
                  size={20}
                  color={o.destructive ? colors.danger : colors.navy}
                />
              ) : null}
              <Text style={[styles.optionText, o.destructive && styles.destructive]}>
                {o.label}
              </Text>
              {o.selected ? <Feather name="check" size={20} color={colors.green} /> : null}
            </Pressable>
          ))}
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,46,0.4)' }, // navy at 40%
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '75%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.toggleOff,
    marginBottom: spacing.md,
  },
  title: { ...text('title'), color: colors.navy, marginBottom: spacing.sm },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    ...text('subtitle'),
    fontFamily: text('body').fontFamily,
    color: colors.navy,
    flex: 1,
  },
  destructive: { color: colors.danger },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
});
