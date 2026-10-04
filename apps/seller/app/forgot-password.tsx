// NEW (no design image): ask for a reset link, in the style of 05. The reply is the same
// whether or not the email has an account (decision #43); the link opens the web page 07.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { emailSchema } from '@oda/shared';
import { authCall, authClient } from '@/auth/client';
import { friendlyAuthError } from '@/auth/errors';
import {
  AuthScreen,
  Button,
  ErrorMessage,
  Field,
  InfoNote,
  Subtitle,
  Title,
  Wordmark,
} from '@/ui/auth';
import { colors, spacing, text } from '@/theme';

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailCheck = emailSchema.safeParse(email);
  const emailError = submitted && !emailCheck.success ? emailCheck.error.issues[0]?.message : null;

  async function submit() {
    // Close the keyboard so the answer (or an error) is never hidden behind it (Step 49).
    Keyboard.dismiss();
    setSubmitted(true);
    setError(null);
    if (!emailCheck.success) return;
    setBusy(true);
    const { error: authError } = await authCall(() =>
      authClient.requestPasswordReset({ email: emailCheck.data }),
    );
    setBusy(false);
    if (authError) {
      setError(friendlyAuthError(authError).message);
      return;
    }
    setSentTo(emailCheck.data);
  }

  if (sentTo) {
    return (
      <AuthScreen
        footer={
          <Button
            title="Back to sign in"
            onPress={() => router.replace({ pathname: '/sign-in', params: { email: sentTo } })}
          />
        }
        note={<InfoNote icon="info">Nothing yet? Check your spam folder.</InfoNote>}
      >
        <Wordmark />
        <Title>Check your email</Title>
        <Subtitle>
          If <Text style={styles.strong}>{sentTo}</Text> has an oda shop, we&apos;ve sent it a link
          to choose a new password. The link works for 1 hour.
        </Subtitle>
        <Text style={styles.hint}>
          Open the email on this phone, choose a new password, then come back and sign in.
        </Text>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen footer={<Button title="Send reset link" onPress={submit} loading={busy} />}>
      <Wordmark />
      <Title>Forgot your password?</Title>
      <Subtitle>
        Enter the email you use for oda. We&apos;ll send you a link to choose a new one.
      </Subtitle>
      <View style={styles.form}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={submit}
          error={emailError}
        />
      </View>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: spacing.md },
  strong: { ...text('bodyStrong'), color: colors.text },
  hint: { ...text('body'), color: colors.textSecondary, marginTop: spacing.lg },
});
