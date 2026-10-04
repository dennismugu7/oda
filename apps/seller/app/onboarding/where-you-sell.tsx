// Onboarding step 2, "Where do you sell today?" (design 10). Multi-select; "I'm just
// starting out" clears the others (no channels). Skip saves no channels too.
import type { Channel } from '@oda/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingApi, type OnboardingState } from '@/onboarding/api';
import { CHANNEL_OPTIONS } from '@/onboarding/labels';
import { ONBOARDING_ROUTES } from '@/onboarding/steps';
import { useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { Button, FormMessage } from '@/ui/auth';
import { BrandIcon, StatusRing } from '@/ui/brandIcons';
import { CheckRow, OnboardingScreen, StepStatus, StepTitle } from '@/ui/onboarding';
import { colors, spacing, text } from '@/theme';

export default function WhereYouSell() {
  const { state, error, retry } = useOnboarding();
  if (!state) return <StepStatus step={2} error={error} onRetry={retry} />;
  return <Step state={state} />;
}

function Step({ state }: { state: OnboardingState }) {
  const saved = state.shop?.channels ?? state.draft.channels ?? null;
  const { busy, error, submit } = useSubmit();
  const [channels, setChannels] = useState<Channel[]>(saved ?? []);
  // A saved empty answer was "just starting out" (or Skip).
  const [startingOut, setStartingOut] = useState(saved?.length === 0);

  function toggle(channel: Channel) {
    setStartingOut(false);
    setChannels((list) =>
      list.includes(channel) ? list.filter((c) => c !== channel) : [...list, channel],
    );
  }

  async function save(body: { channels: Channel[] } | { skip: true }) {
    const next = await submit(() => onboardingApi.answer({ step: 2, ...body }));
    if (next) router.push(ONBOARDING_ROUTES[3]);
  }

  return (
    <OnboardingScreen
      step={2}
      onSkip={busy ? undefined : () => save({ skip: true })}
      footer={
        <Button
          title="Next"
          loading={busy}
          disabled={channels.length === 0 && !startingOut}
          onPress={() => save({ channels: startingOut ? [] : channels })}
        />
      }
    >
      <StepTitle subtitle="Pick all that apply. We'll put these first when you share your link.">
        Where do you sell today?
      </StepTitle>
      <View style={styles.list}>
        {CHANNEL_OPTIONS.map((option) => (
          <CheckRow
            key={option.value}
            title={option.title}
            subtitle={option.subtitle}
            icon={option.icon}
            iconNode={
              option.mark === 'status' ? (
                <StatusRing size={24} />
              ) : option.mark ? (
                <BrandIcon brand={option.mark} size={24} />
              ) : undefined
            }
            tint={option.tint}
            iconColor={option.iconColor}
            checked={!startingOut && channels.includes(option.value)}
            onPress={() => toggle(option.value)}
          />
        ))}
        <View style={styles.or}>
          <View style={styles.line} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.line} />
        </View>
        <CheckRow
          title="I'm just starting out"
          icon="star-outline"
          tint={colors.surfaceMuted}
          iconColor={colors.textSecondary}
          checked={startingOut}
          onPress={() => {
            setStartingOut((on) => !on);
            setChannels([]);
          }}
        />
      </View>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  or: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { ...text('body'), color: colors.textMuted },
});
