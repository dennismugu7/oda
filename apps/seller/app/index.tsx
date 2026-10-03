// Start gate: where the app opens. Signed out → Welcome; signed in → GET /api/me decides
// (code screen if the email isn't verified, otherwise the placeholder until onboarding).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMe } from '@/api';
import { authClient } from '@/auth/client';
import { startRoute, type StartRoute } from '@/auth/route';
import { Button, Wordmark } from '@/ui/auth';
import { colors, spacing, text } from '@/theme';

type Problem = Extract<StartRoute, { to: 'offline' | 'error' }>['to'];

async function resolveStart(hasSession: boolean): Promise<StartRoute> {
  const me = hasSession ? await fetchMe() : null;
  if (me?.kind === 'signed-out') await authClient.signOut().catch(() => {});
  return startRoute(hasSession, me);
}

export default function StartGate() {
  const { data: session, isPending } = authClient.useSession();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasSession = !!session;

  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    resolveStart(hasSession).then((next) => {
      if (cancelled) return;
      switch (next.to) {
        case 'offline':
        case 'error':
          setProblem(next.to);
          return;
        case '/verify':
          router.replace({ pathname: '/verify', params: { email: next.email, send: '1' } });
          return;
        default:
          router.replace(next.to);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isPending, hasSession, attempt]);

  return (
    <SafeAreaView style={styles.screen}>
      <Wordmark size={56} />
      {problem ? (
        <View style={styles.problem}>
          <Text style={styles.problemTitle}>
            {problem === 'offline' ? "You're offline" : 'Something went wrong'}
          </Text>
          <Text style={styles.problemBody}>
            {problem === 'offline'
              ? 'Check your internet, then try again.'
              : "We couldn't open your shop. Please try again."}
          </Text>
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
