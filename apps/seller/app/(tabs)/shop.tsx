// Shop tab (design 19; design-changes: 18-products is merged in): the shop card with Share,
// filter chips (All, categories, Sold out, Hidden), search, and the product list. Tap a
// product to edit it; long-press to change its status. "View" opens the real buyer shop in
// the in-app browser (19b-preview, decision #60). After a delete, "Product deleted · Undo" shows for ~5 seconds.
import Feather from '@expo/vector-icons/Feather';
import { displayUrl, formatKsh, type ProductStatus } from '@oda/shared';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMe } from '@/auth/useMe';
import { catalogueApi, type Category, type ProductSummary } from '@/catalogue/api';
import { applyFilter, filterChips, rowDetail, type ShopFilter } from '@/catalogue/list';
import {
  clearDeleted,
  currentDeleted,
  onDeleted,
  UNDO_SECONDS,
  type Deleted,
} from '@/catalogue/undo';
import { openBuyerView, shopPageUrl } from '@/catalogue/preview';
import { SHOP_BASE_URL } from '@/config';
import { errorMessage } from '@/onboarding/labels';
import { Button, FormMessage } from '@/ui/auth';
import { ShopAvatar } from '@/ui/shopAvatar';
import { SuspendedBanner } from '@/ui/suspended';
import { colors, radii, spacing, text } from '@/theme';

const STATUS_ACTIONS: { status: ProductStatus; label: string }[] = [
  { status: 'available', label: 'Available' },
  { status: 'sold_out', label: 'Sold out' },
  { status: 'hidden', label: 'Hidden' },
];

