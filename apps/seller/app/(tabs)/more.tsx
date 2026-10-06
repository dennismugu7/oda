// More tab (design 20): "Your business" with Reviews (M7, "4.8 ★ · 38"), the "Your shop"
// rows (Shop profile and Payments from M8a, Delivery from M6, Categories) and Settings (M8a).
// Insights, customers and the full 20-more layout arrive in M8b. Sign out lives here too.
import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMe } from '@/auth/useMe';
import { signOutOnThisPhone } from '@/settings/signOut';
import { Button } from '@/ui/auth';
import { TabScreen } from '@/ui/tabs';
import { colors, radii, spacing, text } from '@/theme';

const ROWS: {
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  hint: string;
  href: Href;
}[] = [
  { icon: 'user', title: 'Shop profile', hint: 'Name, link, logo', href: '/shop-profile' },
  { icon: 'credit-card', title: 'Payments', hint: 'M-Pesa', href: '/payments' },
  { icon: 'truck', title: 'Delivery', hint: 'Areas, pickup', href: '/delivery' },
  { icon: 'grid', title: 'Categories', hint: 'How buyers filter', href: '/categories' },
];

export default function MoreTab() {
  const me = useMe();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await signOutOnThisPhone();
    router.replace('/welcome');
  }

  const rating =
    me?.shop?.ratingCount && me.shop.ratingAvg !== null && me.shop.ratingAvg !== undefined
      ? `${me.shop.ratingAvg.toFixed(1)} ★ · ${me.shop.ratingCount}`
      : 'From buyers';

  return (
    <TabScreen title="More" subtitle={me?.email}>
      <View style={styles.section}>
        <Text style={styles.overline}>YOUR BUSINESS</Text>
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reviews: ${rating}`}
            onPress={() => router.push('/reviews')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconTile}>
              <Feather name="star" size={20} color={colors.navy} />
            </View>
            <Text style={styles.title}>Reviews</Text>
            <Text style={styles.hint}>{rating}</Text>
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.overline}>YOUR SHOP</Text>
        <View style={styles.card}>
          {ROWS.map((row, i) => (
            <Pressable
              key={row.title}
              accessibilityRole="button"
              accessibilityLabel={`${row.title}: ${row.hint}`}
              onPress={() => router.push(row.href)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.iconTile}>
                <Feather name={row.icon} size={20} color={colors.navy} />
              </View>
              <Text style={styles.title}>{row.title}</Text>
              <Text style={styles.hint}>{row.hint}</Text>
              <Feather name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconTile}>
              <Feather name="settings" size={20} color={colors.navy} />
            </View>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.hint}>Account, pause, feedback</Text>
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.soon}>Insights and customers come later.</Text>
      </View>
      <Button title="Sign out" variant="secondary" onPress={signOut} loading={signingOut} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  overline: { ...text('overline'), color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 64,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy, flex: 1 },
  hint: { ...text('body'), color: colors.textSecondary },
  soon: { ...text('small'), color: colors.textSecondary },
  pressed: { opacity: 0.85 },
});
