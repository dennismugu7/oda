// One order in the Orders list (design 17-orders): cover, buyer, "#1042 · Kitenge top + 1
// more", total and time; outside To do, a status chip.
import { formatKsh, itemsSummary, listTime, needsMoneyAction, orderStatusLabel } from '@oda/shared';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, text } from '@/theme';
import type { OrderRow as Row } from './api';
import { Icon } from '@/ui/icon';

export function OrderRow({
  order,
  divider,
  showStatus,
  now,
}: {
  order: Row;
  divider: boolean;
  showStatus: boolean;
  now: Date;
}) {
  const status = orderStatusLabel(order);
  const attention = needsMoneyAction(order);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.number} from ${order.buyerName}, ${formatKsh(order.total)}${showStatus ? `, ${status}` : ''}`}
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
    >
      {order.thumbUrl ? (
        <Image source={{ uri: order.thumbUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="shopping-bag" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {order.buyerName}
          </Text>
          {order.source === 'manual' ? <Text style={styles.badge}>Manual</Text> : null}
        </View>
        <Text style={styles.line} numberOfLines={1}>
          #{order.number} · {itemsSummary(order.itemNames)}
        </Text>
        {showStatus ? (
          <Text style={[styles.chip, attention && styles.chipAttention]}>{status}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.total}>{formatKsh(order.total)}</Text>
        <Text style={styles.time}>{listTime(new Date(order.placedAt), now)}</Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.beige },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: {
    ...text('subtitle'),
    fontFamily: fonts.bold,
    color: colors.navy,
    flexShrink: 1,
  },
  badge: {
    ...text('small'),
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  line: { ...text('body'), color: colors.textSecondary },
  chip: {
    ...text('small'),
    fontFamily: fonts.bold,
    alignSelf: 'flex-start',
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    overflow: 'hidden',
    marginTop: 2,
  },
  chipAttention: { color: colors.warningTextStrong, backgroundColor: colors.warningTint },
  right: { alignItems: 'flex-end' },
  total: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  time: { ...text('small'), color: colors.textSecondary },
  pressed: { opacity: 0.85 },
});
