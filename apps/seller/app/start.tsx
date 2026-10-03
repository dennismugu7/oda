// Placeholder after sign-in (M2a): onboarding (09–14) replaces it in M2b, Home in M6.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMe } from '@/api';
import { authClient } from '@/auth/client';
import type { Me } from '@/auth/route';
import { Button, Wordmark } from '@/ui/auth';
import { colors, spacing, text } from '@/theme';

export default function Start() {
  const [me, setMe] = useState<Me | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetchMe().then((result) => {
      if (result.kind === 'ok') setMe(result.me);
    });
  }, []);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut().catch(() => {});
    router.replace('/welcome');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Wordmark size={56} />
      <View style={styles.card}>
        <Text style={styles.title}>You&apos;re signed in</Text>
        <Text style={styles.body}>{me ? me.email : ' '}</Text>
        <Text style={styles.body}>
          Setting up your shop comes next
          {me?.onboarding.step ? ` (step ${me.onboarding.step} of 6)` : ''}.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button title="Sign out" variant="secondary" onPress={signOut} loading={signingOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  card: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...text('title'), color: colors.navy },
  body: { ...text('body'), color: colors.textSecondary },
  footer: { marginTop: 'auto', paddingBottom: spacing.lg },
});