export default function ShopTab() {
  const me = useMe();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ShopFilter>({ kind: 'all' });
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [deleted, setDeleted] = useState<Deleted | null>(currentDeleted());

  const load = useCallback(async () => {
    const [list, cats] = await Promise.all([catalogueApi.products(), catalogueApi.categories()]);
    if (list.data && cats.data) {
      setProducts(list.data.products);
      setCategories(cats.data);
      setError(null);
    } else {
      setError(errorMessage(list.error ?? cats.error));
    }
  }, []);

  // Fresh every time the tab shows: edits made on other screens appear at once.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => onDeleted(setDeleted), []);
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(clearDeleted, UNDO_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [deleted]);

  const chips = useMemo(
    () => (products ? filterChips(products, categories) : []),
    [products, categories],
  );
  // A chip can disappear (e.g. its last product moved): then the list falls back to All.
  const chosenKey =
    filter.kind === 'all' ? 'all' : filter.kind === 'category' ? filter.id : filter.status;
  const activeKey = chips.some((c) => c.key === chosenKey) ? chosenKey : 'all';
  const active: ShopFilter = activeKey === chosenKey ? filter : { kind: 'all' };
  const shown = products ? applyFilter(products, active, search) : [];

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function undo() {
    if (!deleted) return;
    clearDeleted();
    const { error: failed } = await catalogueApi.restore(deleted.id);
    if (failed) setError(errorMessage(failed));
    await load();
  }

  function changeStatus(p: ProductSummary) {
    Alert.alert(p.name, 'Show this product as…', [
      ...STATUS_ACTIONS.filter((a) => a.status !== p.status).map((a) => ({
        text: a.label,
        onPress: async () => {
          setProducts((list) =>
            list ? list.map((x) => (x.id === p.id ? { ...x, status: a.status } : x)) : list,
          );
          const { error: failed } = await catalogueApi.update(p.id, { status: a.status });
          if (failed) setError(errorMessage(failed));
          await load();
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  /** The Share screen (19b-share): images, captions and tagged links (M8b). */
  function share() {
    if (me?.shop) router.push('/share');
  }

  const shop = me?.shop;
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>
          Shop
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searching ? 'Close search' : 'Search products'}
          onPress={() => {
            setSearching((on) => !on);
            setSearch('');
          }}
          style={styles.searchButton}
        >
          <Feather name={searching ? 'x' : 'search'} size={22} color={colors.textOnNavy} />
        </Pressable>
      </View>
      {searching ? (
        <TextInput
          autoFocus
          value={search}
          onChangeText={setSearch}
          placeholder="Search your products"
          placeholderTextColor={colors.toggleOff}
          accessibilityLabel="Search your products"
          style={styles.search}
          returnKeyType="search"
        />
      ) : (
        <View style={styles.shopCard}>
          <ShopAvatar name={shop?.name} logoUrl={shop?.logoUrl} />
          <View style={styles.shopText}>
            <Text style={styles.shopName} numberOfLines={1}>
              {shop?.name ?? ' '}
            </Text>
            <Text style={styles.shopLink} numberOfLines={1}>
              {shop ? displayUrl(SHOP_BASE_URL, shop.slug) : ' '}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View your shop as buyers see it"
            disabled={!shop}
            onPress={() => shop && openBuyerView(shopPageUrl(shop.slug))}
            style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}
          >
            <Feather name="eye" size={16} color={colors.textOnNavy} />
            <Text style={styles.viewText}>View</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share your shop"
            onPress={share}
            style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
          >
            <Feather name="share" size={16} color={colors.textOnPrimary} />
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            {header}
            {shop?.suspended ? (
              <View style={styles.suspended}>
                <SuspendedBanner />
              </View>
            ) : null}
            {products && products.length > 0 ? (
              <View style={styles.listHead}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  {chips.map((chip) => {
                    const on = chip.key === activeKey;
                    return (
                      <Pressable
                        key={chip.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setFilter(chip.filter)}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {chip.label}{' '}
                          <Text style={[styles.chipCount, on && styles.chipCountOn]}>
                            {chip.count}
                          </Text>
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.summaryRow}>
                  <Text style={styles.summary}>
                    <Text style={styles.summaryStrong}>
                      {shown.length} {shown.length === 1 ? 'product' : 'products'}
                    </Text>{' '}
                    · newest first
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/categories')}
                    hitSlop={8}
                    style={styles.categoriesLink}
                  >
                    <Text style={styles.categoriesText}>Categories</Text>
                    <Feather name="chevron-right" size={18} color={colors.navy} />
                  </Pressable>
                </View>
              </View>
            ) : null}
            {error ? (
              <View style={styles.pad}>
                <FormMessage>{error}</FormMessage>
                {!products ? <Button title="Try again" onPress={refresh} /> : null}
              </View>
            ) : null}
          </>
        }
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Long-press to change whether buyers can order it"
            onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.id } })}
            onLongPress={() => changeStatus(item)}
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.rowFirst,
              index === shown.length - 1 && styles.rowLast,
              pressed && styles.rowPressed,
            ]}
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Feather name="camera" size={20} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.rowText}>
              <Text
                style={[styles.rowName, item.status !== 'available' && styles.rowNameMuted]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {rowDetail(item) ? (
                <Text style={styles.rowDetail} numberOfLines={1}>
                  {rowDetail(item)}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.price}>{formatKsh(item.price)}</Text>
              {item.status === 'sold_out' ? (
                <Text style={[styles.badge, styles.badgeMuted]}>Sold out</Text>
              ) : item.status === 'hidden' ? (
                <Text style={[styles.badge, styles.badgeMuted]}>Hidden</Text>
              ) : !item.coverUrl ? (
                <Text style={[styles.badge, styles.badgeWarn]}>Add photo</Text>
              ) : null}
            </View>
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={
          !products ? (
            error ? null : (
              <ActivityIndicator style={styles.loading} color={colors.primary} />
            )
          ) : products.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="shopping-bag" size={26} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptyLine}>
                Add a product and buyers can order it from your link.
              </Text>
              <Button title="Add a product" onPress={() => router.push('/products/new')} />
            </View>
          ) : (
            <Text style={styles.noMatch}>No products match.</Text>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />
      {deleted ? (
        <View style={styles.snackbar} accessibilityLiveRegion="polite">
          <Text style={styles.snackText} numberOfLines={1}>
            {deleted.name} deleted
          </Text>
          <Pressable accessibilityRole="button" onPress={undo} hitSlop={8} style={styles.undo}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: spacing.xxxl },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...text('display'), color: colors.textOnNavy },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.navyMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    ...text('body'),
    lineHeight: undefined,
    marginTop: spacing.lg,
    height: 52,
    borderRadius: radii.xl,
    backgroundColor: colors.navyRaised,
    color: colors.textOnNavy,
    paddingHorizontal: spacing.md,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.navyMuted,
    padding: spacing.md,
  },
  shopText: { flex: 1 },
  shopName: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  shopLink: { ...text('small'), color: colors.toggleOff },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.navyMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  viewText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  shareText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.textOnPrimary },
  listHead: { paddingTop: spacing.lg, gap: spacing.md },
  suspended: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  chipTextOn: { color: colors.textOnNavy },
  chipCount: { color: colors.textMuted },
  chipCountOn: { color: colors.toggleOff },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  summary: { ...text('body'), color: colors.textSecondary },
  summaryStrong: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  categoriesLink: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  categoriesText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  pad: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  rowLast: { borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl },
  rowPressed: { backgroundColor: colors.background },
  thumb: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.beige },
  thumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowName: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  rowNameMuted: { color: colors.textSecondary },
  rowDetail: { ...text('small'), color: colors.textSecondary },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  price: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  badge: {
    ...text('small'),
    fontFamily: 'Poppins_700Bold',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  badgeMuted: { backgroundColor: colors.surfaceMuted, color: colors.textSecondary },
  badgeWarn: { backgroundColor: colors.warningTint, color: colors.warningText },
  loading: { marginTop: spacing.xxxl },
  empty: {
    margin: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...text('title'), color: colors.navy },
  emptyLine: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  noMatch: {
    ...text('body'),
    color: colors.textSecondary,
    textAlign: 'center',
    margin: spacing.xl,
  },
  snackbar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    minHeight: 52,
  },
  snackText: { ...text('body'), color: colors.textOnNavy, flex: 1 },
  undo: { paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' },
  undoText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.greenBright },
  pressed: { opacity: 0.85 },
});
