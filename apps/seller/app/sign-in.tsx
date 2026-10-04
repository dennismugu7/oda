// 05 Sign in. Changes from the image: no Google/Facebook buttons; Poppins and brand colours.
// Also opened by the web page 08's "Open oda app" link (oda://sign-in).
import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, type TextInput, View } from 'react-native';
import { emailSchema } from '@oda/shared';
import { authCall, authClient } from '@/auth/client';
import { friendlyAuthError } from '@/auth/errors';
import {
  AuthScreen,
  Button,
  ErrorMessage,
  Field,
  Link,
  PasswordField,
  Subtitle,
  Title,
  Wordmark,
} from '@/ui/auth';
import { colors, spacing, text } from '@/theme';

export default function SignIn() {
  // ready=1: the account was just created from the code, but the app no longer holds the
  // password (it was restarted), so the seller signs in once.
  const params = useLocalSearchParams<{ email?: string; ready?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const emailCheck = emailSchema.safeParse(email);
  const emailError = submitted && !emailCheck.success ? emailCheck.error.issues[0]?.message : null;
  const passwordError = submitted && !password ? 'Enter your password.' : null;

  async function submit() {
    // Close the keyboard so the answer (or an error) is never hidden behind it (Step 49).
    Keyboard.dismiss();
    setSubmitted(true);
    setError(null);
    if (!emailCheck.success || !password) return;
    setBusy(true);
    const { error: authError } = await authCall(() =>
      authClient.signIn.email({ email: emailCheck.data, password }),
    );
    setBusy(false);
    if (!authError) {
      router.replace('/');
      return;
    }
    setError(friendlyAuthError(authError).message);
  }

  return (
    <AuthScreen
      footer={<Button title="Continue" onPress={submit} loading={busy} />}
      note={
        <Text style={styles.switch}>
          New here? <Link onPress={() => router.replace('/sign-up')}>Open your free shop</Link>
        </Text>
      }
    >
      <Wordmark />
      <Title>Welcome back</Title>
      <Subtitle>
        {params.ready === '1'
          ? 'Your shop account is ready. Sign in with the password you chose.'
          : 'Sign in to your shop.'}
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={emailError}
          right={
            emailCheck.success ? (
              <Feather name="check" size={20} color={colors.green} style={styles.tick} />
            ) : null
          }
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={passwordError}
        />
        <View style={styles.forgot}>
          <Link
            onPress={() =>
              router.push({
                pathname: '/forgot-password',
                params: { email: emailCheck.success ? emailCheck.data : email },
              })
            }
          >
            Forgot password?
          </Link>
        </View>
      </View>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: spacing.md },
  tick: { marginRight: spacing.md },
  forgot: { alignItems: 'flex-end', marginTop: spacing.md },
  switch: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
});
