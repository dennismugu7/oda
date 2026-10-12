// Home (designs 15, 16; spec §5.3): greeting, the bell (notifications, with the unread count),
// the shop link (copy, share), the To-do card (To confirm / To send / New with counts and a
// quick action), sales this week (Mon–Sun bars in Nairobi days, % vs the same stretch of last
// week, the top source), "Finish your shop", and the empty state before the first order.
import {
  displayUrl,
  firstName as first,
  formatKsh,
  greeting,
  listTime,
  shareUrl,
  topSourceLine,
  weekBarLabels,
  weekChange,
  type SellerTodoGroup,
} from '@oda/shared';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMe } from '@/auth/useMe';
import { SHOP_BASE_URL } from '@/config';
import { homeApi, homeCache, type HomeData } from '@/home/api';
import { FinishCard } from '@/home/FinishCard';
import { NotTakingOrdersBanner } from '@/home/NotTakingOrdersBanner';
import { errorMessage } from '@/onboarding/labels';
import { ordersApi, ordersCache, type OrderList, type OrderRow } from '@/orders/api';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { ShopLinkText } from '@/ui/shopLink';
import { SuspendedBanner } from '@/ui/suspended';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';

type TodoTab = 'confirm' | 'send' | 'new';

const TODO_TABS: { key: TodoTab; label: string; groups: SellerTodoGroup[] }[] = [
  { key: 'confirm', label: 'To confirm', groups: ['confirm_payment'] },
  { key: 'send', label: 'To send', groups: ['to_send'] },
  { key: 'new', label: 'New', groups: ['new_to_accept', 'new_awaiting_payment'] },
];

