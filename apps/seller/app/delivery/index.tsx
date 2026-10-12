// Delivery (design 20b-delivery; moved to M6 by decision #61): delivery areas buyers pick at
// checkout, pickup, and free delivery over an amount. All optional (decision #110): with
// neither an area nor pickup, buyers still order and the seller arranges delivery with them;
// the screen says so and offers "I'll arrange delivery with buyers" (the checklist item). Tap
// an area to edit it; hold it to move it or delete it. Pickup and free delivery are edited in
// place.
import {
  DELIVERY_METHOD_LABELS,
  formatKsh,
  freeDeliveryLine,
  freeDeliveryTitle,
  pickupLine,
} from '@oda/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ApiError } from '@/api';
import { deliveryApi, deliveryCache, type Delivery, type DeliveryArea } from '@/delivery/api';
import { parseShillings } from '@/delivery/form';
import { move } from '@/catalogue/form';
import { onboardingApi } from '@/onboarding/api';
import { errorMessage } from '@/onboarding/labels';
import { setOnboardingState } from '@/onboarding/useOnboarding';
import { Button, Field, FormMessage, InfoNote } from '@/ui/auth';
import { OfflineBar } from '@/ui/offline';
import { ScreenHeader } from '@/ui/screenHeader';
import { Sheet } from '@/ui/sheet';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';
import { useConfirm } from '@/ui/confirmSheet';

const METHOD_ICON: Record<DeliveryArea['method'], IconName> = {
  rider: 'bike',
  parcel: 'package-variant-closed',
};

