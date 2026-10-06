// Insights (design 20b-insights): Today / This week / This month in Nairobi time. Sales (a sale
// is a confirmed, sent or delivered order, order-lifecycle.md) with the change against the same
// stretch of the previous period and a bar chart; orders, average order and shop visits; where
// orders come from; top products. Each period loads when picked and is kept for offline.
import Feather from '@expo/vector-icons/Feather';
import { formatKsh, INSIGHT_PERIODS, type InsightPeriod } from '@oda/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { growApi, type Insights } from '@/insights/api';
import { insightsCache } from '@/insights/cache';
import { barFractions, compactNumber, ordersWord } from '@/insights/view';
import { errorMessage } from '@/onboarding/labels';
import { goBack } from '@/settings/SettingsLayout';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { rowStyles } from '@/ui/rows';
import { ScreenHeader } from '@/ui/screenHeader';
import { colors, radii, spacing, text } from '@/theme';

const PERIOD_LABELS: Record<InsightPeriod, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
};

const EMPTY_LINE: Record<InsightPeriod, string> = {
  today: 'No sales yet today.',
  week: 'No sales yet this week.',
  month: 'No sales yet this month.',
};

const saved = insightsCache.periods;

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<InsightPeriod>('week');
  const [data, setData] = useState<Insights | null>(saved.get('week') ?? null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  // The tab picked now: an answer for another tab is kept, but not shown.
  const picked = useRef<InsightPeriod>('week');

  const load = useCallback(async (p: InsightPeriod) => {
    setLoading(true);
    const { data: next, error: failed } = await growApi.insights(p);
    setLoading(false);
    if (next) {
      saved.set(p, next);
      if (picked.current === p) setData(next);
      setError(null);
      setOffline(false);
    } else {
      setOffline(failed?.code === 'OFFLINE');
      setError(errorMessage(failed));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period]),
  );

  function pick(p: InsightPeriod) {
    picked.current = p;
    setPeriod(p);
    setData(saved.get(p) ?? null);
  }

  const shown = data?.period === period ? data : null;
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Insights"
        subtitle="Sales and where they come from"
        onBack={() => goBack('/more')}
      >
        <View style={styles.tabs} accessibilityRole="tablist">
          {INSIGHT_PERIODS.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="tab"
              accessibilityState={{ selected: p === period }}
              onPress={() => pick(p)}
              style={[styles.tab, p === period && styles.tabOn]}
            >
              <Text style={[styles.tabText, p === period && styles.tabTextOn]}>
                {PERIOD_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {offline ? <OfflineBar /> : error && !shown ? <FormMessage>{error}</FormMessage> : null}
        {!shown ? (
          error && !offline ? (
            <Button title="Try again" onPress={() => load(period)} />
          ) : loading || !error ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : null
        ) : (
          <InsightsBody data={shown} />
        )}
      </ScrollView>
    </View>
  );
}

function InsightsBody({ data }: { data: Insights }) {
  const fractions = barFractions(data.sales.bars);
  const many = data.sales.bars.length > 7;
  const maxSource = Math.max(1, ...data.sources.map((s) => s.orders));
  return (
    <>
      <View style={styles.card}>
        <View style={styles.salesHead}>
          <View style={styles.flex}>
            <Text style={styles.muted}>Sales</Text>
            <Text style={styles.big} accessibilityLabel={`Sales ${formatKsh(data.sales.total)}`}>
              {formatKsh(data.sales.total)}
            </Text>
          </View>
          {data.sales.change ? (
            <View style={[styles.pill, !data.sales.change.up && styles.pillDown]}>
              <Text style={[styles.pillText, !data.sales.change.up && styles.pillTextDown]}>
                {data.sales.change.text}
              </Text>
            </View>
          ) : null}
        </View>
        {data.sales.total === 0 ? (
          <Text style={styles.empty}>{EMPTY_LINE[data.period]}</Text>
        ) : null}
        <View style={[styles.chart, many && styles.chartDense]} accessibilityLabel="Sales by day">
          {fractions.map((f, i) => (
            <View key={i} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    many && styles.barThin,
                    i === data.sales.current ? styles.barNow : null,
                    { height: `${Math.max(f * 100, data.sales.bars[i]! > 0 ? 6 : 3)}%` },
                  ]}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.barLabel, i === data.sales.current && styles.barLabelNow]}
              >
                {data.sales.labels[i]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={compactNumber(data.orders)} label={data.orders === 1 ? 'Order' : 'Orders'} />
        <Stat value={compactNumber(data.averageOrder)} label="Avg. order (KSh)" />
        <Stat value={compactNumber(data.visits)} label="Shop visits" />
      </View>

      <View style={styles.card}>
        <Text style={rowStyles.overline}>WHERE ORDERS COME FROM</Text>
        {data.sources.length === 0 ? (
          <Text style={styles.empty}>
            When buyers order from a link you shared, you&apos;ll see here where they came from.
          </Text>
        ) : (
          data.sources.map((s) => (
            <View key={s.source} style={styles.sourceRow}>
              <Text style={styles.sourceName} numberOfLines={1}>
                {s.label}
              </Text>
              <View style={styles.sourceTrack}>
                <View style={[styles.sourceBar, { width: `${(s.orders / maxSource) * 100}%` }]} />
              </View>
              <Text style={styles.sourceCount}>{ordersWord(s.orders)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={rowStyles.overline}>TOP PRODUCTS</Text>
        {data.topProducts.length === 0 ? (
          <Text style={styles.empty}>Your best sellers show here once you make sales.</Text>
        ) : (
          data.topProducts.map((p, i) => (
            <View key={p.productId ?? p.name} style={[styles.productRow, i > 0 && styles.divider]}>
              {p.thumbUrl ? (
                <Image source={{ uri: p.thumbUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="shopping-bag" size={20} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.productName} numberOfLines={2}>
                {p.name}
              </Text>
              <Text style={styles.sold}>{p.sold} sold</Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xxl },
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.navyRaised,
    borderRadius: radii.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.surface },
  tabText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.toggleOff },
  tabTextOn: { color: colors.navy },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  salesHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  muted: { ...text('body'), color: colors.textSecondary },
  big: { ...text('display'), color: colors.navy },
  pill: {
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillDown: { backgroundColor: colors.warningTint },
  pillText: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.green },
  pillTextDown: { color: colors.warningTextStrong },
  empty: { ...text('body'), color: colors.textSecondary },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    height: 150,
    marginTop: spacing.md,
  },
  chartDense: { gap: 2 },
  barColumn: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radii.sm, backgroundColor: colors.primaryTint },
  barThin: { borderRadius: 2 },
  barNow: { backgroundColor: colors.primary },
  barLabel: {
    ...text('small'),
    color: colors.textMuted,
    marginTop: spacing.xs,
    minWidth: 28,
    textAlign: 'center',
  },
  barLabelNow: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statValue: { ...text('title'), color: colors.navy },
  statLabel: { ...text('small'), color: colors.textSecondary },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
  sourceName: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.navy,
    width: 96,
  },
  sourceTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.surfaceMuted },
  sourceBar: { height: 12, borderRadius: 6, backgroundColor: colors.navy },
  sourceCount: { ...text('body'), color: colors.textSecondary, minWidth: 72, textAlign: 'right' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.beige },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  productName: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy, flex: 1 },
  sold: { ...text('body'), color: colors.textSecondary },
});