export default function HomeTab() {
  const me = useMe();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<HomeData | null>(homeCache.get());
  const [todo, setTodo] = useState<OrderList | null>(ordersCache.list('todo'));
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const [h, list] = await Promise.all([homeApi.get(), ordersApi.list('todo')]);
    setNow(new Date());
    if (h.data) {
      homeCache.set(h.data);
      setHome(h.data);
    }
    if (list.data) {
      ordersCache.setList('todo', list.data);
      setTodo(list.data);
    }
    const failed = h.error ?? list.error;
    setOffline(failed?.code === 'OFFLINE');
    setError(failed ? errorMessage(failed) : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const shop = me?.shop;
  const url = shop ? displayUrl(SHOP_BASE_URL, shop.slug) : '';

  async function copy() {
    if (!shop) return;
    await Clipboard.setStringAsync(`${SHOP_BASE_URL}/${shop.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (!shop) return;
    await Share.share({ message: shareUrl(SHOP_BASE_URL, shop.slug, 'more') }).catch(() => {});
  }

  const unread = home?.unreadNotifications ?? 0;
  const name = home?.firstName ? first(home.firstName) : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />
        }
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <View style={styles.headRow}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={styles.greeting}>
                {greeting(now)}
                {name ? `, ${name}` : ''}
              </Text>
              {shop ? <Text style={styles.shopName}>{shop.name}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
            >
              <Icon name="bell" size={24} color={colors.textOnNavy} />
              {unread > 0 ? (
                <View style={styles.bellCount}>
                  <Text style={styles.bellCountText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          {shop ? (
            <View style={styles.linkPill}>
              <ShopLinkText url={url} style={styles.link} slugStyle={styles.linkSlug} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy your shop link"
                onPress={copy}
                style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
              >
                <Icon name={copied ? 'check' : 'copy'} size={20} color={colors.textOnNavy} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share your shop link"
                onPress={share}
                style={({ pressed }) => [styles.share, pressed && styles.pressed]}
              >
                <Icon name="share" size={18} color={colors.textOnPrimary} />
                <Text style={styles.shareText}>Share</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {home?.ordering ? <NotTakingOrdersBanner blockers={home.ordering.blockers} /> : null}
          {shop?.suspended ? <SuspendedBanner /> : null}
          {offline ? (
            <OfflineBar saved={!!home} />
          ) : error ? (
            <FormMessage>{error}</FormMessage>
          ) : null}
          {error && (!offline || !home) ? <Button title="Try again" onPress={refresh} /> : null}
          {!home && !error ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : null}
          {home && !home.hasOrders ? (
            <>
              <FinishCard />
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Icon name="file-text" size={24} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.emptyTitle}>No orders yet</Text>
                  <Text style={styles.emptyLine}>
                    New orders, payments to confirm and orders to send will show here.
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              {todo ? <TodoCard list={todo} now={now} /> : null}
              {home ? <SalesCard home={home} /> : null}
              <FinishCard compact />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function TodoCard({ list, now }: { list: OrderList; now: Date }) {
  const counts = list.todoCounts;
  const countOf = (t: (typeof TODO_TABS)[number]) => t.groups.reduce((n, g) => n + counts[g], 0);
  const firstWithOrders = TODO_TABS.find((t) => countOf(t) > 0)?.key ?? 'confirm';
  const [picked, setPicked] = useState<TodoTab | null>(null);
  const tab = TODO_TABS.find((t) => t.key === (picked ?? firstWithOrders))!;
  const rows = list.orders.filter((o) => o.todoGroup && tab.groups.includes(o.todoGroup));
  const attention = counts.needs_attention;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          To do
        </Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {counts.total} {counts.total === 1 ? 'order' : 'orders'}
          </Text>
        </View>
      </View>
      {attention > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/orders')}
          style={({ pressed }) => [styles.attention, pressed && styles.pressed]}
        >
          <Icon name="alert-circle" size={18} color={colors.warningTextStrong} />
          <Text style={styles.attentionText}>
            {attention} cancelled {attention === 1 ? 'order needs' : 'orders need'} your attention
          </Text>
          <Icon name="chevron-right" size={18} color={colors.warningTextStrong} />
        </Pressable>
      ) : null}
      <View style={styles.chips} accessibilityRole="tablist">
        {TODO_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = countOf(t);
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.label}, ${n}`}
              onPress={() => setPicked(t.key)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
              <View style={[styles.chipCount, on && n > 0 && styles.chipCountOn]}>
                <Text style={[styles.chipCountText, on && n > 0 && styles.chipCountTextOn]}>
                  {n}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.none}>Nothing here right now.</Text>
      ) : (
        rows.slice(0, 3).map((o, i) => <TodoRow key={o.id} order={o} divider={i > 0} now={now} />)
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/orders')}
        style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
      >
        <Text style={styles.seeAllText}>See all orders</Text>
        <Icon name="chevron-right" size={18} color={colors.navy} />
      </Pressable>
    </View>
  );
}

const QUICK: Partial<Record<SellerTodoGroup, { label: string; action: string; chip: string }>> = {
  confirm_payment: { label: 'Confirm', action: 'confirmPayment', chip: 'Says paid' },
  to_send: { label: 'Send', action: 'markSent', chip: 'To send' },
  new_to_accept: { label: 'Accept', action: 'accept', chip: 'Pay on delivery' },
};

function TodoRow({ order, divider, now }: { order: OrderRow; divider: boolean; now: Date }) {
  const quick = order.todoGroup ? QUICK[order.todoGroup] : undefined;
  const chip = quick?.chip ?? 'Awaiting payment';
  const detail = (action?: string): Href =>
    action
      ? { pathname: '/orders/[id]', params: { id: order.id, action } }
      : { pathname: '/orders/[id]', params: { id: order.id } };
  // The row and its quick action are siblings so TalkBack can reach each one.
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${order.buyerName}, ${chip}, order ${order.number}, ${formatKsh(order.total)}`}
        onPress={() => router.push(detail())}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{order.buyerName.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.rowName} numberOfLines={1}>
              {first(order.buyerName)}
            </Text>
            <Text style={styles.rowChip}>{chip}</Text>
          </View>
          <Text style={styles.rowLine} numberOfLines={1}>
            #{order.number} · {formatKsh(order.total)} · {listTime(new Date(order.placedAt), now)}
          </Text>
        </View>
      </Pressable>
      {quick ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${quick.label} order ${order.number}`}
          onPress={() => router.push(detail(quick.action))}
          style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
        >
          <Text style={styles.quickText}>{quick.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SalesCard({ home }: { home: HomeData }) {
  const { days, thisWeek, lastWeek, todayIndex } = home.sales;
  const change = weekChange(thisWeek, lastWeek);
  const max = Math.max(...days, 1);
  const labels = weekBarLabels(todayIndex);
  const source = topSourceLine(home.sources.top, home.sources.ordersThisWeek);
  return (
    <View style={styles.card}>
      <View style={styles.salesHead}>
        <View style={styles.flex}>
          <Text style={styles.salesLabel}>Sales this week</Text>
          <Text style={styles.salesTotal}>{formatKsh(thisWeek)}</Text>
        </View>
        {change ? (
          <Text style={[styles.change, !change.up && styles.changeDown]}>{change.text}</Text>
        ) : null}
      </View>
      <View
        style={styles.bars}
        accessible
        accessibilityLabel={`Sales by day: ${days
          .slice(0, todayIndex + 1)
          .map((d, i) => `${labels[i]} ${formatKsh(d)}`)
          .join(', ')}`}
      >
        {days.map((d, i) => (
          <View key={i} style={styles.barCol}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: `${Math.max(d > 0 ? (d / max) * 100 : 0, 6)}%` },
                  i === todayIndex && styles.barToday,
                  i > todayIndex && styles.barFuture,
                ]}
              />
            </View>
            <Text style={[styles.barLabel, i === todayIndex && styles.barLabelToday]}>
              {labels[i]}
            </Text>
          </View>
        ))}
      </View>
      {source ? (
        <View style={styles.sourceRow}>
          <Icon name="bar-chart-2" size={20} color={colors.green} />
          <Text style={styles.sourceText}>{source}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
    gap: spacing.lg,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  greeting: { ...text('headline'), color: colors.textOnNavy },
  shopName: { ...text('subtitle'), fontFamily: text('body').fontFamily, color: colors.toggleOff },
  bell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.navyMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellCount: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellCountText: { ...text('small'), fontSize: 11, lineHeight: 14, color: colors.textOnPrimary },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.pill,
    paddingLeft: spacing.md,
    padding: spacing.xs,
  },
  link: { ...text('body'), color: colors.toggleOff, flex: 1 },
  linkSlug: { fontFamily: fonts.bold, color: colors.textOnNavy },
  copy: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.navyMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  shareText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.textOnPrimary },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...text('title'), color: colors.navy },
  pill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningTint,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  attentionText: { ...text('bodyStrong'), color: colors.warningTextStrong, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: 44,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  chipTextOn: { color: colors.textOnNavy },
  chipCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountOn: { backgroundColor: colors.primary },
  chipCountText: { ...text('small'), fontFamily: fonts.bold, color: colors.navy },
  chipCountTextOn: { color: colors.textOnPrimary },
  none: { ...text('body'), color: colors.textSecondary, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: {
    ...text('subtitle'),
    fontFamily: fonts.bold,
    color: colors.navy,
    flexShrink: 1,
  },
  rowChip: {
    ...text('small'),
    fontFamily: fonts.bold,
    color: colors.warningText,
    backgroundColor: colors.warningTint,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  rowLine: { ...text('small'), color: colors.textSecondary },
  quick: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  quickText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.textOnPrimary },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  seeAllText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  salesHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  salesLabel: { ...text('body'), color: colors.textSecondary },
  salesTotal: { ...text('display'), color: colors.navy },
  change: {
    ...text('small'),
    fontFamily: fonts.bold,
    color: colors.green,
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  changeDown: { color: colors.textSecondary, backgroundColor: colors.surfaceMuted },
  bars: { flexDirection: 'row', gap: spacing.sm, height: 120, marginTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { flex: 1, alignSelf: 'stretch', justifyContent: 'flex-end' },
  bar: { borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  barToday: { backgroundColor: colors.primary },
  barFuture: { backgroundColor: colors.track },
  barLabel: { ...text('small'), color: colors.textSecondary },
  barLabelToday: { fontFamily: fonts.bold, color: colors.navy },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  sourceText: { ...text('body'), color: colors.navy, flex: 1 },
  emptyCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...text('title'), fontSize: 18, color: colors.navy },
  emptyLine: { ...text('body'), color: colors.textSecondary },
  pressed: { opacity: 0.85 },
});
