// Onboarding step 5, "Where buyers pay you" (design 13, with the wording from
// docs/design-changes.md): Till, Pochi la Biashara or Paybill (with a fixed account number
// or the order number). Saving sends the account to oda's check; "Skip for now" turns on
// pay on delivery (spec §5.2).
import type { AccountRefMode, PaymentAccountType } from '@oda/shared';
import { formatKePhone } from '@oda/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingApi, type OnboardingState } from '@/onboarding/api';
import { PAYMENT_OPTIONS } from '@/onboarding/labels';
import { ONBOARDING_ROUTES } from '@/onboarding/steps';
import { useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { Button, Field, FormMessage, InfoNote, Link } from '@/ui/auth';
import {
  Chip,
  ChoiceCard,
  onboardingStyles,
  OnboardingScreen,
  StepStatus,
  StepTitle,
} from '@/ui/onboarding';
import { colors, spacing, text } from '@/theme';

export default function Payment() {
  const { state, error, retry } = useOnboarding();
  if (!state) return <StepStatus step={5} error={error} onRetry={retry} />;
  return <Step state={state} />;
}

function Step({ state }: { state: OnboardingState }) {
  const account = state.payment?.account ?? null;
  const { busy, error, fields, submit } = useSubmit();
  const [type, setType] = useState<PaymentAccountType>(account?.type ?? 'till');
  const [number, setNumber] = useState(
    !account ? '' : account.type === 'pochi' ? formatKePhone(account.number) : account.number,
  );
  // The name usually matches the shop's; the seller corrects it to match the sticker.
  const [accountName, setAccountName] = useState(
    account?.accountName ?? state.shop?.name.toUpperCase() ?? '',
  );
  const [refMode, setRefMode] = useState<AccountRefMode | null>(account?.accountRefMode ?? null);
  const [accountRef, setAccountRef] = useState(account?.accountRef ?? '');
  const [skipping, setSkipping] = useState(false);

  const option = PAYMENT_OPTIONS.find((o) => o.value === type)!;
  const paybill = type === 'paybill';

  async function save() {
    const next = await submit(() =>
      onboardingApi.payment({
        type,
        number: number.trim(),
        accountName: accountName.trim(),
        accountRefMode: paybill ? refMode : null,
        accountRef: paybill && refMode === 'fixed' ? accountRef.trim() || null : null,
      }),
    );
    if (next) router.push(ONBOARDING_ROUTES[6]);
  }

  async function skip() {
    setSkipping(true);
    const next = await submit(() => onboardingApi.payment({ skip: true }));
    setSkipping(false);
    if (next) router.push(ONBOARDING_ROUTES[6]);
  }

  return (
    <OnboardingScreen
      step={5}
      footer={
        <>
          <Button title="Continue" loading={busy && !skipping} disabled={busy} onPress={save} />
          <Text style={styles.skip}>
            <Link onPress={() => !busy && skip()}>Skip for now</Link> · buyers can only pay on
            delivery until you add this
          </Text>
        </>
      }
    >
      <StepTitle subtitle="Buyers pay you directly. oda never touches your money.">
        Where buyers pay you
      </StepTitle>
      <View style={styles.types} accessibilityRole="radiogroup">
        {PAYMENT_OPTIONS.map((o) => (
          <ChoiceCard
            key={o.value}
            compact
            label={o.label}
            icon={o.icon}
            selected={type === o.value}
            onPress={() => {
              setType(o.value);
              setNumber('');
            }}
          />
        ))}
      </View>
      <Text style={styles.hint}>{option.hint}</Text>

      <View style={[onboardingStyles.card, styles.form]}>
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
          style={styles.number}
        >
          <Text style={styles.help}>
            Buyers see this name before they enter their M-Pesa PIN. Make it match your sticker.
          </Text>
        </Field>
      </View>
      <InfoNote icon="shield">
        Your shop shows &quot;M-Pesa till checked by oda&quot; once we confirm it.
      </InfoNote>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...text('body'), color: colors.textSecondary, marginTop: spacing.md },
  form: { marginTop: spacing.md, paddingTop: 0 },
  number: { fontFamily: 'Poppins_700Bold', fontSize: 18, letterSpacing: 1 },
  refBlock: { marginTop: spacing.lg, gap: spacing.sm },
  label: { ...text('bodyStrong'), color: colors.text },
  refChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  help: { ...text('small'), color: colors.textSecondary, marginTop: spacing.sm },
  fieldError: { ...text('small'), color: colors.danger },
  skip: {
    ...text('body'),
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
