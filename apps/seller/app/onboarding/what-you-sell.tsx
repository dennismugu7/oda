// Onboarding step 1, "What do you sell?" (design 09). Skip sets business type "other".
import type { BusinessType } from '@oda/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { onboardingApi, type OnboardingState } from '@/onboarding/api';
import { BUSINESS_TYPE_OPTIONS } from '@/onboarding/labels';
import { ONBOARDING_ROUTES } from '@/onboarding/steps';
import { useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { Button, FormMessage } from '@/ui/auth';
import { ChoiceCard, GreenNote, OnboardingScreen, StepStatus, StepTitle } from '@/ui/onboarding';
import { spacing } from '@/theme';

export default function WhatYouSell() {
  const { state, error, retry } = useOnboarding();
  if (!state) return <StepStatus step={1} error={error} onRetry={retry} />;
  return <Step state={state} />;
}

function Step({ state }: { state: OnboardingState }) {
  const { busy, error, submit } = useSubmit();
  const [picked, setPicked] = useState<BusinessType | null>(
    state.shop?.businessType ?? state.draft.businessType ?? null,
  );

  async function save(body: { businessType: BusinessType } | { skip: true }) {
    const next = await submit(() => onboardingApi.answer({ step: 1, ...body }));
    if (next) router.push(ONBOARDING_ROUTES[2]);
  }

  return (
    <OnboardingScreen
      step={1}
      onSkip={busy ? undefined : () => save({ skip: true })}
      footer={
        <Button
          title="Next"
          loading={busy}
          disabled={!picked}
          onPress={() => picked && save({ businessType: picked })}
        />
      }
    >
      <StepTitle subtitle="Pick the closest one. We'll set up your shop to match.">
        What do you sell?
      </StepTitle>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {BUSINESS_TYPE_OPTIONS.map((option) => (
          <View key={option.value} style={styles.cell}>
            <ChoiceCard
              label={option.label}
              icon={option.icon}
              selected={picked === option.value}
              onPress={() => setPicked(option.value)}
            />
          </View>
        ))}
      </View>
      <GreenNote>You can sell anything later. This only sets up your first product.</GreenNote>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { width: '47.5%', flexGrow: 1 },
});
