// Onboarding step 4, "Add your first product" (design 12): a cover photo (required, owner
// Step 52) plus up to 4 more, from the camera or the gallery; name; price; optional sizes
// (presets for the business type are suggestions; "+ Other" adds the seller's own). Each
// photo is re-encoded and uploaded as soon as it is picked (decision #52), so Next only saves.
import { PRODUCT_PHOTOS_MAX } from '@oda/shared';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { onboardingApi, type OnboardingPhoto, type OnboardingState } from '@/onboarding/api';
import { nativePhotoDeps, pickPhotos, type PickSource } from '@/onboarding/nativePhotos';
import { preparePhoto, uploadProductPhoto, type Picked } from '@/onboarding/photos';
import { addCustomSize, sizeChips, toggleSize } from '@/onboarding/sizes';
import { ONBOARDING_ROUTES } from '@/onboarding/steps';
import { useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { Button, Field, FormMessage } from '@/ui/auth';
import { Chip, onboardingStyles, OnboardingScreen, StepStatus, StepTitle } from '@/ui/onboarding';
import { colors, fonts, radii, sizes as sizeTokens, spacing, text } from '@/theme';
import { PhotoSourceSheet } from '@/ui/photoSourceSheet';
import { Icon } from '@/ui/icon';

interface Slot {
  id: string;
  preview: string;
  status: 'uploading' | 'done' | 'failed';
  photo: OnboardingPhoto | null;
  picked: Picked | null;
}

let slotIds = 0;
const newId = () => `slot-${++slotIds}`;

/** "2,500" ← "2500"; keeps digits only. */
function priceText(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
  return digits ? Number(digits).toLocaleString('en-US') : '';
}

export default function FirstProduct() {
  const { state, error, retry } = useOnboarding();
  if (!state) return <StepStatus step={4} error={error} onRetry={retry} />;
  return <Step state={state} />;
}

function savedSlots(state: OnboardingState): Slot[] {
  return (state.product?.photos ?? []).map((photo) => ({
    id: newId(),
    preview: photo.thumbUrl ?? photo.url ?? '',
    status: 'done',
    photo,
    picked: null,
  }));
}

const PAUSED_NOTE =
  'Photo uploads are paused for now. Add the product now and its photo later: Finish your shop on Home reminds you.';

function Step({ state }: { state: OnboardingState }) {
  const product = state.product;
  const { busy, error, fields, submit, setError } = useSubmit();
  const [slots, setSlots] = useState<Slot[]>(() => savedSlots(state));
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? priceText(String(product.price)) : '');
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? []);
  const [addingSize, setAddingSize] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [sizeError, setSizeError] = useState<string | null>(null);
  // Storage isn't taking photos (decision #93 D1): the product may be saved without one.
  const [paused, setPaused] = useState(false);
  // The photo sheet: open with the slot it replaces, if any.
  const [photoSheet, setPhotoSheet] = useState<{ replace?: string } | null>(null);

  const uploading = slots.some((s) => s.status === 'uploading');
  const room = PRODUCT_PHOTOS_MAX - slots.length;

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
        setError(result.paused ? PAUSED_NOTE : result.error);
        if (result.paused) setPaused(true);
      }
    } catch {
      update(slot.id, { status: 'failed' });
      setError("Couldn't read that photo. Try another one.");
    }
  }

  async function add(source: PickSource, replace?: string) {
    const { photos, error: pickError } = await pickPhotos(source, replace ? 1 : room);
    if (pickError) setError(pickError);
    if (!photos.length) return;
    setError(null);
    const fresh: Slot[] = photos.map((picked) => ({
      id: newId(),
      preview: picked.uri,
      status: 'uploading',
      photo: null,
      picked,
    }));
    setSlots((list) => {
      if (!replace) return [...list, ...fresh];
      return list.map((s) => (s.id === replace ? fresh[0]! : s));
    });
    for (const slot of fresh) await upload(slot);
  }

  function choose(replace?: string) {
    setPhotoSheet({ replace });
  }

  function remove(id: string) {
    setSlots((list) => list.filter((s) => s.id !== id));
  }

  async function save() {
    const photos = slots.flatMap((s) => (s.status === 'done' && s.photo ? [s.photo] : []));
    const amount = Number(price.replace(/\D/g, ''));
    const photoLater = paused && !photos.length;
    if (!photos.length && !photoLater) {
      setError('Add a photo of your product. Buyers want to see it.');
      return;
    }
    if (!photoLater && slots.some((s) => s.status === 'failed')) {
      setError('A photo didn’t upload. Tap it to try again, or remove it.');
      return;
    }
    if (!name.trim()) {
      setError('Enter the product name.');
      return;
    }
    if (!amount) {
      setError('Enter the price in shillings.');
      return;
    }
    const next = await submit(() =>
      onboardingApi.product({
        name: name.trim(),
        price: amount,
        sizes,
        photos,
        ...(photoLater ? { photoLater: true as const } : {}),
      }),
    );
    if (next) router.push(ONBOARDING_ROUTES[5]);
  }

  function addSize() {
    const result = addCustomSize(sizes, customSize);
    setSizes(result.sizes);
    setSizeError(result.error);
    if (!result.error) {
      setCustomSize('');
      setAddingSize(false);
    }
  }

  const [cover, ...more] = slots;

  return (
    <OnboardingScreen
      step={4}
      footer={
        <Button
          title={uploading ? 'Uploading photos…' : 'Add product'}
          loading={busy}
          disabled={uploading}
          onPress={save}
        />
      }
    >
      <StepTitle subtitle="A photo and a price is enough to start selling.">
        Add your first product
      </StepTitle>

      <View style={styles.photoRow}>
        {cover ? (
          <PhotoTile
            slot={cover}
            big
            onRetry={() => upload(cover)}
            onPress={() => choose(cover.id)}
          >
            <View style={styles.retake}>
              <Icon name="rotate-cw" size={14} color={colors.navy} />
              <Text style={styles.retakeText}>Retake</Text>
            </View>
            <View style={styles.coverChip}>
              <Text style={styles.coverChipText}>Cover photo</Text>
            </View>
          </PhotoTile>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a cover photo"
            onPress={() => choose()}
            style={({ pressed }) => [styles.coverEmpty, pressed && styles.pressed]}
          >
            <Icon name="camera" size={28} color={colors.navy} />
            <Text style={styles.addTitle}>Add a cover photo</Text>
            <Text style={styles.addSub}>Camera or gallery</Text>
          </Pressable>
        )}
        <View style={styles.side}>
          {cover && room > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add more photos"
              onPress={() => choose()}
              style={({ pressed }) => [styles.addMore, pressed && styles.pressed]}
            >
              <Icon name="plus" size={26} color={colors.navy} />
              <Text style={styles.addTitle}>Add more</Text>
              <Text style={styles.addSub}>Up to {PRODUCT_PHOTOS_MAX} photos</Text>
            </Pressable>
          ) : null}
          <View style={styles.tip}>
            <Text style={styles.tipText}>Tip: shoot in daylight on a plain wall.</Text>
          </View>
        </View>
      </View>

      {more.length ? (
        <View style={styles.thumbs}>
          {more.map((slot) => (
            <PhotoTile
              key={slot.id}
              slot={slot}
              onRetry={() => upload(slot)}
              action={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  onPress={() => remove(slot.id)}
                  style={styles.removeTarget}
                >
                  <View style={styles.removeBadge}>
                    <Icon name="x" size={12} color={colors.textOnNavy} />
                  </View>
                </Pressable>
              }
            />
          ))}
        </View>
      ) : null}

      <View style={[onboardingStyles.card, styles.form]}>
        <Field
          label="Product name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Ankara wrap dress"
          autoCapitalize="sentences"
          maxLength={80}
          error={fields.name}
        />
        <Field
          label="Price"
          value={price}
          onChangeText={(v) => setPrice(priceText(v))}
          placeholder="2,500"
          keyboardType="number-pad"
          error={fields.price}
          style={styles.priceInput}
          left={<Text style={styles.prefixStrong}>KSh</Text>}
        />
        <View style={styles.sizesHead}>
          <Text style={styles.label}>Sizes</Text>
          <Text style={styles.optional}>Optional</Text>
        </View>
        <View style={styles.chips}>
          {sizeChips(state.sizePresets, sizes).map((size) => (
            <Chip
              key={size}
              label={size}
              selected={sizes.includes(size)}
              onPress={() => setSizes((list) => toggleSize(list, size))}
            />
          ))}
          {addingSize ? null : <Chip label="+ Other" dashed onPress={() => setAddingSize(true)} />}
        </View>
        {addingSize ? (
          <View style={styles.customRow}>
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
              maxLength={30}
              accessibilityLabel="Your own size"
              style={styles.customInput}
              returnKeyType="done"
            />
            <Chip label="Add" selected onPress={addSize} />
          </View>
        ) : null}
        {sizeError || fields.sizes ? (
          <Text style={styles.fieldError}>{sizeError ?? fields.sizes}</Text>
        ) : null}
      </View>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <PhotoSourceSheet
        visible={photoSheet !== null}
        title={photoSheet?.replace ? 'Retake photo' : 'Add a photo'}
        onPick={(pick) => add(pick, photoSheet?.replace)}
        onClose={() => setPhotoSheet(null)}
      />
    </OnboardingScreen>
  );
}