export default function DeliveryScreen() {
  const confirm = useConfirm();
  const insets = useSafeAreaInsets();
  const [delivery, setDelivery] = useState<Delivery | null>(deliveryCache.get());
  const [error, setError] = useState<string | null>(null);
  // Offline: the saved copy, read-only (spec §8): nothing to edit until it's back.
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<'pickup' | 'free' | null>(null);
  const [location, setLocation] = useState('');
  const [hours, setHours] = useState('');
  const [threshold, setThreshold] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [held, setHeld] = useState<DeliveryArea | null>(null);

  const keep = useCallback((value: Delivery) => {
    deliveryCache.set(value);
    setDelivery(value);
  }, []);

  const load = useCallback(async () => {
    const { data, error: failed } = await deliveryApi.get();
    if (data) {
      keep(data);
      setError(null);
      setOffline(false);
    } else {
      setOffline(failed?.code === 'OFFLINE');
      setError(errorMessage(failed));
    }
  }, [keep]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Fresh whenever the screen shows (e.g. back from adding an area).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(call: () => Promise<{ data: Delivery | null; error: ApiError | null }>) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const { data, error: failed } = await call();
    setBusy(false);
    if (data) {
      keep(data);
      return true;
    }
    setError(errorMessage(failed));
    setFieldErrors(failed?.fields ?? {});
    return false;
  }

  /** "I'll arrange delivery with buyers": ticks the optional delivery checklist item. */
  async function arrangeWithBuyers() {
    if (!delivery) return;
    setBusy(true);
    setError(null);
    const { data, error: failed } = await onboardingApi.tick('arrange_delivery');
    setBusy(false);
    if (!data) {
      setError(errorMessage(failed));
      return;
    }
    setOnboardingState(data);
    keep({ ...delivery, arrangeDelivery: true });
  }

  function editPickup() {
    if (!delivery) return;
    setLocation(delivery.pickupLocation ?? '');
    setHours(delivery.pickupHours ?? '');
    setFieldErrors({});
    setEditing('pickup');
  }

  function editFree() {
    if (!delivery) return;
    setThreshold(delivery.freeDeliveryThreshold ? String(delivery.freeDeliveryThreshold) : '');
    setFieldErrors({});
    setEditing('free');
  }

  function togglePickup(on: boolean) {
    if (!delivery) return;
    if (on) {
      // Buyers need to know where: ask for the place before turning it on.
      if (!delivery.pickupLocation) return editPickup();
      run(() => deliveryApi.settings({ pickupEnabled: true }));
      return;
    }
    // Turning the last option off needs no warning: buyers still order (decision #110).
    setEditing(null);
    run(() => deliveryApi.settings({ pickupEnabled: false }));
  }

  async function savePickup() {
    if (!location.trim()) {
      setFieldErrors({ pickupLocation: 'Enter where buyers pick up their orders.' });
      return;
    }
    const saved = await run(() =>
      deliveryApi.settings({
        pickupEnabled: true,
        pickupLocation: location.trim(),
        pickupHours: hours.trim() || null,
      }),
    );
    if (saved) setEditing(null);
  }

  function toggleFree(on: boolean) {
    if (on) return editFree();
    setEditing(null);
    run(() => deliveryApi.settings({ freeDeliveryThreshold: null }));
  }

  async function saveFree() {
    const amount = parseShillings(threshold);
    if (!amount) {
      setFieldErrors({ freeDeliveryThreshold: 'Enter an amount in shillings, e.g. 5000.' });
      return;
    }
    const saved = await run(() => deliveryApi.settings({ freeDeliveryThreshold: amount }));
    if (saved) setEditing(null);
  }

  function removeArea(area: DeliveryArea) {
    if (!delivery) return;
    const remove = () => run(() => deliveryApi.deleteArea(area.id));
    confirm.ask({
      title: `Delete ${area.name}?`,
      message: 'Past orders keep the area’s name.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: remove,
    });
  }

  function moveArea(area: DeliveryArea, by: -1 | 1) {
    if (!delivery) return;
    const from = delivery.areas.findIndex((a) => a.id === area.id);
    const next = move(delivery.areas, from, from + by);
    setDelivery({ ...delivery, areas: next });
    run(() => deliveryApi.reorder(next.map((a) => a.id))).then((ok) => {
      if (!ok) load();
    });
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/more'));

  if (!delivery) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title="Delivery"
          subtitle="Where you deliver and what it costs"
          onBack={back}
        />
        <View style={styles.body}>
          {error ? (
            <>
              {offline ? <OfflineBar saved={false} /> : <FormMessage>{error}</FormMessage>}
              <Button title="Try again" onPress={load} />
            </>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  const heldIndex = held ? delivery.areas.findIndex((a) => a.id === held.id) : -1;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Delivery" subtitle="Where you deliver and what it costs" onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />
        }
      >
        {offline ? <OfflineBar /> : null}
        {!delivery.hasDeliveryOption ? (
          <View style={styles.optional} accessibilityRole="summary">
            <View style={styles.optionalHead}>
              <Icon name="info" size={18} color={colors.navy} />
              <Text accessibilityRole="header" style={styles.optionalTitle}>
                Delivery is optional
              </Text>
            </View>
            <Text style={styles.optionalText}>
              Without delivery areas or pickup, buyers can still order. You arrange delivery with
              them, usually on WhatsApp.
            </Text>
            {delivery.arrangeDelivery ? (
              <View style={styles.optionalDone}>
                <Icon name="check" size={18} color={colors.green} />
                <Text style={styles.optionalDoneText}>You’ll arrange delivery with buyers</Text>
              </View>
            ) : (
              <Button
                title="I’ll arrange delivery with buyers"
                variant="secondary"
                onPress={arrangeWithBuyers}
                loading={busy}
                disabled={offline}
              />
            )}
          </View>
        ) : null}
        {error && !offline ? <FormMessage>{error}</FormMessage> : null}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.overline}>DELIVERY AREAS</Text>
            <Text style={styles.hint}>Buyers pick one at checkout</Text>
          </View>
          {delivery.areas.length === 0 ? (
            <Text style={styles.empty}>
              No delivery areas yet. Add the places you deliver to and what each one costs.
            </Text>
          ) : null}
          {delivery.areas.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`${a.name}, ${DELIVERY_METHOD_LABELS[a.method]}, ${formatKsh(a.fee)}${a.etaLabel ? `, ${a.etaLabel}` : ''}`}
              accessibilityHint="Opens the area. Hold to move or delete it."
              onPress={() => router.push({ pathname: '/delivery/area', params: { id: a.id } })}
              onLongPress={() => setHeld(a)}
              delayLongPress={300}
              disabled={offline}
              accessibilityState={{ disabled: offline }}
              style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}
            >
              <IconTile icon={METHOD_ICON[a.method]} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{a.name}</Text>
                <Text style={styles.rowLine}>{DELIVERY_METHOD_LABELS[a.method]}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.fee}>{a.fee === 0 ? 'Free' : formatKsh(a.fee)}</Text>
                {a.etaLabel ? <Text style={styles.eta}>{a.etaLabel}</Text> : null}
              </View>
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: offline }}
            disabled={offline}
            onPress={() => router.push('/delivery/area')}
            style={({ pressed }) => [
              styles.addButton,
              offline && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="plus" size={20} color={colors.navy} />
            <Text style={styles.addText}>Add delivery area</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.overline}>PICKUP</Text>
          <ToggleRow
            icon="storefront-outline"
            title="Buyers can pick up"
            line={
              delivery.pickupEnabled
                ? pickupLine(delivery.pickupLocation, delivery.pickupHours)
                : 'Off · buyers collect from you for free'
            }
            value={delivery.pickupEnabled}
            onToggle={togglePickup}
            onPress={delivery.pickupEnabled && !offline ? editPickup : undefined}
            disabled={busy || offline}
          />
          {editing === 'pickup' ? (
            <View style={styles.editor}>
              <Field
                label="Where buyers pick up"
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Kilimani stall, Yaya Centre"
                maxLength={120}
                error={fieldErrors.pickupLocation}
                autoFocus
              />
              <Field
                label="Pickup hours"
                labelHint="Optional"
                value={hours}
                onChangeText={setHours}
                placeholder="e.g. Mon–Sat 9am–6pm"
                maxLength={80}
                error={fieldErrors.pickupHours}
              />
              <EditorButtons onSave={savePickup} onCancel={() => setEditing(null)} busy={busy} />
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.overline}>FREE DELIVERY</Text>
          <ToggleRow
            icon="gift-outline"
            title={freeDeliveryTitle(delivery.freeDeliveryThreshold)}
            line={
              delivery.freeDeliveryThreshold === null
                ? 'Turn on to deliver free above an amount'
                : freeDeliveryLine(delivery.areas)
            }
            value={delivery.freeDeliveryThreshold !== null}
            onToggle={toggleFree}
            onPress={delivery.freeDeliveryThreshold !== null && !offline ? editFree : undefined}
            disabled={busy || offline}
          />
          {editing === 'free' ? (
            <View style={styles.editor}>
              <Field
                label="Free delivery on orders over"
                left={<Text style={styles.prefix}>KSh</Text>}
                value={threshold}
                onChangeText={setThreshold}
                placeholder="5000"
                keyboardType="number-pad"
                maxLength={9}
                error={fieldErrors.freeDeliveryThreshold}
                autoFocus
              />
              <Text style={styles.hint}>
                Applies to the areas you mark “Free delivery over the amount”.
              </Text>
              <EditorButtons onSave={saveFree} onCancel={() => setEditing(null)} busy={busy} />
            </View>
          ) : null}
        </View>

        <InfoNote icon="info">
          {delivery.hasDeliveryOption
            ? 'Buyers choose a delivery area or pickup at checkout. The fee is added to their total.'
            : 'Add an area or pickup any time: buyers then choose one at checkout, and the fee is added to their total.'}
        </InfoNote>
      </ScrollView>

      <Sheet
        visible={!!held}
        title={held?.name ?? ''}
        onClose={() => setHeld(null)}
        options={
          held
            ? [
                {
                  key: 'edit',
                  label: 'Edit',
                  icon: 'edit-2',
                  onPress: () =>
                    router.push({ pathname: '/delivery/area', params: { id: held.id } }),
                },
                ...(heldIndex > 0
                  ? [
                      {
                        key: 'up',
                        label: 'Move up',
                        icon: 'arrow-up' as const,
                        onPress: () => moveArea(held, -1),
                      },
                    ]
                  : []),
                ...(heldIndex < delivery.areas.length - 1
                  ? [
                      {
                        key: 'down',
                        label: 'Move down',
                        icon: 'arrow-down' as const,
                        onPress: () => moveArea(held, 1),
                      },
                    ]
                  : []),
                {
                  key: 'delete',
                  label: 'Delete area',
                  icon: 'trash-2',
                  destructive: true,
                  onPress: () => removeArea(held),
                },
              ]
            : []
        }
      />
      {confirm.sheet}
    </View>
  );
}

