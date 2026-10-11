// One category (design 20b1): rename, show/hide, a preview of the buyer filter chips, and
// which products are in it (remove with ×, "Add products" picks from the others). Changes
// save as they're made. Delete is in the ⋮ menu; the products stay, without a category.
// Not built from the image: dragging products within a category (not in the spec).
import Feather from '@expo/vector-icons/Feather';
import { formatKsh } from '@oda/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogueApi, type Category, type ProductSummary } from '@/catalogue/api';
import { buyerFilters } from '@/catalogue/list';
import { errorMessage } from '@/onboarding/labels';
import { DraftBanner } from '@/restore/DraftBanner';
import { useDraft } from '@/restore/useDraft';
import { Button, Field, FormMessage } from '@/ui/auth';
import { ScreenHeader } from '@/ui/screenHeader';
import { Sheet } from '@/ui/sheet';
import { colors, fonts, radii, spacing, text } from '@/theme';

export default function CategoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    const [cats, list] = await Promise.all([catalogueApi.categories(), catalogueApi.products()]);
    if (cats.data && list.data) {
      setCategories(cats.data);
      setProducts(list.data.products);
      setName((n) => n || (cats.data!.find((c) => c.id === id)?.name ?? ''));
      setError(null);
    } else setError(errorMessage(cats.error ?? list.error));
  }, [id]);

  // Fresh whenever the screen shows (e.g. after editing a product).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const category = categories?.find((c) => c.id === id) ?? null;
  const inCategory = (products ?? []).filter((p) => p.categoryId === id);
  const others = (products ?? []).filter((p) => p.categoryId !== id);

  // A rename not yet saved survives Android closing the app (decision #100).
  const restoredDraft = useDraft<{ name: string }>(`category.${id}`, {
    value: { name },
    worthSaving: !!category && name.trim() !== category.name,
    restore: (saved) => setName(saved.name),
    ready: !!category,
  });

  async function save(fields: { name?: string; isVisible?: boolean }) {
    const { error: failed } = await catalogueApi.updateCategory(id, fields);
    if (failed) setError(errorMessage(failed));
    await load();
  }

  async function setMembers(productIds: string[]) {
    const { error: failed } = await catalogueApi.setCategoryProducts(id, productIds);
    if (failed) setError(errorMessage(failed));
    await load();
  }

  function remove() {
    Alert.alert(
      `Delete "${category?.name ?? 'category'}"?`,
      'Its products stay in your shop, without a category.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error: failed } = await catalogueApi.deleteCategory(id);
            if (failed) setError(errorMessage(failed));
            else router.back();
          },
        },
      ],
    );
  }

  if (!category || !products) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Category" onBack={() => router.back()} />
        <View style={styles.body}>
          {error ? (
            <>
              <FormMessage>{error}</FormMessage>
              <Button title="Try again" onPress={load} />
            </>
          ) : categories ? (
            <FormMessage>This category no longer exists.</FormMessage>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  const preview = buyerFilters(categories!);
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={category.name}
        subtitle={`${inCategory.length} ${inCategory.length === 1 ? 'product' : 'products'} · Category`}
        onBack={() => router.back()}
        onMenu={() => setMenu(true)}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <DraftBanner
          visible={restoredDraft.restored}
          onDiscard={() => {
            restoredDraft.discard();
            setName(category.name);
          }}
        />
        <View style={[styles.card, styles.formCard]}>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            onBlur={() =>
              name.trim() && name.trim() !== category.name && save({ name: name.trim() })
            }
            onSubmitEditing={() =>
              name.trim() && name.trim() !== category.name && save({ name: name.trim() })
            }
            maxLength={40}
            returnKeyType="done"
          />
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Show in my shop</Text>
              <Text style={styles.toggleHelp}>
                {category.isVisible
                  ? `Buyers see a "${category.name}" filter${inCategory.length === 0 ? ' once it has a product' : ''}`
                  : 'Hidden: buyers don’t see this filter'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Show in my shop"
              value={category.isVisible}
              onValueChange={(isVisible) => save({ isVisible })}
              trackColor={{ true: colors.green, false: colors.toggleOff }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.overline}>PREVIEW</Text>
            <Text style={styles.hint}>How the filter looks to buyers</Text>
          </View>
          <View style={styles.chips}>
            {preview.map((label) => {
              const on = label === category.name;
              return (
                <View key={label} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                </View>
              );
            })}
          </View>
          {!preview.includes(category.name) ? (
            <Text style={styles.hint}>
              {category.isVisible
                ? 'Add a product to show this filter to buyers.'
                : 'Turn on "Show in my shop" to show this filter.'}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.overline}>PRODUCTS IN THIS CATEGORY</Text>
          {inCategory.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              {p.coverUrl ? (
                <Image source={{ uri: p.coverUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.status !== 'available' ? (
                    <Text style={styles.badge}>
                      {p.status === 'sold_out' ? 'Sold out' : 'Hidden'}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.price}>{formatKsh(p.price)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Take ${p.name} out of ${category.name}`}
                onPress={() => setMembers(inCategory.filter((x) => x.id !== p.id).map((x) => x.id))}
                style={styles.removeButton}
              >
                <Feather name="x" size={18} color={colors.navy} />
              </Pressable>
            </View>
          ))}
          {inCategory.length === 0 ? (
            <Text style={styles.hint}>No products in this category yet.</Text>
          ) : null}
          {others.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicking(true)}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Feather name="plus" size={20} color={colors.navy} />
              <Text style={styles.addText}>Add products</Text>
            </Pressable>
          ) : null}
        </View>
        {error ? <FormMessage>{error}</FormMessage> : null}
      </ScrollView>

      <Sheet
        visible={picking}
        title={`Add to ${category.name}`}
        onClose={() => setPicking(false)}
        options={others.map((p) => ({
          key: p.id,
          label: p.name,
          icon: 'plus-circle' as const,
          onPress: () => setMembers([...inCategory.map((x) => x.id), p.id]),
        }))}
      />
      <Sheet
        visible={menu}
        title={category.name}
        onClose={() => setMenu(false)}
        options={[
          {
            key: 'delete',
            label: 'Delete category',
            icon: 'trash-2',
            destructive: true,
            onPress: remove,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  formCard: { paddingTop: 0 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  overline: { ...text('overline'), color: colors.textSecondary },
  hint: { ...text('body'), color: colors.textMuted, flexShrink: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleText: { flex: 1 },
  toggleTitle: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  toggleHelp: { ...text('body'), color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  chipTextOn: { color: colors.textOnNavy },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  thumb: { width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.beige },
  thumbEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.toggleOff },
  rowText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: {
    ...text('subtitle'),
    fontFamily: fonts.bold,
    color: colors.navy,
    flexShrink: 1,
  },
  price: { ...text('body'), color: colors.textSecondary },
  badge: {
    ...text('small'),
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  removeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
  },
  addText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  pressed: { opacity: 0.85 },
});
