// Start gate: where the app opens. No stored session → Welcome; a session → GET /api/me
// decides (the onboarding step reached, or the tabs once onboarding is done). Reads the session cookie directly, never Better Auth's session atom, which
// refreshes ~10 ms after a verified code (src/auth/start.ts). Every path ends: a timeout,
// an offline message or an error message, never an endless spinner.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMe } from '@/api';
import { authClient, signOutLocal } from '@/auth/client';
import { OFFLINE_MESSAGE, UNREACHABLE_MESSAGE } from '@/auth/errors';
import type { StartRoute } from '@/auth/route';
import { getPendingSignup } from '@/auth/signup';
import { resolveStart } from '@/auth/start';
import { clearOnboardingState } from '@/onboarding/useOnboarding';
import { Button, Wordmark } from '@/ui/auth';
import { colors, spacing, text } from '@/theme';

type Problem = Extract<StartRoute, { to: 'offline' | 'unreachable' | 'error' }>['to'];

const PROBLEMS: Record<Problem, { title: string; body: string }> = {
  offline: { title: "You're offline", body: OFFLINE_MESSAGE },
  unreachable: { title: "Couldn't reach oda", body: UNREACHABLE_MESSAGE },
  error: { title: 'Something went wrong', body: "We couldn't open your shop. Please try again." },
};

export default function StartGate() {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Whoever is signed in now, onboarding screens load their state fresh.
    clearOnboardingState();
    resolveStart({
      getCookie: () => authClient.getCookie(),
      fetchMe,
      signOutLocal,
      getPendingSignup,
    }).then((next) => {
      if (cancelled) return;
      switch (next.to) {
        case 'offline':
        case 'unreachable':
        case 'error':
          setProblem(next.to);
          return;
        case '/verify':
          // A sign-up in progress on this phone: back to its code screen.
          router.replace({ pathname: '/verify', params: { email: next.email, resumed: '1' } });
          return;
        default:
          router.replace(next.to);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <SafeAreaView style={styles.screen}>
      <Wordmark size={56} />
      {problem ? (
        <View style={styles.problem}>
          <Text style={styles.problemTitle}>{PROBLEMS[problem].title}</Text>
          <Text style={styles.problemBody}>{PROBLEMS[problem].body}</Text>
          <Button
            title="Try again"
            onPress={() => {
              setProblem(null);
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : (
        <ActivityIndicator
          style={styles.spinner}
          color={colors.primary}
          accessibilityLabel="Loading"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  spinner: { marginTop: spacing.xl },
  problem: { alignSelf: 'stretch', marginTop: spacing.xxl, gap: spacing.md },
  problemTitle: { ...text('title'), color: colors.navy, textAlign: 'center' },
  problemBody: {
    ...text('body'),
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