function IconTile({ icon }: { icon: IconName }) {
  return (
    <View style={styles.iconTile}>
      <Icon name={icon} size={22} color={colors.navy} />
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  line,
  value,
  onToggle,
  onPress,
  disabled,
}: {
  icon: IconName;
  title: string;
  line: string;
  value: boolean;
  onToggle: (on: boolean) => void;
  onPress?: () => void;
  disabled: boolean;
}) {
  const body: ReactNode = (
    <>
      <IconTile icon={icon} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowLine}>{line}</Text>
      </View>
    </>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Edit"
          onPress={onPress}
          style={({ pressed }) => [styles.toggleBody, pressed && styles.pressed]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.toggleBody}>{body}</View>
      )}
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ true: colors.green, false: colors.toggleOff }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

function EditorButtons({
  onSave,
  onCancel,
  busy,
}: {
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.editorButtons}>
      <View style={styles.flex}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={busy} />
      </View>
      <View style={styles.flex}>
        <Button title="Save" onPress={onSave} loading={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xxl },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  overline: { ...text('overline'), color: colors.textSecondary },
  hint: { ...text('small'), color: colors.textSecondary },
  empty: { ...text('body'), color: colors.textSecondary, paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  toggleBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  rowLine: { ...text('body'), color: colors.textSecondary },
  rowRight: { alignItems: 'flex-end' },
  fee: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  eta: { ...text('small'), color: colors.textSecondary },
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
  addText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  editor: { gap: spacing.sm, paddingTop: spacing.sm },
  editorButtons: { flexDirection: 'row', gap: spacing.sm },
  prefix: { ...text('bodyStrong'), color: colors.textSecondary },
  optional: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  optionalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionalTitle: { ...text('bodyStrong'), color: colors.navy },
  optionalText: { ...text('body'), color: colors.textSecondary },
  optionalDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionalDoneText: { ...text('bodyStrong'), color: colors.green },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
