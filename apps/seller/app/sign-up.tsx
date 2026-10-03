// 02 Sign up. Changes from the image (design-changes.md): no Google/Facebook buttons and no
// "or continue with"; Poppins and brand colours; lowercase "oda"; password rules shown.
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';
import { emailSchema, passwordProblem } from '@oda/shared';
import { authClient } from '@/auth/client';
import { friendlyAuthError, type FriendlyError } from '@/auth/errors';
import { API_URL } from '@/config';
import {
  AuthScreen,
  Button,
  ErrorMessage,
  Field,
  InfoNote,
  Link,
  PasswordField,
  PasswordRules,
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

  const emailCheck = emailSchema.safeParse(email);
  const emailError = submitted && !emailCheck.success ? emailCheck.error.issues[0]?.message : null;
  const passwordError = submitted ? passwordProblem(password) : null;

  async function submit() {
    setSubmitted(true);
    setError(null);
    if (!emailCheck.success || passwordProblem(password)) return;
    setBusy(true);
    const { error: authError } = await authClient.signUp.email({
      email: emailCheck.data,
      password,
      name: '',
    });
    setBusy(false);
    if (authError) {
      setError(friendlyAuthError(authError));
      return;
    }
    router.push({ pathname: '/verify', params: { email: emailCheck.data } });
  }

  return (
    <AuthScreen
      footer={
        <>
          <InfoNote icon="shield">Your money never passes through oda.</InfoNote>
          <Button title="Create my account" onPress={submit} loading={busy} />
          <Text style={styles.terms}>
            By continuing you agree to oda&apos;s{' '}
            <Link onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/terms`)}>Terms</Link> and{' '}
            <Link onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}>
              Privacy notice
            </Link>
            .
          </Text>
        </>
      }
    >
      <Wordmark />
      <Title>Create your{'\n'}free shop</Title>

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
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={passwordError}
        />
        <PasswordRules password={password} />
      </View>

      {error ? (
        <ErrorMessage>
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

      <Text style={styles.switch}>
        Already have a shop? <Link onPress={() => router.replace('/sign-in')}>Sign in</Link>
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: spacing.md },
  switch: { ...text('body'), color: colors.textSecondary, marginTop: spacing.xl },
  terms: { ...text('small'), color: colors.textSecondary, textAlign: 'center' },
});
