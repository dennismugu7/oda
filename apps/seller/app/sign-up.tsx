// 02 Sign up. Changes from the image (design-changes.md): no Facebook button and no "or continue
// with"; "Sign up with Google" at the top, then "or" and the email form (decision #107); oda's
// fonts and brand colours; lowercase "oda"; password rules shown; "Sign in" and the Terms small
// print at the very bottom, as on Sign in (decision #112).
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, type TextInput, View } from 'react-native';
import { emailSchema, passwordProblem } from '@oda/shared';
import { startSignup } from '@/auth/signup';
import { friendlyAuthError, type FriendlyError } from '@/auth/errors';
import { googleAvailable } from '@/auth/google';
import { useGoogleSignIn } from '@/auth/useGoogleSignIn';
import { GoogleMark } from '@/ui/brandIcons';
import {
  AuthScreen,
  Button,
  ErrorMessage,
  Field,
  InfoNote,
  Link,
  OrDivider,
  PasswordField,
  PasswordRules,
  SigningInOverlay,
  TermsNote,
  Title,
  Wordmark,
} from '@/ui/auth';
import { colors, spacing, text } from '@/theme';

export default function SignUp() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const passwordRef = useRef<TextInput>(null);
  // Google signs in an existing account or creates one (decision #107), like Sign in's button.
  const google = useGoogleSignIn();
  const withGoogle = googleAvailable();
  const locked = busy || google.busy;

  const emailCheck = emailSchema.safeParse(email);
  const emailError = submitted && !emailCheck.success ? emailCheck.error.issues[0]?.message : null;
  const passwordError = submitted ? passwordProblem(password) : null;

  async function submit() {
    if (locked) return;
    // Close the keyboard so the answer (or an error) is never hidden behind it (Step 49).
    Keyboard.dismiss();
    setSubmitted(true);
    setError(null);
    if (!emailCheck.success || passwordProblem(password)) return;
    setBusy(true);
    // No account yet: the server starts (or resumes) a sign-up attempt and emails its code
    // (decision #49). This phone keeps the attempt until the code is entered.
    const { data, error: apiError } = await startSignup(emailCheck.data, password);
    setBusy(false);
    if (apiError || !data) {
      setError(friendlyAuthError(apiError));
      return;
    }
    router.push({
      pathname: '/verify',
      params: {
        email: data.email,
        resumed: data.resumed ? '1' : '0',
        codeSent: data.codeSent ? '1' : '0',
        retryAfter: String(data.retryAfter),
      },
    });
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
      footer={
        <Button title="Create my account" onPress={submit} loading={busy} disabled={google.busy} />
      }
      note={
        <>
          <InfoNote icon="shield">Your money never passes through oda.</InfoNote>
          <Text style={styles.switch}>
            Already have a shop?{' '}
            <Link disabled={locked} onPress={() => router.replace('/sign-in')}>
              Sign in
            </Link>
          </Text>
          <TermsNote disabled={locked} />
        </>
      }
    >
      <Wordmark />
      <Title>Create your{'\n'}free shop</Title>

      {withGoogle ? (
        <View style={styles.google}>
          <Button
            variant="google"
            title="Sign up with Google"
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
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          editable={!locked}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={passwordError}
        >
          <PasswordRules password={password} />
        </PasswordField>
      </View>

      {error ? (
        <ErrorMessage revealKey={error.message}>
          {error.message}
          {error.action === 'sign-in-instead' ? (
            <>
              {' '}
              <Link
                onPress={() =>
                  router.replace({
                    pathname: '/sign-in',
                    params: { email: emailCheck.data ?? email },
                  })
                }
              >
                Sign in
              </Link>
            </>
          ) : null}
        </ErrorMessage>
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  google: { marginTop: spacing.lg, gap: spacing.sm },
  form: { marginTop: spacing.md },
  formAfterGoogle: { marginTop: spacing.xs },
  switch: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
});
