// More tab (design 20): for now the "Your shop" rows that exist (Delivery from M6, decision
// #61; Categories); insights, customers, payments and settings arrive in M8. Sign out lives here.
import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { signOutLocal } from '@/auth/client';
import { useMe } from '@/auth/useMe';
import { deliveryCache } from '@/delivery/api';
import { homeCache, notificationsCache } from '@/home/api';
import { clearOnboardingState } from '@/onboarding/useOnboarding';
import { ordersCache } from '@/orders/api';
import { Button } from '@/ui/auth';
import { TabScreen } from '@/ui/tabs';
import { colors, radii, spacing, text } from '@/theme';

const ROWS: {
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  hint: string;
  href: Href;
}[] = [
  { icon: 'truck', title: 'Delivery', hint: 'Areas, pickup', href: '/delivery' },
  { icon: 'grid', title: 'Categories', hint: 'How buyers filter', href: '/categories' },
];

export default function MoreTab() {
  const me = useMe();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Works offline too: the stored session is removed either way.
    await signOutLocal();
    clearOnboardingState();
    // Another account on this phone must never see this shop's orders.
    ordersCache.clear();
    deliveryCache.set(null);
    homeCache.set(null);
    notificationsCache.set(null);
    router.replace('/welcome');
  }

  return (
    <TabScreen title="More" subtitle={me?.email}>
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
        <Text style={styles.soon}>Insights, customers, payments and settings come later.</Text>
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
