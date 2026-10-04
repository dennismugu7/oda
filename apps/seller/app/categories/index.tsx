// Categories (design 20b-categories; design-changes: the one categories screen, reached from
// the Shop tab and, later, More). Shown to buyers in this order: hold and drag to reorder
// (up/down arrows if dragging isn't available on this phone). Tap a category to edit it.
import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogueApi, type Category } from '@/catalogue/api';
import { move } from '@/catalogue/form';
import { errorMessage } from '@/onboarding/labels';
import { Button, FormMessage, InfoNote } from '@/ui/auth';
import { Chip } from '@/ui/onboarding';
import { ScreenHeader } from '@/ui/screenHeader';
import { DragBoundary } from '@/ui/dragBoundary';
import { colors, radii, spacing, text } from '@/theme';

function Thumbs({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <View style={[styles.thumb, styles.thumbEmpty]} />;
  return (
    <View style={styles.thumbs}>
      {urls.map((url, i) => (
        <Image
          key={url}
          source={{ uri: url }}
          style={[styles.thumb, i > 0 && styles.thumbOverlap, { zIndex: 3 - i }]}
        />
      ))}
    </View>
  );
}

export default function Categories() {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragAvailable, setDragAvailable] = useState(true);

  const load = useCallback(async () => {
    const { data, error: failed } = await catalogueApi.categories();
    if (data) {
      setCategories(data);
      setError(null);
    } else setError(errorMessage(failed));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function reorder(next: Category[]) {
    const before = categories;
    setCategories(next);
    const { data, error: failed } = await catalogueApi.reorderCategories(next.map((c) => c.id));
    if (data) setCategories(data);
    else {
      setCategories(before);
      setError(errorMessage(failed));
    }
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error: failed } = await catalogueApi.createCategory(name.trim());
    setBusy(false);
    if (!data) {
      setError(errorMessage(failed));
      return;
    }
    setName('');
    setAdding(false);
    await load();
  }

  const row = (c: Category, index: number, drag?: () => void, active = false) => (
    <Pressable
      key={c.id}
      accessibilityRole="button"
      accessibilityLabel={`${c.name}, ${c.productCount} products${c.isVisible ? '' : ', hidden'}`}
      onPress={() => router.push({ pathname: '/categories/[id]', params: { id: c.id } })}
      onLongPress={drag}
      delayLongPress={200}
      style={[styles.row, index > 0 && styles.rowDivider, active && styles.rowActive]}
    >
      {drag ? (
        <Feather name="menu" size={20} color={colors.textMuted} accessibilityElementsHidden />
      ) : (
        <View style={styles.arrows}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move ${c.name} up`}
            disabled={index === 0}
            hitSlop={6}
            onPress={() => categories && reorder(move(categories, index, index - 1))}
          >
            <Feather
              name="chevron-up"
              size={20}
              color={index === 0 ? colors.border : colors.navy}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move ${c.name} down`}
            disabled={!categories || index === categories.length - 1}
            hitSlop={6}
            onPress={() => categories && reorder(move(categories, index, index + 1))}
          >
            <Feather
              name="chevron-down"
              size={20}
              color={categories && index === categories.length - 1 ? colors.border : colors.navy}
            />
          </Pressable>
        </View>
      )}
      <Thumbs urls={c.thumbUrls} />
      <View style={styles.rowText}>
        <Text style={[styles.rowName, !c.isVisible && styles.muted]} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={styles.rowCount}>
          {c.productCount === 0
            ? 'No products yet'
            : `${c.productCount} ${c.productCount === 1 ? 'product' : 'products'}`}
        </Text>
      </View>
      {!c.isVisible ? <Text style={styles.badge}>Hidden</Text> : null}
      <Feather name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );

  const addBlock = adding ? (
    <View style={styles.addRow}>
      <TextInput
        autoFocus
        value={name}
        onChangeText={setName}
        onSubmitEditing={add}
        placeholder="e.g. Dresses"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="New category name"
        maxLength={40}
        style={styles.addInput}
        returnKeyType="done"
      />
      <Chip label={busy ? 'Adding…' : 'Add'} selected onPress={add} />
    </View>
  ) : (
    <Pressable
      accessibilityRole="button"
      onPress={() => setAdding(true)}
      style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
    >
      <Feather name="plus" size={20} color={colors.navy} />
      <Text style={styles.addText}>Add a category</Text>
    </Pressable>
  );

  const plainList = categories ? categories.map((c, i) => row(c, i)) : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Categories"
        subtitle="How buyers filter your shop"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/shop'))}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Shown to buyers in this order.{' '}
          {dragAvailable ? 'Hold a category and drag to reorder.' : 'Use the arrows to reorder.'}{' '}
          Tap a category to edit it.
        </Text>
        {error ? <FormMessage>{error}</FormMessage> : null}
        {!categories ? (
          error ? (
            <Button title="Try again" onPress={load} />
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )
        ) : (
          <View style={styles.card}>
            {categories.length === 0 ? (
              <Text style={styles.empty}>
                No categories yet. Add one so buyers can filter your products.
              </Text>
            ) : dragAvailable ? (
              <DragBoundary fallback={plainList} onFail={() => setDragAvailable(false)}>
                <GestureHandlerRootView>
                  <DraggableFlatList
                    data={categories}
                    scrollEnabled={false}
                    keyExtractor={(c) => c.id}
                    onDragEnd={({ data }) => reorder(data)}
                    renderItem={({ item, drag, isActive, getIndex }) => (
                      <ScaleDecorator>{row(item, getIndex() ?? 0, drag, isActive)}</ScaleDecorator>
                    )}
                  />
                </GestureHandlerRootView>
              </DragBoundary>
            ) : (
              plainList
            )}
            {addBlock}
          </View>
        )}
        <InfoNote icon="info">
          Empty categories stay hidden from buyers until you add a product.
        </InfoNote>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  intro: { ...text('body'), fontSize: 16, color: colors.textSecondary },
  loading: { marginTop: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  empty: { ...text('body'), color: colors.textSecondary, padding: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowActive: { opacity: 0.9 },
  arrows: { gap: 2 },
  thumbs: { flexDirection: 'row' },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.beige,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  thumbOverlap: { marginLeft: -20 },
  thumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    backgroundColor: colors.background,
  },
  rowText: { flex: 1 },
  rowName: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  muted: { color: colors.textSecondary },
  rowCount: { ...text('body'), color: colors.textSecondary },
  badge: {
    ...text('small'),
    fontFamily: 'Poppins_700Bold',
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
  },
  addText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    fontFamily: text('body').fontFamily,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  pressed: { opacity: 0.85 },
});
