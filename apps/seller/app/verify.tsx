// 03 Confirm your email: the 6-digit code for this phone's sign-up attempt (decision #49).
// Changes from the image: 6 boxes, a 60 s resend countdown, oda's fonts and brand colours
// (design-changes.md). The attempt id comes from SecureStore, so a killed app reopens
// here. Params: email; resumed=1 ("Finish signing up"); codeSent=0|1; retryAfter (seconds).
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OTP_LENGTH } from '@oda/shared';
import { authCall, authClient } from '@/auth/client';
import { cleanCode, formatCountdown, resendAvailableAt, secondsUntil } from '@/auth/countdown';
import { friendlyAuthError, type FriendlyError } from '@/auth/errors';
import {
  getPendingSignup,
  passwordFor,
  resendSignupCode,
  verifySignupCode,
  type PendingSignup,
} from '@/auth/signup';
import {
  AuthScreen,
  Button,
  ErrorMessage,
  FormMessage,
  InfoNote,
  Link,
  LinkButton,
  Subtitle,
  Title,
} from '@/ui/auth';
import { colors, radii, sizes, spacing, text } from '@/theme';

function useSecondsUntil(at: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (secondsUntil(at, now) === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at, now]);
  return secondsUntil(at, now);
}

export default function Verify() {
  const params = useLocalSearchParams<{
    email?: string;
    resumed?: string;
    codeSent?: string;
    retryAfter?: string;
  }>();
  const [attempt, setAttempt] = useState<PendingSignup | null | undefined>(undefined);
  const email = attempt?.email ?? params.email ?? '';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() =>
    resendAvailableAt(Date.now(), params.retryAfter ? Number(params.retryAfter) : undefined),
  );
  const wait = useSecondsUntil(resendAt);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    let cancelled = false;
    getPendingSignup().then((pending) => {
      if (cancelled) return;
      setAttempt(pending);
      // Nothing to type into: keep the keyboard off the "expired" message.
      if (!pending) Keyboard.dismiss();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resend = useCallback(async () => {
    if (!attempt) return;
    Keyboard.dismiss();
    setError(null);
    setInfo(null);
    const { data, error: apiError } = await resendSignupCode(attempt.attemptId);
    if (apiError) {
      if (apiError.retryAfter !== undefined) {
        setResendAt(resendAvailableAt(Date.now(), apiError.retryAfter));
      }
      setError(friendlyAuthError(apiError));
      return;
    }
    setResendAt(resendAvailableAt(Date.now(), data?.retryAfter || undefined));
    setCode('');
    setInfo('We sent you a new code.');
  }, [attempt]);

  const verify = useCallback(
    async (value: string) => {
      if (!attempt || value.length !== OTP_LENGTH || busy) return;
      Keyboard.dismiss();
      setBusy(true);
      setError(null);
      setInfo(null);
      const { error: apiError } = await verifySignupCode(attempt.attemptId, value);
      if (apiError) {
        setBusy(false);
        setError(friendlyAuthError(apiError));
        setCode('');
        // The keyboard stays closed so the message is in view; tap the boxes to type again.
        return;
      }
      // The account exists now. Sign in with the password typed on the sign-up screen; if
      // the app was restarted since (it isn't kept on the phone), ask for it.
      const password = passwordFor(attempt.email);
      if (password) {
        const signedIn = await authCall(() =>
          authClient.signIn.email({ email: attempt.email, password }),
        );
        setBusy(false);
        if (!signedIn.error) {
          router.replace('/');
          return;
        }
      }
      setBusy(false);
      router.replace({ pathname: '/sign-in', params: { email: attempt.email, ready: '1' } });
    },
    [attempt, busy],
  );

  function onChange(value: string) {
    const next = cleanCode(value, OTP_LENGTH);
    setCode(next);
    if (next.length === OTP_LENGTH) void verify(next);
  }

  return (
    <AuthScreen
      footer={
        <Button
          title="Verify"
          onPress={() => void verify(code)}
          loading={busy}
          disabled={code.length !== OTP_LENGTH || !attempt}
        />
      }
      note={<InfoNote icon="info">Nothing yet? Check your spam folder.</InfoNote>}
    >
      <Title>{params.resumed === '1' ? 'Finish signing up' : 'Confirm your email'}</Title>
      <Subtitle>
        {params.resumed === '1' && params.codeSent === '1'
          ? 'We sent a new code to'
          : `We sent a ${OTP_LENGTH}-digit code to`}
        {'\n'}
        <Text style={styles.email}>{email}</Text>
      </Subtitle>

      {/* Not a screen-reader stop itself: TalkBack goes straight to the input inside. */}
      <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.boxes}>
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const filled = i < code.length;
          const current = i === code.length;
          return (
            <View
              key={i}
              style={[styles.box, (filled || current) && styles.boxActive]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
              {current && !busy ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
        {/* One real input under the boxes: typing, pasting and autofill all work. */}
        <TextInput
          ref={input}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={OTP_LENGTH + 10}
          autoFocus
          caretHidden
          style={styles.hiddenInput}
          accessibilityLabel={`Verification code, ${OTP_LENGTH} digits`}
        />
      </Pressable>

      {attempt === null && !error ? (
        <ErrorMessage revealKey="expired">
          This sign-up has expired.{' '}
          <Link onPress={() => router.replace('/sign-up')}>Start again</Link>
        </ErrorMessage>
      ) : null}
      {error ? (
        <ErrorMessage revealKey={error.message}>
          {error.message}
          {error.action === 'start-again' ? (
            <>
              {' '}
              <Link onPress={() => router.replace('/sign-up')}>Start again</Link>
            </>
          ) : null}
          {error.action === 'sign-in-instead' ? (
            <>
              {' '}
              <Link onPress={() => router.replace({ pathname: '/sign-in', params: { email } })}>
                Sign in
              </Link>
            </>
          ) : null}
        </ErrorMessage>
      ) : null}
      {info ? <FormMessage tone="info">{info}</FormMessage> : null}

      <View style={styles.resendRow}>
        <Text style={styles.resend}>Didn&apos;t receive a code?</Text>
        {wait > 0 ? (
          <Text style={styles.countdown}>Resend in {formatCountdown(wait)}</Text>
        ) : (
          <LinkButton textStyle={styles.resendLink} onPress={() => void resend()}>
            Resend
          </LinkButton>
        )}
      </View>
    </AuthScreen>
  );
}

const BOX_GAP = spacing.sm;

const styles = StyleSheet.create({
  email: { ...text('bodyStrong'), color: colors.text },
  boxes: { flexDirection: 'row', gap: BOX_GAP, marginTop: spacing.xl },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 64,
    borderRadius: radii.md,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderWidth: sizes.borderWidthStrong, borderColor: colors.borderStrong },
  digit: { ...text('headline'), color: colors.navy },
  caret: {
    position: 'absolute',
    width: 2,
    height: 26,
    backgroundColor: colors.primary,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    color: 'transparent',
  },
  resendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: spacing.xs,
    minHeight: 44, // the same height while the countdown runs and once Resend shows
    marginTop: spacing.xl,
  },
  resend: { ...text('body'), color: colors.textSecondary },
  resendLink: { ...text('bodyStrong'), color: colors.primary, textDecorationLine: 'underline' },
  countdown: { ...text('bodyStrong'), color: colors.textMuted },
});
