// Placeholder after onboarding (M2b) until Home (M6): the shop link and Sign out.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { displayUrl } from '@oda/shared';
import { fetchMe } from '@/api';
import { SHOP_BASE_URL } from '@/config';
import { signOutLocal } from '@/auth/client';
import { clearOnboardingState } from '@/onboarding/useOnboarding';
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
    // Works offline too: the stored session is removed either way.
    await signOutLocal();
    clearOnboardingState();
    router.replace('/welcome');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Wordmark size={56} />
      <View style={styles.card}>
        <Text style={styles.title}>{me?.shop ? me.shop.name : 'Your shop'}</Text>
        <Text style={styles.body}>{me ? me.email : ' '}</Text>
        <Text style={styles.body}>{me?.shop ? displayUrl(SHOP_BASE_URL, me.shop.slug) : ' '}</Text>
        <Text style={styles.body}>Orders and your Home screen come in the next update.</Text>
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
