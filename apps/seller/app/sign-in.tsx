// 05 Sign in. Changes from the image: no Facebook button; "Continue with Google" at the top, then
// "or" and the email form (decision #107); the Terms as small print at the very bottom (#112);
// oda's fonts and brand colours. Also opened by the web page 08's "Open oda app" link
// (oda://sign-in).
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, type TextInput, View } from 'react-native';
import { emailSchema } from '@oda/shared';
import { capCall } from '@/auth/call';
import { authCall, authClient } from '@/auth/client';
import { friendlyAuthError } from '@/auth/errors';
import { finishSignIn } from '@/auth/finishSignIn';
import { googleAvailable } from '@/auth/google';
import { useGoogleSignIn } from '@/auth/useGoogleSignIn';
import { GoogleMark } from '@/ui/brandIcons';
import {
  AuthScreen,
  Button,
  ErrorMessage,
  Field,
  Link,
  OrDivider,
  PasswordField,
  SigningInOverlay,
  Subtitle,
  TermsNote,
  Title,
  Wordmark,
} from '@/ui/auth';
import { colors, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';

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
  const google = useGoogleSignIn();
  const withGoogle = googleAvailable();
  // While either way of signing in is running, nothing else on the screen reacts.
  const locked = busy || google.busy;

  const emailCheck = emailSchema.safeParse(email);
  const emailError = submitted && !emailCheck.success ? emailCheck.error.issues[0]?.message : null;
  const passwordError = submitted && !password ? 'Enter your password.' : null;

  async function submit() {
    if (locked) return;
    // Close the keyboard so the answer (or an error) is never hidden behind it (Step 49).
    Keyboard.dismiss();
    setSubmitted(true);
    setError(null);
    if (!emailCheck.success || !password) return;
    setBusy(true);
    // At most 15 s for the call and 5 s for finishing (the owner's 20 s rule, #107).
    const { error: authError } = await capCall(
      authCall(() => authClient.signIn.email({ email: emailCheck.data, password })),
    );
    if (authError) {
      setBusy(false);
      setError(friendlyAuthError(authError).message);
      return;
    }
    // The button keeps spinning until the next screen is ready and replaces this one.
    const problem = await finishSignIn();
    if (problem) {
      setBusy(false);
      setError(problem);
    }
  }

  function startGoogle() {
    if (locked) return;
    Keyboard.dismiss();
    setError(null);
    google.start();
  }

  return (
    <AuthScreen
      locked={locked}
      overlay={<SigningInOverlay visible={google.phase === 'signing-in'} />}
      footer={<Button title="Continue" onPress={submit} loading={busy} disabled={google.busy} />}
      note={
        <>
          <Text style={styles.switch}>
            New here?{' '}
            <Link disabled={locked} onPress={() => router.replace('/sign-up')}>
              Open your free shop
            </Link>
          </Text>
          {/* The Google button can create an account, so it brings the Terms (#107, #112). */}
          {withGoogle ? <TermsNote disabled={locked} /> : null}
        </>
      }
    >
      <Wordmark />
      <Title>Welcome back</Title>
      <Subtitle>
        {params.ready === '1'
          ? 'Your shop account is ready. Sign in with the password you chose.'
          : 'Sign in to your shop.'}
      </Subtitle>

      {withGoogle ? (
        <View style={styles.google}>
          <Button
            variant="google"
            title="Continue with Google"
            icon={<GoogleMark />}
            onPress={startGoogle}
            loading={google.busy}
            disabled={busy}
          />
          {google.error ? <ErrorMessage>{google.error}</ErrorMessage> : null}
          <OrDivider />
        </View>
      ) : null}

      <View style={withGoogle ? styles.formAfterGoogle : styles.form}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          editable={!locked}
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
              <Icon name="check" size={20} color={colors.green} style={styles.tick} />
            ) : null
          }
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          editable={!locked}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={passwordError}
        />
        <View style={styles.forgot}>
          <Link
            disabled={locked}
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
  google: { marginTop: spacing.lg, gap: spacing.sm },
  form: { marginTop: spacing.md },
  formAfterGoogle: { marginTop: spacing.xs },
  tick: { marginRight: spacing.md },
  forgot: { alignItems: 'flex-end', marginTop: spacing.md },
  switch: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
});
