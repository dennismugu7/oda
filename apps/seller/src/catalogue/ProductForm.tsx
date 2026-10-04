// Add / Edit product (design 18-edit-product, with design-changes: an optional "Was price"
// under Price, colours from a preset palette + a custom name, Delete in the ⋮ menu). Photos
// upload as soon as they're picked (decision #52) and Save sends the rest: everything for a
// new product, only what changed for an edit. Delete goes back to the Shop tab, which shows
// "… deleted · Undo" (decision #57).
import Feather from '@expo/vector-icons/Feather';
import { COLOUR_PRESETS, PRODUCT_PHOTOS_MAX, SIZE_PRESETS, type ProductStatus } from '@oda/shared';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMe } from '@/auth/useMe';
import { catalogueApi, type Category, type PhotoInput, type Product } from '@/catalogue/api';
import {
  changedFields,
  customColour,
  draftFrom,
  draftProblem,
  emptyDraft,
  fieldsFrom,
  moneyText,
  move,
  photosChanged,
  STATUS_HELP,
  toggleColour,
  type ProductDraft,
} from '@/catalogue/form';
import { PhotoStrip, type Slot } from '@/catalogue/PhotoStrip';
import { openBuyerView, shopPageUrl } from '@/catalogue/preview';
import { announceDeleted } from '@/catalogue/undo';
import { errorMessage } from '@/onboarding/labels';
import { nativePhotoDeps, pickPhotos, type PickSource } from '@/onboarding/nativePhotos';
import { preparePhoto, uploadProductPhoto, type Picked } from '@/onboarding/photos';
import { addCustomSize, sizeChips, toggleSize } from '@/onboarding/sizes';
import { AuthScreen, Button, Field, FormMessage } from '@/ui/auth';
import { Chip } from '@/ui/onboarding';
import { ScreenHeader as Header } from '@/ui/screenHeader';
import { Sheet, type SheetOption } from '@/ui/sheet';
import { colors, radii, spacing, text } from '@/theme';

let slotIds = 0;
const newSlotId = () => `slot-${++slotIds}`;

const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'sold_out', label: 'Sold out' },
  { value: 'hidden', label: 'Hidden' },
];

function slotsFrom(product: Product | null): Slot[] {
  return (product?.photos ?? []).map((p) => ({
    id: newSlotId(),
    preview: p.thumbUrl ?? p.url ?? '',
    status: 'done',
    photo: { objectKey: p.objectKey, thumbKey: p.thumbKey, width: p.width, height: p.height },
    picked: null,
  }));
}

export function ProductForm({ productId }: { productId?: string }) {
  const me = useMe();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cats = await catalogueApi.categories();
      const prod = productId ? await catalogueApi.product(productId) : null;
      if (cancelled) return;
      if (!cats.data || (prod && !prod.data)) {
        setLoadError(errorMessage(cats.error ?? prod?.error));
        return;
      }
      setCategories(cats.data);
      setProduct(prod?.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, attempt]);

  if (!categories || (productId && !product)) {
    return (
      <Shell title={productId ? 'Edit product' : 'New product'}>
        {loadError ? (
          <View style={styles.status}>
            <FormMessage>{loadError}</FormMessage>
            <Button
              title="Try again"
              onPress={() => {
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        )}
      </Shell>
    );
  }
  return (
    <Editor
      key={product?.id ?? 'new'}
      product={product}
      categories={categories}
      sizePresets={SIZE_PRESETS[me?.shop?.businessType ?? 'other']}
      shopSlug={me?.shop?.slug ?? null}
      onCategoryAdded={(c) => setCategories((list) => [...(list ?? []), c])}
    />
  );
}

/** Header for the loading/error states (the editor has its own with the ⋮ menu). */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AuthScreen header={<Header title={title} onBack={() => router.back()} />}>
      {children}
    </AuthScreen>
  );
}

