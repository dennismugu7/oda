// More tab (design 20-more, M8b): the shop card (logo, name, link, View) in the header, then
// "Your business" (Insights "KSh x this week", Customers, Reviews "4.8 ★ · 38"), "Your shop"
// (Shop profile, Payments "Till 123 456", Delivery "3 areas", Categories), Settings and Help and
// support. Values load fresh whenever the tab shows; offline, the last copy stays (read-only).
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { openBuyerView } from '@/catalogue/preview';
import { growApi, type MoreData } from '@/insights/api';
import { moreRowValues } from '@/insights/view';
import { memoryCache, useLoaded } from '@/settings/useLoaded';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { Card, Row, Section, type FeatherName } from '@/ui/rows';
import { ShopAvatar } from '@/ui/shopAvatar';
import { TabScreen } from '@/ui/tabs';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';

const cache = memoryCache<MoreData>();

type RowSpec = { icon: FeatherName; title: string; value: string; href: Href };

export default function MoreTab() {
  const { data, error, offline, reload } = useLoaded(growApi.more, cache);
  const values = data ? moreRowValues(data) : null;

  const business: RowSpec[] = [
    { icon: 'bar-chart-2', title: 'Insights', value: values?.insights ?? '', href: '/insights' },
    { icon: 'users', title: 'Customers', value: values?.customers ?? '', href: '/customers' },
    { icon: 'star', title: 'Reviews', value: values?.reviews ?? '', href: '/reviews' },
  ];
  const shop: RowSpec[] = [
    {
      icon: 'home',
      title: 'Shop profile',
      value: 'Name, logo, contacts',
      href: '/shop-profile',
    },
    { icon: 'credit-card', title: 'Payments', value: values?.payments ?? '', href: '/payments' },
    { icon: 'truck', title: 'Delivery', value: values?.delivery ?? '', href: '/delivery' },
    { icon: 'grid', title: 'Categories', value: values?.categories ?? '', href: '/categories' },
  ];

  const card = (
    <View style={styles.card}>
      {/* Same rule as the Shop tab: the name wraps on its own line, View beneath (QA round 1). */}
      <View style={styles.cardTop}>
        <ShopAvatar name={data?.shop.name} logoUrl={data?.shop.logoUrl} size={56} />
        <View style={styles.cardText}>
          <Text style={styles.shopName} numberOfLines={2}>
            {data?.shop.name ?? ' '}
          </Text>
          <Text style={styles.shopLink} numberOfLines={1} ellipsizeMode="tail">
            {data ? `${data.shop.linkPrefix}${data.shop.slug}` : ' '}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View your shop as buyers see it"
        disabled={!data}
        onPress={() => data && openBuyerView(data.shop.url)}
        style={({ pressed }) => [styles.view, pressed && styles.pressed]}
      >
        <Icon name="external-link" size={16} color={colors.navy} />
        <Text style={styles.viewText}>View shop</Text>
      </Pressable>
    </View>
  );

  const rows = (list: RowSpec[]) =>
    list.map((row, i) => (
      <Row
        key={row.title}
        first={i === 0}
        icon={row.icon}
        title={row.title}
        value={row.value}
        onPress={() => router.push(row.href)}
      />
    ));

  return (
    <TabScreen title="More" header={card}>
      {offline ? <OfflineBar saved={!!data} /> : error ? <FormMessage>{error}</FormMessage> : null}
      {error && !data ? <Button title="Try again" onPress={reload} /> : null}
      <Section title="YOUR BUSINESS">
        <Card>{rows(business)}</Card>
      </Section>
      <Section title="YOUR SHOP">
        <Card>{rows(shop)}</Card>
      </Section>
      <Card>
        <Row first icon="settings" title="Settings" onPress={() => router.push('/settings')} />
        <Row icon="help-circle" title="Help and support" onPress={() => router.push('/help')} />
      </Card>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.navyMuted,
    padding: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardText: { flex: 1, minWidth: 0, gap: spacing.xxs },
  shopName: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, color: colors.textOnNavy },
  shopLink: { ...text('small'), color: colors.toggleOff },
  view: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  viewText: { ...text('small'), fontFamily: fonts.bold, color: colors.navy },
  pressed: { opacity: 0.85 },
});
