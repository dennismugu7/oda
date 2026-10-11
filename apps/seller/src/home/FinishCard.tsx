// "Finish your shop" on Home (designs 15, 16; spec §5.3): the 7 checklist items (8 while a
// product has no photo, decision #93 D1), hidden once complete. Items with a place to go open it (delivery, products, the WhatsApp test). Once the
// shop has orders it starts folded (16: title, count and bar); a tap opens the items.
import Feather from '@expo/vector-icons/Feather';
import type { FinishItem } from '@oda/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { onboardingApi, type OnboardingState } from '@/onboarding/api';
import { colors, fonts, radii, spacing, text } from '@/theme';

export function FinishCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [open, setOpen] = useState(!compact);

  // Fresh whenever Home shows (e.g. back from the Delivery screen). Best effort: the card
  // simply stays hidden when the call fails.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      onboardingApi.get().then(({ data }) => {
        if (!cancelled && data) setState(data);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const checklist = state?.checklist;
  if (!state?.shop || !checklist || checklist.complete) return null;
  const whatsapp = state.shop.whatsappPhone;

  const actions: Partial<Record<FinishItem, () => void>> = {
    delivery: () => router.push('/delivery'),
    more_products: () => router.push('/products/new'),
    product_photo: () => router.push('/shop'),
    tested_whatsapp: async () => {
      const opened = await Linking.openURL(`https://wa.me/${whatsapp.replace(/^\+/, '')}`).then(
        () => true,
        () => false,
      );
      if (!opened) return;
      const { data } = await onboardingApi.tick('tested_whatsapp');
      if (data) setState(data);
    },
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Finish your shop, ${checklist.done} of ${checklist.total} done`}
        onPress={() => setOpen((o) => !o)}
        style={styles.head}
      >
        <Text accessibilityRole="header" style={styles.title}>
          Finish your shop
        </Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {checklist.done} of {checklist.total}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`${checklist.done} of ${checklist.total} done`}
      >
        <View style={[styles.fill, { width: `${(checklist.done / checklist.total) * 100}%` }]} />
      </View>
      {(open ? checklist.items : []).map((item, i) => {
        const action = item.done ? undefined : actions[item.id];
        return (
          <Pressable
            key={item.id}
            disabled={!action}
            accessibilityRole={action ? 'button' : undefined}
            accessibilityLabel={`${item.label}: ${item.done ? 'done' : 'not yet'}`}
            onPress={action}
            style={({ pressed }) => [
              styles.item,
              i > 0 && styles.divider,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.mark, item.done && styles.markDone]}>
              {item.done ? <Feather name="check" size={14} color={colors.textOnNavy} /> : null}
            </View>
            <Text style={[styles.label, item.done && styles.labelDone]}>{item.label}</Text>
            {action ? <Feather name="chevron-right" size={20} color={colors.textMuted} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  title: { ...text('title'), color: colors.navy, flex: 1 },
  pill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: { ...text('bodyStrong'), color: colors.navy },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.green },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: { borderStyle: 'solid', backgroundColor: colors.green, borderColor: colors.green },
  label: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy, flex: 1 },
  labelDone: { color: colors.textSecondary, fontFamily: text('body').fontFamily },
  pressed: { opacity: 0.85 },
});
