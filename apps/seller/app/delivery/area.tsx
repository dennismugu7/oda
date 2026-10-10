// Add or edit a delivery area (20b-delivery → a row or "Add delivery area"): name, fee,
// method (rider / parcel), delivery time, and whether free delivery over the shop's amount
// applies to it. Delete is in the ⋮ menu.
import { DELIVERY_METHOD_LABELS, DELIVERY_METHODS, formatKsh } from '@oda/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deliveryApi, deliveryCache, type Delivery } from '@/delivery/api';
import {
  areaProblem,
  draftFromArea,
  emptyArea,
  fieldsFromDraft,
  type AreaDraft,
} from '@/delivery/form';
import { errorMessage } from '@/onboarding/labels';
import { DraftBanner } from '@/restore/DraftBanner';
import { useDraft } from '@/restore/useDraft';
import { Button, Field, FormMessage } from '@/ui/auth';
import { Chip } from '@/ui/onboarding';
import { ScreenHeader } from '@/ui/screenHeader';
import { Sheet } from '@/ui/sheet';
import { colors, radii, spacing, text } from '@/theme';

export default function AreaScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const [delivery, setDelivery] = useState<Delivery | null>(deliveryCache.get());
  const area = id ? (delivery?.areas.find((a) => a.id === id) ?? null) : null;
  const [draft, setDraft] = useState<AreaDraft>(area ? draftFromArea(area) : emptyArea());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Opened straight from a link (nothing cached): load the areas first.
  useEffect(() => {
    if (delivery) return;
    deliveryApi.get().then(({ data, error: failed }) => {
      if (!data) {
        setError(errorMessage(failed));
        setLoadFailed(true);
        return;
      }
      deliveryCache.set(data);
      setDelivery(data);
      const found = id ? data.areas.find((a) => a.id === id) : null;
      if (found) setDraft(draftFromArea(found));
    });
  }, [delivery, id, attempt]);

  function retry() {
    setError(null);
    setLoadFailed(false);
    setAttempt((n) => n + 1);
  }

  const set = (patch: Partial<AreaDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/delivery'));

  // Unsaved changes survive Android closing the app (decision #100), once the area is loaded.
  const original = area ? draftFromArea(area) : emptyArea();
  const restoredDraft = useDraft<AreaDraft>(`delivery-area.${id ?? 'new'}`, {
    value: draft,
    worthSaving: JSON.stringify(draft) !== JSON.stringify(original),
    restore: setDraft,
    ready: !id || !!area,
  });

  function discardDraft() {
    restoredDraft.discard();
    setDraft(original);
  }

  async function save() {
    const problem = areaProblem(draft);
    if (problem) {
      setFieldErrors({ [problem.field]: problem.message });
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const fields = fieldsFromDraft(draft);
    const { data, error: failed } = area
      ? await deliveryApi.updateArea(area.id, fields)
      : await deliveryApi.createArea(fields);
    setBusy(false);
    if (!data) {
      setError(errorMessage(failed));
      setFieldErrors(failed?.fields ?? {});
      return;
    }
    deliveryCache.set(data);
    back();
  }

  function remove() {
    if (!area || !delivery) return;
    const last = delivery.areas.length === 1 && !delivery.pickupEnabled;
    Alert.alert(
      `Delete ${area.name}?`,
      last
        ? 'This is your only delivery option: your shop will show "Not taking orders yet" until you add another or turn on pickup.'
        : 'Past orders keep the area’s name.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { data, error: failed } = await deliveryApi.deleteArea(area.id);
            setBusy(false);
            if (!data) return setError(errorMessage(failed));
            deliveryCache.set(data);
            back();
          },
        },
      ],
    );
  }

  const title = id ? 'Edit delivery area' : 'Add delivery area';
  if (id && !area) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={title} onBack={back} />
        <View style={styles.body}>
          {loadFailed || delivery ? (
            <>
              <FormMessage>{error ?? 'This delivery area was deleted.'}</FormMessage>
              {loadFailed ? <Button title="Try again" onPress={retry} /> : null}
              <Button
                title="Back to delivery"
                variant={loadFailed ? 'secondary' : 'primary'}
                onPress={back}
              />
            </>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  const threshold = delivery?.freeDeliveryThreshold ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={title}
        subtitle="Buyers pick an area at checkout"
        onBack={back}
        onMenu={area ? () => setMenu(true) : undefined}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <DraftBanner visible={restoredDraft.restored} onDiscard={discardDraft} />
        {error ? <FormMessage>{error}</FormMessage> : null}
        <View style={styles.card}>
          <Field
            label="Area name"
            value={draft.name}
            onChangeText={(name) => set({ name })}
            placeholder="e.g. Kilimani and Westlands"
            maxLength={60}
            error={fieldErrors.name}
            autoFocus={!area}
          />
          <Field
            label="Delivery fee"
            left={<Text style={styles.prefix}>KSh</Text>}
            value={draft.fee}
            onChangeText={(fee) => set({ fee })}
            placeholder="200"
            keyboardType="number-pad"
            maxLength={7}
            error={fieldErrors.fee}
          />
          <Text style={styles.label}>How it gets there</Text>
          <View style={styles.chips}>
            {DELIVERY_METHODS.map((m) => (
              <Chip
                key={m}
                label={DELIVERY_METHOD_LABELS[m]}
                selected={draft.method === m}
                onPress={() => set({ method: m })}
              />
            ))}
          </View>
          <Field
            label="Delivery time"
            labelHint="Optional"
            value={draft.etaLabel}
            onChangeText={(etaLabel) => set({ etaLabel })}
            placeholder="e.g. Same day, 1–2 days"
            maxLength={40}
            error={fieldErrors.etaLabel}
          />
        </View>

        <View style={[styles.card, styles.switchRow]}>
          <View style={styles.flex}>
            <Text style={styles.switchTitle}>Free delivery over the amount</Text>
            <Text style={styles.switchHelp}>
              {threshold === null
                ? 'Set the amount under Free delivery on the Delivery screen.'
                : `Free for orders over ${formatKsh(threshold)}`}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Free delivery over the amount"
            value={draft.freeDeliveryEligible}
            onValueChange={(freeDeliveryEligible) => set({ freeDeliveryEligible })}
            trackColor={{ true: colors.green, false: colors.toggleOff }}
            thumbColor={colors.surface}
          />
        </View>

        <Button title={area ? 'Save changes' : 'Add area'} onPress={save} loading={busy} />
      </ScrollView>

      <Sheet
        visible={menu}
        title={area?.name ?? ''}
        onClose={() => setMenu(false)}
        options={[
          {
            key: 'delete',
            label: 'Delete area',
            icon: 'trash-2',
            destructive: true,
            onPress: remove,
          },
        ]}
      />
    </KeyboardAvoidingView>
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
    gap: spacing.sm,
  },
  label: { ...text('bodyStrong'), color: colors.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  prefix: { ...text('bodyStrong'), color: colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchTitle: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  switchHelp: { ...text('body'), color: colors.textSecondary },
});
