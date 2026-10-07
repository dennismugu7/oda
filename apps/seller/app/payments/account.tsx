// Add or edit an M-Pesa account (from 20b-payments): Till, Pochi la Biashara or Paybill (with
// a fixed account number or the order number), and the name M-Pesa shows the buyer. The same
// fields as onboarding step 5. A new account is saved; the first one is shown at checkout.
import { formatKePhone, type AccountRefMode, type PaymentAccountType } from '@oda/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage, PAYMENT_OPTIONS } from '@/onboarding/labels';
import { paymentsCache, settingsApi } from '@/settings/api';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { Button, Field, FormMessage } from '@/ui/auth';
import { Chip, ChoiceCard } from '@/ui/onboarding';
import { Card } from '@/ui/rows';
import { colors, spacing, text } from '@/theme';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const account = id ? paymentsCache.get()?.accounts.find((a) => a.id === id) : undefined;
  const [type, setType] = useState<PaymentAccountType>(account?.type ?? 'till');
  const [number, setNumber] = useState(
    !account ? '' : account.type === 'pochi' ? formatKePhone(account.number) : account.number,
  );
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [refMode, setRefMode] = useState<AccountRefMode | null>(account?.accountRefMode ?? null);
  const [accountRef, setAccountRef] = useState(account?.accountRef ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const option = PAYMENT_OPTIONS.find((o) => o.value === type)!;
  const paybill = type === 'paybill';
  const back = () => goBack('/payments');

  async function save() {
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      type,
      number: number.trim(),
      accountName: accountName.trim(),
      accountRefMode: paybill ? refMode : null,
      accountRef: paybill && refMode === 'fixed' ? accountRef.trim() || null : null,
    };
    const { data, error: failed } = account
      ? await settingsApi.updateAccount(account.id, body)
      : await settingsApi.addAccount(body);
    setBusy(false);
    if (data) {
      paymentsCache.set(data);
      back();
      return;
    }
    setError(errorMessage(failed));
    setFields(failed?.fields ?? {});
  }

  // Opened by id after the app restarted (no saved list): back to the list.
  const missing = !!id && !account;
  return (
    <SettingsLayout
      title={account ? 'Edit M-Pesa account' : 'Add an M-Pesa account'}
      subtitle="Buyers pay you directly"
      loaded={!missing}
      error={missing ? 'This account is no longer here.' : null}
      onRetry={back}
      retryLabel="Back"
      back={back}
    >
      {error ? <FormMessage>{error}</FormMessage> : null}
      <View style={styles.types} accessibilityRole="radiogroup">
        {PAYMENT_OPTIONS.map((o) => (
          <ChoiceCard
            key={o.value}
            compact
            label={o.label}
            icon={o.icon}
            selected={type === o.value}
            onPress={() => {
              if (o.value !== type) setNumber('');
              setType(o.value);
            }}
          />
        ))}
      </View>
      <Text style={styles.hint}>{option.hint}</Text>
      <Card padded>
        <Field
          label={option.numberLabel}
          value={number}
          onChangeText={setNumber}
          placeholder={option.placeholder}
          keyboardType={type === 'pochi' ? 'phone-pad' : 'number-pad'}
          maxLength={type === 'pochi' ? 16 : 7}
          error={fields.number}
          style={styles.number}
        />
        {paybill ? (
          <View style={styles.refBlock}>
            <Text style={styles.label}>Account number buyers enter</Text>
            <View style={styles.refChips}>
              <Chip
                label="A fixed number"
                selected={refMode === 'fixed'}
                onPress={() => setRefMode('fixed')}
              />
              <Chip
                label="The order number"
                selected={refMode === 'order_number'}
                onPress={() => {
                  setRefMode('order_number');
                  setAccountRef('');
                }}
              />
            </View>
            {fields.accountRefMode ? (
              <Text style={styles.fieldError}>{fields.accountRefMode}</Text>
            ) : null}
            {refMode === 'fixed' ? (
              <Field
                label="Account number"
                value={accountRef}
                onChangeText={setAccountRef}
                placeholder="e.g. your bank account number"
                autoCapitalize="characters"
                maxLength={30}
                error={fields.accountRef}
              />
            ) : refMode === 'order_number' ? (
              <Text style={styles.help}>Each buyer enters their order number, e.g. 1042.</Text>
            ) : null}
          </View>
        ) : null}
        <Field
          label="Name on the account"
          value={accountName}
          onChangeText={setAccountName}
          placeholder="e.g. AMANI STYLES"
          autoCapitalize="characters"
          maxLength={60}
          error={fields.accountName}
        >
          <Text style={styles.help}>
            Buyers see this name before they enter their M-Pesa PIN. Make it match your sticker.
          </Text>
        </Field>
      </Card>
      <Button title={account ? 'Save changes' : 'Save account'} onPress={save} loading={busy} />
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...text('body'), color: colors.textSecondary },
  number: { fontFamily: 'Poppins_700Bold', fontSize: 18, letterSpacing: 1 },
  refBlock: { marginTop: spacing.sm, gap: spacing.sm },
  label: { ...text('bodyStrong'), color: colors.text },
  refChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  help: { ...text('small'), color: colors.textSecondary, marginTop: spacing.xs },
  fieldError: { ...text('small'), color: colors.danger },
});
