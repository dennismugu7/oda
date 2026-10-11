// Delete account (design-changes NEW: type "DELETE" to confirm; explains that orders and
// customers are removed after 30 days). The shop closes at once and this phone signs out; the
// purge job removes the data, photos and account after 30 days (decision #72 c).
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/onboarding/labels';
import { settingsApi } from '@/settings/api';
import { signOutOnThisPhone } from '@/settings/signOut';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { Button, Field, FormMessage } from '@/ui/auth';
import { Card } from '@/ui/rows';
import { colors, fonts, spacing, text } from '@/theme';

const WHAT_HAPPENS = [
  'Your shop link stops working at once. Buyers with open orders see “This shop has closed”.',
  'You’re signed out on every phone and can’t sign in again.',
  'After 30 days your products, orders, customers, reviews and photos are removed for good.',
];

export default function DeleteAccount() {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim() === 'DELETE';

  async function remove() {
    if (!ready) {
      setError('Type DELETE in capital letters to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: failed } = await settingsApi.deleteAccount();
    if (!data) {
      setBusy(false);
      setError(errorMessage(failed));
      return;
    }
    await signOutOnThisPhone();
    router.replace('/welcome');
    Alert.alert(
      'Your account is deleted',
      'Your shop is closed and you’re signed out. Your data is removed after 30 days.',
    );
  }

  return (
    <SettingsLayout
      title="Delete account"
      subtitle="This can’t be undone"
      loaded
      back={() => goBack('/settings')}
    >
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Card padded>
        <Text style={styles.title}>What happens</Text>
        {WHAT_HAPPENS.map((line) => (
          <View key={line} style={styles.line}>
            <Feather name="alert-circle" size={18} color={colors.danger} style={styles.icon} />
            <Text style={styles.lineText}>{line}</Text>
          </View>
        ))}
        <Text style={styles.hint}>
          Want a break instead? Pause your shop in Settings: buyers can look but not order.
        </Text>
      </Card>
      <Card padded>
        <Field
          label="Type DELETE to confirm"
          value={typed}
          onChangeText={setTyped}
          placeholder="DELETE"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
        />
      </Card>
      <Button
        title="Delete my account"
        variant="danger"
        onPress={remove}
        loading={busy}
        disabled={!ready}
      />
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  line: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  icon: { marginTop: 2 },
  lineText: { ...text('body'), color: colors.text, flex: 1 },
  hint: { ...text('small'), color: colors.textSecondary, marginTop: spacing.xs },
});