function Editor({
  product,
  categories,
  sizePresets,
  shopSlug,
  onCategoryAdded,
}: {
  product: Product | null;
  categories: Category[];
  sizePresets: readonly string[];
  shopSlug: string | null;
  onCategoryAdded: (category: Category) => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product ? draftFrom(product) : emptyDraft(),
  );
  const [slots, setSlots] = useState<Slot[]>(() => slotsFrom(product));
  // The saved photo list, to tell whether the photos changed.
  const original = useMemo<PhotoInput[]>(() => slotsFrom(product).map((s) => s.photo!), [product]);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<'menu' | 'category' | 'colour' | 'photo' | null>(null);
  const [photoTarget, setPhotoTarget] = useState<{ slot: Slot; index: number } | null>(null);
  const [addingSize, setAddingSize] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [colourName, setColourName] = useState('');
  const [colourError, setColourError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [dragAvailable, setDragAvailable] = useState(true);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const uploading = slots.some((s) => s.status === 'uploading');
  const room = PRODUCT_PHOTOS_MAX - slots.length;
  const donePhotos = (list: Slot[]) =>
    list.flatMap((s) => (s.status === 'done' && s.photo ? [s.photo] : []));
  const dirty =
    !product ||
    Object.keys(changedFields(product, draft)).length > 0 ||
    photosChanged(original, donePhotos(slots));

  function update(id: string, patch: Partial<Slot>) {
    setSlots((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function upload(slot: Slot) {
    if (!slot.picked) return;
    update(slot.id, { status: 'uploading' });
    try {
      const prepared = await preparePhoto(slot.picked, nativePhotoDeps);
      update(slot.id, { preview: prepared.thumb.uri });
      const result = await uploadProductPhoto(prepared, nativePhotoDeps);
      if (result.photo) {
        const { objectKey, thumbKey, width, height } = result.photo;
        update(slot.id, { status: 'done', photo: { objectKey, thumbKey, width, height } });
      } else {
        update(slot.id, { status: 'failed' });
        setError(result.error);
      }
    } catch {
      update(slot.id, { status: 'failed' });
      setError("Couldn't read that photo. Try another one.");
    }
  }

  async function addPhotos(source: PickSource) {
    const { photos, error: pickError } = await pickPhotos(source, room);
    if (pickError) setError(pickError);
    if (!photos.length) return;
    setError(null);
    const fresh: Slot[] = photos.map((picked: Picked) => ({
      id: newSlotId(),
      preview: picked.uri,
      status: 'uploading',
      photo: null,
      picked,
    }));
    setSlots((list) => [...list, ...fresh]);
    for (const slot of fresh) await upload(slot);
  }

  function chooseSource() {
    Alert.alert('Add photos', undefined, [
      { text: 'Take a photo', onPress: () => addPhotos('camera') },
      { text: 'Choose from gallery', onPress: () => addPhotos('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function save() {
    const photos = donePhotos(slots);
    const problem = uploading
      ? 'Wait for the photos to finish uploading.'
      : slots.some((s) => s.status === 'failed')
        ? 'A photo didn’t upload. Tap it to try again, or remove it.'
        : draftProblem(draft, photos.length);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    setFields({});
    let failed = null;
    if (!product) {
      failed = (await catalogueApi.create(fieldsFrom(draft), photos)).error;
    } else {
      const changes = changedFields(product, draft);
      if (Object.keys(changes).length > 0) {
        failed = (await catalogueApi.update(product.id, changes)).error;
      }
      if (!failed && photosChanged(original, photos)) {
        failed = (await catalogueApi.setPhotos(product.id, photos)).error;
      }
    }
    setSaving(false);
    if (failed) {
      setError(errorMessage(failed));
      setFields(failed.fields ?? {});
      return;
    }
    router.back();
  }

  function leave() {
    if (!dirty || saving) {
      router.back();
      return;
    }
    Alert.alert('Leave without saving?', 'Your changes to this product will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  async function remove() {
    if (!product) return;
    setSaving(true);
    const { error: failed } = await catalogueApi.remove(product.id);
    setSaving(false);
    if (failed) {
      setError(errorMessage(failed));
      return;
    }
    announceDeleted(product.id, product.name);
    router.back();
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const { data, error: failed } = await catalogueApi.createCategory(name);
    if (!data) {
      setError(errorMessage(failed));
      return;
    }
    onCategoryAdded(data);
    set('categoryId', data.id);
    setNewCategory('');
    setSheet(null);
  }

  function addSize() {
    const result = addCustomSize(draft.sizes, customSize);
    set('sizes', result.sizes);
    setSizeError(result.error);
    if (!result.error) {
      setCustomSize('');
      setAddingSize(false);
    }
  }

  function addColour() {
    const result = customColour(draft.colours, colourName);
    set('colours', result.colours);
    setColourError(result.error);
    if (!result.error) {
      setColourName('');
      setSheet(null);
    }
  }

  const category = categories.find((c) => c.id === draft.categoryId);
  const target = photoTarget;
  const photoOptions: SheetOption[] = target
    ? [
        ...(target.slot.status === 'failed'
          ? [
              {
                key: 'retry',
                label: 'Try the upload again',
                icon: 'refresh-cw' as const,
                onPress: () => upload(target.slot),
              },
            ]
          : []),
        ...(target.index > 0
          ? [
              {
                key: 'cover',
                label: 'Make it the cover',
                icon: 'star' as const,
                onPress: () => setSlots((l) => move(l, target.index, 0)),
              },
              {
                key: 'left',
                label: 'Move left',
                icon: 'arrow-left' as const,
                onPress: () => setSlots((l) => move(l, target.index, target.index - 1)),
              },
            ]
          : []),
        ...(target.index < slots.length - 1
          ? [
              {
                key: 'right',
                label: 'Move right',
                icon: 'arrow-right' as const,
                onPress: () => setSlots((l) => move(l, target.index, target.index + 1)),
              },
            ]
          : []),
        {
          key: 'remove',
          label: 'Remove photo',
          icon: 'trash-2' as const,
          destructive: true,
          onPress: () => setSlots((l) => l.filter((s) => s.id !== target.slot.id)),
        },
      ]
    : [];

  return (
    <AuthScreen
      header={
        <Header
          title={draft.name.trim() || (product ? product.name : 'New product')}
          subtitle={product && product.unitsSold > 0 ? `${product.unitsSold} sold` : null}
          link={
            product && shopSlug
              ? {
                  label: 'View in shop',
                  onPress: () => openBuyerView(shopPageUrl(shopSlug, product.id)),
                }
              : null
          }
          onBack={leave}
          onMenu={product ? () => setSheet('menu') : undefined}
        />
      }
      footer={
        <Button
          title={uploading ? 'Uploading photos…' : product ? 'Save changes' : 'Add product'}
          loading={saving}
          disabled={uploading || (!!product && !dirty)}
          onPress={save}
        />
      }
    >
      <View style={[styles.card, styles.first]}>
        <View style={styles.cardHead}>
          <Text style={styles.overline}>PHOTOS</Text>
          <Text style={styles.hint}>
            {slots.length > 1
              ? dragAvailable
                ? 'Hold to reorder'
                : 'Tap a photo to move it'
              : `Up to ${PRODUCT_PHOTOS_MAX}`}
          </Text>
        </View>
        <PhotoStrip
          slots={slots}
          canAdd={room > 0}
          onAdd={chooseSource}
          onTap={(slot, index) => {
            setPhotoTarget({ slot, index });
            setSheet('photo');
          }}
          onReorder={setSlots}
          dragAvailable={dragAvailable}
          onDragUnavailable={() => setDragAvailable(false)}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.overline}>IN YOUR SHOP</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {STATUSES.map((s) => {
            const on = draft.status === s.value;
            return (
              <Pressable
                key={s.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => set('status', s.value)}
                style={[styles.segmentItem, on && styles.segmentOn]}
              >
                {on && s.value === 'available' ? <View style={styles.dot} /> : null}
                <Text
                  style={[styles.segmentText, on && styles.segmentTextOn]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.help}>{STATUS_HELP[draft.status]}</Text>
      </View>

      <View style={[styles.card, styles.formCard]}>
        <Field
          label="Name"
          value={draft.name}
          onChangeText={(v) => set('name', v)}
          placeholder="e.g. Ankara wrap dress"
          autoCapitalize="sentences"
          maxLength={80}
          error={fields.name}
        />
        <Field
          label="Price"
          value={draft.price}
          onChangeText={(v) => set('price', moneyText(v))}
          placeholder="2,800"
          keyboardType="number-pad"
          error={fields.price}
          left={<Text style={styles.prefix}>KSh</Text>}
        />
        <Field
          label="Was price"
          labelHint="Optional"
          value={draft.compareAtPrice}
          onChangeText={(v) => set('compareAtPrice', moneyText(v))}
          placeholder="Shown crossed out"
          keyboardType="number-pad"
          error={fields.compareAtPrice}
          left={<Text style={styles.prefix}>KSh</Text>}
        />
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Category</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Category: ${category?.name ?? 'none'}`}
            onPress={() => setSheet('category')}
            style={styles.select}
          >
            <Text style={[styles.selectText, !category && styles.selectEmpty]}>
              {category?.name ?? 'No category'}
            </Text>
            <Feather name="chevron-down" size={20} color={colors.navy} />
          </Pressable>
        </View>
        <View style={styles.fieldBlock}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.hint}>Optional</Text>
          </View>
          <TextInput
            accessibilityLabel="Description"
            value={draft.description}
            onChangeText={(v) => set('description', v)}
            placeholder="Fabric, fit, what makes it special"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            style={styles.textarea}
          />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.overline}>SIZES AND COLOURS</Text>
          <Text style={styles.hint}>Optional</Text>
        </View>
        <View style={styles.chips}>
          {sizeChips(sizePresets, draft.sizes).map((size) => (
            <Chip
              key={size}
              label={size}
              selected={draft.sizes.includes(size)}
              onPress={() => set('sizes', toggleSize(draft.sizes, size))}
            />
          ))}
          {addingSize ? null : <Chip label="+ Size" dashed onPress={() => setAddingSize(true)} />}
        </View>
        {addingSize ? (
          <View style={styles.inline}>
            <TextInput
              autoFocus
              value={customSize}
              onChangeText={(v) => {
                setCustomSize(v);
                setSizeError(null);
              }}
              onSubmitEditing={addSize}
              placeholder="e.g. One size"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your own size"
              maxLength={30}
              style={styles.inlineInput}
            />
            <Chip label="Add" selected onPress={addSize} />
          </View>
        ) : null}
        {sizeError ? <Text style={styles.fieldError}>{sizeError}</Text> : null}
        <View style={styles.chips}>
          {draft.colours.map((c) => (
            <Pressable
              key={c.name}
              accessibilityRole="button"
              accessibilityLabel={`Remove colour ${c.name}`}
              onPress={() => set('colours', toggleColour(draft.colours, c))}
              style={[styles.colourChip, styles.colourChipOn]}
            >
              {c.hex ? <View style={[styles.swatch, { backgroundColor: c.hex }]} /> : null}
              <Text style={styles.colourTextOn}>{c.name}</Text>
            </Pressable>
          ))}
          <Chip label="+ Colour" dashed onPress={() => setSheet('colour')} />
        </View>
      </View>
      {error ? <FormMessage>{error}</FormMessage> : null}

      <Sheet
        visible={sheet === 'menu'}
        title={product?.name ?? ''}
        onClose={() => setSheet(null)}
        options={[
          {
            key: 'delete',
            label: 'Delete product',
            icon: 'trash-2',
            destructive: true,
            onPress: remove,
          },
        ]}
      />
      <Sheet
        visible={sheet === 'photo'}
        title="Photo"
        onClose={() => setSheet(null)}
        options={photoOptions}
      />
      <Sheet
        visible={sheet === 'category'}
        title="Category"
        onClose={() => setSheet(null)}
        options={[
          {
            key: 'none',
            label: 'No category',
            selected: !draft.categoryId,
            onPress: () => set('categoryId', null),
          },
          ...categories.map((c) => ({
            key: c.id,
            label: c.name,
            selected: draft.categoryId === c.id,
            onPress: () => set('categoryId', c.id),
          })),
        ]}
      >
        <View style={styles.inlineSheet}>
          <TextInput
            value={newCategory}
            onChangeText={setNewCategory}
            onSubmitEditing={addCategory}
            placeholder="New category, e.g. Dresses"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="New category name"
            maxLength={40}
            style={styles.inlineInput}
          />
          <Chip label="Add" selected onPress={addCategory} />
        </View>
      </Sheet>
      <Sheet
        visible={sheet === 'colour'}
        title="Colours"
        onClose={() => setSheet(null)}
        options={COLOUR_PRESETS.map((c) => ({
          key: c.name,
          label: c.name,
          swatch: c.hex,
          selected: draft.colours.some((x) => x.name === c.name),
          onPress: () => set('colours', toggleColour(draft.colours, { name: c.name, hex: c.hex })),
        }))}
      >
        <View style={styles.inlineSheet}>
          <TextInput
            value={colourName}
            onChangeText={(v) => {
              setColourName(v);
              setColourError(null);
            }}
            onSubmitEditing={addColour}
            placeholder="Your own, e.g. Sunset print"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Your own colour"
            maxLength={40}
            style={styles.inlineInput}
          />
          <Chip label="Add" selected onPress={addColour} />
        </View>
        {colourError ? <Text style={styles.fieldError}>{colourError}</Text> : null}
      </Sheet>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: spacing.xl, gap: spacing.lg },
  loading: { marginTop: spacing.xxxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  first: { marginTop: spacing.lg },
  formCard: { paddingTop: 0 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overline: { ...text('overline'), color: colors.textSecondary },
  hint: { ...text('body'), color: colors.textMuted },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  segmentOn: {
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.textSecondary,
  },
  segmentTextOn: { color: colors.navy },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.greenBright },
  help: { ...text('body'), color: colors.textSecondary },
  prefix: { ...text('body'), color: colors.textSecondary },
  fieldBlock: { marginTop: spacing.lg },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...text('bodyStrong'), color: colors.text, marginBottom: spacing.sm },
  select: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
  },
  selectText: { ...text('body'), fontSize: 16, color: colors.text },
  selectEmpty: { color: colors.textMuted },
  textarea: {
    ...text('body'),
    fontSize: 16,
    lineHeight: undefined,
    color: colors.text,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inline: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  inlineSheet: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  inlineInput: {
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
  colourChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  colourChipOn: { backgroundColor: colors.navy },
  colourTextOn: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  fieldError: { ...text('small'), color: colors.danger },
});
