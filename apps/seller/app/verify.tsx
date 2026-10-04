// 03 Confirm your email: the 6-digit code (Better Auth email OTP). Changes from the image:
// 6 boxes, a 60 s resend countdown, Poppins and brand colours (design-changes.md).
// Params: email; send=1 asks for a fresh code on open (from sign-in or the start gate).
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OTP_LENGTH } from '@oda/shared';
import { authCall, authClient } from '@/auth/client';
import { cleanCode, formatCountdown, resendAvailableAt, secondsUntil } from '@/auth/countdown';
import { friendlyAuthError } from '@/auth/errors';
import { AuthScreen, Button, ErrorMessage, InfoNote, Subtitle, Title } from '@/ui/auth';
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
  const { email = '', send } = useLocalSearchParams<{ email: string; send?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() => resendAvailableAt(Date.now()));
  const wait = useSecondsUntil(resendAt);
  const input = useRef<TextInput>(null);
  const asked = useRef(false);

  const requestCode = useCallback(
    async (manual: boolean) => {
      setError(null);
      setInfo(null);
      const { error: authError } = await authCall(() =>
        authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }),
      );
      if (authError) {
        const retryAfter = (authError as { retryAfter?: number }).retryAfter;
        if (authError.status === 429 && retryAfter !== undefined) {
          // A code went out moments ago: just show the countdown.
          setResendAt(resendAvailableAt(Date.now(), retryAfter));
          if (manual) setError(friendlyAuthError(authError).message);
          return;
        }
        setError(friendlyAuthError(authError).message);
        return;
      }
      setResendAt(resendAvailableAt(Date.now()));
      setCode('');
      if (manual) setInfo('We sent you a new code.');
    },
    [email],
  );

  useEffect(() => {
    if (send === '1' && !asked.current) {
      asked.current = true;
      void requestCode(false);
    }
  }, [send, requestCode]);

  const verify = useCallback(
    async (value: string) => {
      if (value.length !== OTP_LENGTH || busy) return;
      setBusy(true);
      setError(null);
      setInfo(null);
      const { error: authError } = await authCall(() =>
        authClient.emailOtp.verifyEmail({ email, otp: value }),
      );
      setBusy(false);
      if (authError) {
        setError(friendlyAuthError(authError).message);
        setCode('');
        input.current?.focus();
        return;
      }
      // Signed in by the server (auto sign-in after the code): the start gate takes over.
      router.replace('/');
    },
    [email, busy],
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
          disabled={code.length !== OTP_LENGTH}
        />
      }
      note={<InfoNote icon="info">Nothing yet? Check your spam folder.</InfoNote>}
    >
      <Title>Confirm your email</Title>
      <Subtitle>
        We sent a {OTP_LENGTH}-digit code to{'\n'}
        <Text style={styles.email}>{email}</Text>
      </Subtitle>

      <Pressable
        accessibilityLabel={`Code, ${OTP_LENGTH} digits`}
        onPress={() => input.current?.focus()}
        style={styles.boxes}
      >
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const filled = i < code.length;
          const current = i === code.length;
          return (
            <View key={i} style={[styles.box, (filled || current) && styles.boxActive]}>
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
          accessibilityLabel="Verification code"
        />
      </Pressable>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <Text style={styles.resend}>
        Didn&apos;t receive a code?{' '}
        {wait > 0 ? (
          <Text style={styles.countdown}>Resend in {formatCountdown(wait)}</Text>
        ) : (
          <Text
            accessibilityRole="button"
            style={styles.resendLink}
            onPress={() => void requestCode(true)}
          >
            Resend
          </Text>
        )}
      </Text>
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
  info: { ...text('body'), color: colors.green, marginTop: spacing.md, textAlign: 'center' },
  resend: {
    ...text('body'),
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  resendLink: { ...text('bodyStrong'), color: colors.primary, textDecorationLine: 'underline' },
  countdown: { ...text('bodyStrong'), color: colors.textMuted },
});
