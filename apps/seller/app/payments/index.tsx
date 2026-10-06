// Payments (design 20b-payments, design-changes: saved accounts with one active, radio; no
// verification wording, decision #72 a): the M-Pesa accounts, the one buyers see at checkout,
// "When buyers pay" (at least one on) and "oda never touches your money".
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApiError } from '@/api';
import { errorMessage } from '@/onboarding/labels';
import { paymentsCache, settingsApi, type PaymentAccount, type Payments } from '@/settings/api';
import { ACCOUNT_TITLES, buyersSeeLine, displayNumber, NUMBER_LABELS } from '@/settings/form';
import { SettingsLayout } from '@/settings/SettingsLayout';
import { useLoaded } from '@/settings/useLoaded';
import { FormMessage, InfoNote } from '@/ui/auth';
import { Card, rowStyles, ToggleRow } from '@/ui/rows';
import { Sheet } from '@/ui/sheet';
import { colors, radii, spacing, text } from '@/theme';

export default function PaymentsScreen() {
  const { data, error, offline, reload, keep } = useLoaded(settingsApi.payments, paymentsCache);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [held, setHeld] = useState<PaymentAccount | null>(null);

  async function run(call: () => Promise<{ data: Payments | null; error: ApiError | null }>) {
    setBusy(true);
    setActionError(null);
    const { data: next, error: failed } = await call();
    setBusy(false);
    if (next) keep(next);
    else setActionError(errorMessage(failed));
  }

  function remove(account: PaymentAccount) {
    Alert.alert(
      `Remove ${ACCOUNT_TITLES[account.type]} ${displayNumber(account)}?`,
      'Past orders keep the payment details they showed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run(() => settingsApi.removeAccount(account.id)),
        },
      ],
    );
  }

  const edit = (account?: PaymentAccount) =>
    router.push(
      account ? { pathname: '/payments/account', params: { id: account.id } } : '/payments/account',
    );

  const active = data?.accounts.find((a) => a.isActive) ?? null;
  return (
    <SettingsLayout
      title="Payments"
      subtitle="Buyers pay you directly on M-Pesa"
      loaded={!!data}
      error={error}
      offline={offline}
      onRetry={reload}
      overlay={
        <Sheet
          visible={!!held}
          title={held ? `${ACCOUNT_TITLES[held.type]} ${displayNumber(held)}` : ''}
          onClose={() => setHeld(null)}
          options={
            held
              ? [
                  ...(!held.isActive
                    ? [
                        {
                          key: 'active',
                          label: 'Show this one at checkout',
                          icon: 'check-circle' as const,
                          onPress: () => run(() => settingsApi.activateAccount(held.id)),
                        },
                      ]
                    : []),
                  { key: 'edit', label: 'Edit', icon: 'edit-2', onPress: () => edit(held) },
                  ...(!held.isActive
                    ? [
                        {
                          key: 'remove',
                          label: 'Remove',
                          icon: 'trash-2' as const,
                          destructive: true,
                          onPress: () => remove(held),
                        },
                      ]
                    : []),
                ]
              : []
          }
        />
      }
    >
      {actionError ? <FormMessage>{actionError}</FormMessage> : null}
      {data ? (
        <>
          <Card padded>
            <View style={styles.cardHead}>
              <Text style={rowStyles.overline}>
                {data.accounts.length > 1 ? 'YOUR M-PESA ACCOUNTS' : 'YOUR M-PESA ACCOUNT'}
              </Text>
              {active && data.accounts.length === 1 ? (
                <Text accessibilityRole="link" style={styles.link} onPress={() => edit(active)}>
                  Edit
                </Text>
              ) : null}
            </View>
            {data.accounts.length === 0 ? (
              <Text style={styles.empty}>
                No M-Pesa account yet, so buyers can only pay on delivery. Add your Till, Pochi or
                Paybill to let them pay when they order.
              </Text>
            ) : null}
            <View accessibilityRole="radiogroup" style={styles.accounts}>
              {data.accounts.map((a) => (
                <AccountBox
                  key={a.id}
                  account={a}
                  showRadio={data.accounts.length > 1}
                  disabled={busy || offline}
                  onPress={() => setHeld(a)}
                />
              ))}
            </View>
            {active ? (
              <View style={styles.example}>
                <Text style={styles.exampleText}>
                  Buyers see <Text style={styles.exampleStrong}>“{buyersSeeLine(active)}”</Text>{' '}
                  when they order.
                </Text>
              </View>
            ) : null}
          </Card>

          <Card padded>
            <Text style={rowStyles.overline}>WHEN BUYERS PAY</Text>
            <ToggleRow
              title="Before delivery"
              line="Buyer pays when ordering. You confirm, then send."
              value={data.acceptsPayBefore}
              disabled={busy || offline}
              onToggle={(on) => run(() => settingsApi.paymentSettings({ acceptsPayBefore: on }))}
            />
            <ToggleRow
              title="On delivery"
              line="Buyer pays the rider or you when the order arrives."
              value={data.acceptsPayOnDelivery}
              disabled={busy || offline}
              onToggle={(on) =>
                run(() => settingsApi.paymentSettings({ acceptsPayOnDelivery: on }))
              }
            />
            {data.acceptsPayBefore && !active ? (
              <Text style={styles.warn}>
                Add an M-Pesa account so buyers can pay before delivery.
              </Text>
            ) : null}
          </Card>

          <Pressable
            accessibilityRole="button"
            disabled={offline}
            onPress={() => edit()}
            style={({ pressed }) => [styles.addCard, pressed && styles.pressed]}
          >
            <View style={styles.addButton}>
              <Feather name="plus" size={20} color={colors.navy} />
              <Text style={styles.addText}>
                {data.accounts.length ? 'Add another M-Pesa account' : 'Add an M-Pesa account'}
              </Text>
            </View>
          </Pressable>

          <InfoNote icon="shield">
            oda never touches your money. Payments go straight from the buyer&apos;s M-Pesa to
            yours.
          </InfoNote>
        </>
      ) : null}
    </SettingsLayout>
  );
}

