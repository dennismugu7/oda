// Customers (design 20b-customers): everyone who bought from the shop, grouped by phone. Total
// spent and order count are sales only (confirmed, sent, delivered); "Repeat" = 2 or more.
// Filters All / Repeat / New this month with counts, search by name or phone, newest order
// first, 30 a page (more load at the end of the list), and a WhatsApp button on each row.
import Feather from '@expo/vector-icons/Feather';
import { formatKsh, waLink, type CustomerFilter } from '@oda/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { growApi, type Customer, type CustomersPage } from '@/insights/api';
import { avatarTint, customerLine, phoneLabel } from '@/insights/view';
import { errorMessage } from '@/onboarding/labels';
import { goBack } from '@/settings/SettingsLayout';
import { memoryCache } from '@/settings/useLoaded';
import { Button, FormMessage } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { ScreenHeader } from '@/ui/screenHeader';
import { colors, radii, spacing, text } from '@/theme';

const FILTERS: { key: CustomerFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'new', label: 'New this month' },
];

/** The first page of "All", kept for offline. */
const cache = memoryCache<CustomersPage>();

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<CustomerFilter>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<CustomersPage | null>(cache.get());
  const [rows, setRows] = useState<Customer[]>(cache.get()?.customers ?? []);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const load = useCallback(
    async (opts: { cursor?: number } = {}) => {
      const id = ++request.current;
      setLoading(true);
      const { data, error: failed } = await growApi.customers({
        filter,
        q: query,
        cursor: opts.cursor ?? 0,
      });
      if (id !== request.current) return; // a newer filter or search is on its way
      setLoading(false);
      if (!data) {
        setOffline(failed?.code === 'OFFLINE');
        setError(errorMessage(failed));
        return;
      }
      setError(null);
      setOffline(false);
      setPage(data);
      setRows((current) => (opts.cursor ? [...current, ...data.customers] : data.customers));
      if (filter === 'all' && !query.trim() && !opts.cursor) cache.set(data);
    },
    [filter, query],
  );

  // Reload when the screen shows or the filter changes; searching waits for typing to pause.
  useFocusEffect(
    useCallback(() => {
      if (!query.trim()) load();
    }, [load, query]),
  );
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => load(), 350);
    return () => clearTimeout(timer);
  }, [load, query]);

  const counts = page?.counts;
  const subtitle = counts
    ? `${counts.all} ${counts.all === 1 ? 'person has' : 'people have'} ordered from you`
    : null;

  function toggleSearch() {
    setSearching((on) => !on);
    setQuery('');
  }

  const empty = !loading && page && rows.length === 0;
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Customers"
        subtitle={subtitle}
        onBack={() => goBack('/more')}
        onMenu={toggleSearch}
        menuIcon={searching ? 'x' : 'search'}
        menuLabel={searching ? 'Close search' : 'Search customers'}
      >
        {searching ? (
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or phone"
            placeholderTextColor={colors.toggleOff}
            accessibilityLabel="Search customers"
            returnKeyType="search"
            style={styles.search}
          />
        ) : null}
        <View style={styles.chips}>
          {FILTERS.map((f) => {
            const on = f.key === filter;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
                {counts ? (
                  <Text style={[styles.chipCount, on && styles.chipCountOn]}>{counts[f.key]}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScreenHeader>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.phone}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && page?.nextCursor) load({ cursor: page.nextCursor });
        }}
        ListHeaderComponent={
          <View style={styles.listHead}>
            {offline ? <OfflineBar /> : null}
            {error && !offline ? (
              <>
                <FormMessage>{error}</FormMessage>
                <Button title="Try again" onPress={() => load()} />
              </>
            ) : null}
            {rows.length ? <Text style={styles.sorted}>Sorted by most recent order</Text> : null}
          </View>
        }
        ListEmptyComponent={
          !page && loading ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : empty ? (
            <View style={styles.emptyCard}>
              <Feather name="users" size={28} color={colors.primary} />
              <Text style={styles.emptyTitle}>
                {query.trim()
                  ? 'No customers match'
                  : filter === 'repeat'
                    ? 'No repeat customers yet'
                    : filter === 'new'
                      ? 'No new customers this month'
                      : 'No customers yet'}
              </Text>
              <Text style={styles.emptyText}>
                {query.trim()
                  ? 'Try another name, or the phone number.'
                  : 'Buyers appear here once you confirm their first order.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <CustomerRow customer={item} first={index === 0} last={index === rows.length - 1} />
        )}
        ListFooterComponent={
          loading && rows.length ? <ActivityIndicator color={colors.primary} /> : null
        }
      />
    </View>
  );
}

function CustomerRow({
  customer: c,
  first,
  last,
}: {
  customer: Customer;
  first: boolean;
  last: boolean;
}) {
  const tint = avatarTint(c.phone);
  const firstName = c.name.split(' ')[0] ?? c.name;
  return (
    <View
      style={[
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        !first && styles.divider,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
        <Text style={[styles.avatarText, { color: tint.fg }]}>
          {c.name.trim().charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {c.name}
        </Text>
        <View style={styles.lineRow}>
          <Text style={styles.line}>{customerLine(c)}</Text>
          {c.repeat ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Repeat</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.spent}>
        <Text style={styles.amount}>{formatKsh(c.totalSpent)}</Text>
        <Text style={styles.spentLabel}>spent</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`WhatsApp ${c.name}, ${phoneLabel(c.phone)}`}
        onPress={() => Linking.openURL(waLink(c.phone, `Hi ${firstName}, `)).catch(() => {})}
        style={({ pressed }) => [styles.wa, pressed && styles.pressed]}
      >
        <Feather name="message-circle" size={20} color={colors.green} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg },
  loading: { marginTop: spacing.xxl },
  search: {
    ...text('body'),
    color: colors.textOnNavy,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.navyRaised,
  },
  chipOn: { backgroundColor: colors.surface },
  chipText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.toggleOff },
  chipTextOn: { color: colors.navy },
  chipCount: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.toggleOff },
  chipCountOn: { color: colors.textSecondary },
  listHead: { gap: spacing.md, marginBottom: spacing.md },
  sorted: { ...text('body'), color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('subtitle'), fontFamily: 'Poppins_700Bold' },
  rowText: { flex: 1 },
  name: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  lineRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  line: { ...text('body'), color: colors.textSecondary },
  badge: {
    backgroundColor: colors.greenTint,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  badgeText: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.green },
  spent: { alignItems: 'flex-end' },
  amount: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  spentLabel: { ...text('small'), color: colors.textSecondary },
  wa: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emptyTitle: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  emptyText: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
