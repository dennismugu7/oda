// Orders tab (design 17-orders; spec §5.4): To do (grouped as Needs attention (decision #67),
// Confirm payment, New · to accept, New · awaiting payment, To send), All and Done, and search
// by buyer name, phone or order number. Refreshed whenever the tab shows and on pull-down. Offline it shows the last
// list it loaded, read-only (spec §8). "New order" opens the manual order screen (CP3).
import Feather from '@expo/vector-icons/Feather';
import {
  TODO_GROUP_LABELS,
  TODO_GROUP_ORDER,
  type OrderTab,
  type SellerTodoGroup,
} from '@oda/shared';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/onboarding/labels';
import { ordersApi, ordersCache, type OrderList, type OrderRow as Row } from '@/orders/api';
import { OrderRow } from '@/orders/OrderRow';
import { Button, FormMessage } from '@/ui/auth';
import { LoadMoreFailed, OfflineBar } from '@/ui/offline';
import { colors, radii, spacing, text } from '@/theme';

const TABS: { key: OrderTab; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

/** Rows shown per To-do group before "See n more". */
const GROUP_PREVIEW = 3;

const EMPTY: Record<OrderTab, { title: string; line: string }> = {
  todo: {
    title: 'Nothing to do right now',
    line: 'New orders, payments to confirm and orders to send show here.',
  },
  all: { title: 'No orders yet', line: 'Share your shop link to get your first order.' },
  done: { title: 'No finished orders yet', line: 'Delivered and cancelled orders show here.' },
};

export default function OrdersTab() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<OrderTab>('todo');
  const [lists, setLists] = useState<Partial<Record<OrderTab, OrderList>>>(() => ({
    todo: ordersCache.list('todo') ?? undefined,
  }));
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The tab whose next page didn't load (its footer offers a retry). */
  const [moreFailed, setMoreFailed] = useState<OrderTab | null>(null);
  const [expanded, setExpanded] = useState<Set<SellerTodoGroup>>(new Set());
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<OrderList | null>(null);
  const [now, setNow] = useState(() => new Date());
  const searchSeq = useRef(0);

  const load = useCallback(async (which: OrderTab) => {
    const { data, error: failed } = await ordersApi.list(which);
    setNow(new Date());
    if (data) {
      ordersCache.setList(which, data);
      setLists((l) => ({ ...l, [which]: data }));
      setError(null);
      setOffline(false);
      return;
    }
    setOffline(failed?.code === 'OFFLINE');
    setError(errorMessage(failed));
    const saved = ordersCache.list(which);
    if (saved) setLists((l) => ({ ...l, [which]: saved }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab]),
  );

  // Search as the seller types (a short pause first), across all orders.
  useEffect(() => {
    if (!searching) return;
    const text = q.trim();
    if (!text) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const { data, error: failed } = await ordersApi.list('all', { q: text });
      if (seq !== searchSeq.current) return;
      if (data) {
        setResults(data);
        setError(null);
      } else setError(errorMessage(failed));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, searching]);

  async function refresh() {
    setRefreshing(true);
    await load(tab);
    setRefreshing(false);
  }

  /** `retry`: the seller tapped the footer (scrolling doesn't retry a failed page). */
  async function loadMore(retry = false) {
    const current = lists[tab];
    if (!current?.next || loadingMore || (moreFailed === tab && !retry)) return;
    const which = tab;
    setLoadingMore(true);
    setMoreFailed(null);
    const { data } = await ordersApi.list(which, { cursor: current.next });
    setLoadingMore(false);
    if (!data) {
      setMoreFailed(which);
      return;
    }
    setLists((l) => ({
      ...l,
      [which]: { ...data, orders: [...(l[which]?.orders ?? []), ...data.orders] },
    }));
  }

  function closeSearch() {
    setSearching(false);
    setQ('');
    setResults(null);
  }

  const list = lists[tab];
  const todoTotal = (lists.todo ?? ordersCache.list('todo'))?.todoCounts.total ?? 0;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <StatusBar style="light" />
      {searching ? (
        <View style={styles.searchRow}>
          <Feather name="search" size={20} color={colors.toggleOff} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="Name, phone or order number"
            // On the navy header: the light grey keeps 4.5:1 (M10 contrast test).
            placeholderTextColor={colors.toggleOff}
            accessibilityLabel="Search orders"
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close search"
            hitSlop={10}
            onPress={closeSearch}
          >
            <Feather name="x" size={22} color={colors.textOnNavy} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.title}>
              Orders
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search orders"
              onPress={() => setSearching(true)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Feather name="search" size={22} color={colors.textOnNavy} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/orders/new')}
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
            >
              <Feather name="plus" size={20} color={colors.textOnPrimary} />
              <Text style={styles.newText}>New order</Text>
            </Pressable>
          </View>
          <View style={styles.tabs} accessibilityRole="tablist">
            {TABS.map((t) => {
              const on = t.key === tab;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={
                    t.key === 'todo' && todoTotal ? `To do, ${todoTotal} orders` : t.label
                  }
                  onPress={() => setTab(t.key)}
                  style={[styles.tab, on && styles.tabOn]}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                  {t.key === 'todo' && todoTotal > 0 ? (
                    <View style={styles.count}>
                      <Text style={styles.countText}>{todoTotal > 99 ? '99+' : todoTotal}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );

  // `saved`: false while nothing is shown under it (no list loaded yet).
  const bannerFor = (saved: boolean) =>
    offline || error ? (
      <View style={styles.banner}>
        {offline ? <OfflineBar saved={saved} /> : <FormMessage>{error}</FormMessage>}
      </View>
    ) : null;
  const banner = bannerFor(true);

  if (searching) {
    const found = q.trim() ? results : null;
    return (
      <View style={styles.screen}>
        {header}
        <FlatList
          data={found?.orders ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.listBody}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={banner}
          renderItem={({ item, index }) => (
            <RowCard first={index === 0} last={index === (found?.orders.length ?? 0) - 1}>
              <OrderRow order={item} divider={index > 0} showStatus now={now} />
            </RowCard>
          )}
          ListEmptyComponent={
            found ? (
              <Empty title="No orders found" line={`Nothing matches “${q.trim()}”.`} />
            ) : (
              <Text style={styles.hint}>Search by buyer name, phone or order number.</Text>
            )
          }
        />
      </View>
    );
  }

  if (!list) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.body}>
          {bannerFor(false)}
          {error ? (
            <Button title="Try again" onPress={() => load(tab)} />
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />
  );

  if (tab === 'todo') {
    const groups = TODO_GROUP_ORDER.map((g) => ({
      group: g,
      orders: list.orders.filter((o) => o.todoGroup === g),
    })).filter((g) => g.orders.length > 0);
    return (
      <View style={styles.screen}>
        {header}
        <ScrollView contentContainerStyle={styles.body} refreshControl={refreshControl}>
          {banner}
          {groups.length === 0 ? <Empty {...EMPTY.todo} /> : null}
          {groups.map(({ group, orders }) => {
            const open = expanded.has(group);
            const shown = open ? orders : orders.slice(0, GROUP_PREVIEW);
            const hidden = orders.length - shown.length;
            return (
              <View key={group} style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.overline}>{TODO_GROUP_LABELS[group].toUpperCase()}</Text>
                  <Text style={styles.groupCount}>{list.todoCounts[group]}</Text>
                </View>
                <View style={styles.card}>
                  {shown.map((o: Row, i) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      divider={i > 0}
                      showStatus={group === 'needs_attention'}
                      now={now}
                    />
                  ))}
                  {hidden > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setExpanded((s) => new Set(s).add(group))}
                      style={({ pressed }) => [styles.more, pressed && styles.pressed]}
                    >
                      <Text style={styles.moreText}>See {hidden} more</Text>
                      <Feather name="chevron-down" size={18} color={colors.navy} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <FlatList
        data={list.orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.listBody}
        refreshControl={refreshControl}
        ListHeaderComponent={banner}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => (
          <RowCard first={index === 0} last={index === list.orders.length - 1}>
            <OrderRow order={item} divider={index > 0} showStatus now={now} />
          </RowCard>
        )}
        ListEmptyComponent={<Empty {...EMPTY[tab]} />}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : moreFailed === tab ? (
            <LoadMoreFailed onRetry={() => loadMore(true)} />
          ) : null
        }
      />
    </View>
  );
}

/** A FlatList row drawn as part of one rounded card. */
function RowCard({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.rowCard,
        first && styles.rowCardFirst,
        last && styles.rowCardLast,
        !last && styles.rowCardOpen,
      ]}
    >
      {children}
    </View>
  );
}

function Empty({ title, line }: { title: string; line: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name="file-text" size={24} color={colors.primary} />
      </View>
      <View style={styles.emptyText}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyLine}>{line}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
    gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  newText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.textOnPrimary },
  title: { ...text('display'), color: colors.textOnNavy, flex: 1 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.navyMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.navyRaised,
    borderRadius: radii.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.md,
  },
  tabOn: { backgroundColor: colors.surface },
  tabText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.toggleOff },
  tabTextOn: { color: colors.navy },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.textOnPrimary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  searchInput: {
    flex: 1,
    color: colors.textOnNavy,
    fontFamily: text('body').fontFamily,
    fontSize: 16,
    paddingVertical: 0,
  },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xl },
  hint: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overline: { ...text('overline'), color: colors.textSecondary },
  groupCount: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowCardFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  rowCardLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  rowCardOpen: {},
  listBody: { padding: spacing.lg },
  banner: { marginBottom: spacing.md },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  moreText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  empty: {
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
  emptyText: { flex: 1, gap: spacing.xs },
  emptyTitle: { ...text('title'), fontSize: 18, color: colors.navy },
  emptyLine: { ...text('body'), color: colors.textSecondary },
  pressed: { opacity: 0.85 },
});