function AccountBox({
  account,
  showRadio,
  disabled,
  onPress,
}: {
  account: PaymentAccount;
  showRadio: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const icon =
    account.type === 'till' ? 'grid' : account.type === 'pochi' ? 'smartphone' : 'file-text';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: account.isActive, disabled }}
      accessibilityHint="Opens choices for this account"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.box,
        account.isActive && styles.boxActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.boxHead}>
        <View style={styles.iconTile}>
          <Feather name={icon} size={20} color={colors.navy} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.boxTitle}>{ACCOUNT_TITLES[account.type]}</Text>
          <Text style={styles.boxLine}>
            {account.isActive ? 'Shown at checkout' : 'Saved · tap to use it'}
          </Text>
        </View>
        {showRadio ? (
          <View style={[styles.radio, account.isActive && styles.radioOn]}>
            {account.isActive ? <View style={styles.radioDot} /> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.detail}>
        <Text style={styles.detailLabel}>{NUMBER_LABELS[account.type]}</Text>
        <Text style={styles.detailValue}>{displayNumber(account)}</Text>
      </View>
      {account.type === 'paybill' ? (
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Account</Text>
          <Text style={styles.detailValue}>
            {account.accountRefMode === 'order_number' ? 'Order number' : account.accountRef}
          </Text>
        </View>
      ) : null}
      <View style={styles.detail}>
        <Text style={styles.detailLabel}>Name on the account</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {account.accountName}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { ...text('bodyStrong'), color: colors.navy, textDecorationLine: 'underline' },
  empty: { ...text('body'), color: colors.textSecondary },
  accounts: { gap: spacing.sm },
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  boxActive: { borderWidth: 2, borderColor: colors.navy },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTitle: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  boxLine: { ...text('body'), color: colors.textSecondary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.navy },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.navy },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { ...text('body'), color: colors.textSecondary },
  detailValue: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.navy,
    flexShrink: 1,
  },
  example: { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: spacing.md },
  exampleText: { ...text('body'), color: colors.textSecondary },
  exampleStrong: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  warn: { ...text('small'), color: colors.warningTextStrong },
  addCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
  addText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  pressed: { opacity: 0.85 },
});