function PhotoTile({
  slot,
  big = false,
  onRetry,
  onPress,
  action,
  children,
}: {
  slot: Slot;
  big?: boolean;
  onRetry: () => void;
  onPress?: () => void;
  /** A button on the tile (Remove): a sibling of the tile so TalkBack reaches both. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  const failed = slot.status === 'failed';
  const tile = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        failed ? 'Photo failed to upload. Tap to try again.' : big ? 'Cover photo' : 'Photo'
      }
      onPress={failed ? onRetry : onPress}
      disabled={!failed && !onPress}
      style={big ? styles.coverTile : styles.thumb}
    >
      {slot.preview ? (
        <Image
          source={{ uri: slot.preview }}
          style={[StyleSheet.absoluteFill, { borderRadius: big ? radii.xl : radii.md }]}
          resizeMode="cover"
        />
      ) : null}
      {slot.status === 'uploading' ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.textOnNavy} accessibilityLabel="Uploading" />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.overlay}>
          <Icon name="refresh-cw" size={20} color={colors.textOnNavy} />
          <Text style={styles.overlayText}>Try again</Text>
        </View>
      ) : null}
      {children}
    </Pressable>
  );
  if (!action) return tile;
  return (
    <View>
      {tile}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', gap: spacing.md },
  coverTile: {
    flex: 1.3,
    aspectRatio: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.beige,
    overflow: 'hidden',
  },
  coverEmpty: {
    flex: 1.3,
    aspectRatio: 1,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    backgroundColor: colors.beige,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  side: { flex: 1, gap: spacing.md },
  addMore: {
    flex: 1,
    minHeight: 120,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    padding: spacing.sm,
  },
  addTitle: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  addSub: { ...text('small'), color: colors.textSecondary, textAlign: 'center' },
  tip: {
    flex: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.greenTint,
    padding: spacing.md,
  },
  tipText: { ...text('body'), color: colors.green },
  retake: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  retakeText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  coverChip: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.navy,
    borderRadius: radii.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  coverChipText: { ...text('small'), fontFamily: fonts.bold, color: colors.textOnNavy },
  thumbs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.beige,
    overflow: 'visible',
  },
  // A 44 dp target centred on the badge at the tile's corner.
  removeTarget: {
    position: 'absolute',
    top: -17,
    right: -17,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28,26,46,0.45)', // navy at 45%
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  overlayText: { ...text('small'), color: colors.textOnNavy },

  form: { marginTop: spacing.lg, paddingTop: 0 },
  priceInput: { fontFamily: fonts.bold, fontSize: 18 },
  prefixStrong: { ...text('bodyStrong'), fontSize: 16, color: colors.navy },
  sizesHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  label: { ...text('bodyStrong'), color: colors.text },
  optional: { ...text('body'), color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  customInput: {
    flex: 1,
    height: sizeTokens.inputHeight,
    borderWidth: sizeTokens.borderWidth,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    fontFamily: text('body').fontFamily,
    fontSize: 16,
    color: colors.text,
    includeFontPadding: false,
    paddingVertical: 0,
  },
  fieldError: { ...text('small'), color: colors.danger },
  pressed: { opacity: 0.85 },
});
