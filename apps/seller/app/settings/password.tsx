// Change your password (design 21-change-password, decision #74 i): current + new + confirm,
// the password rules ticking as you type, and "Log out other phones" (on by default). The
// server emails "Your oda password was changed" either way. A Google-only seller (no password
// yet, decision #107) gets "Set a password" instead: a link by email, as Forgot password sends.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { friendlyAuthError } from '@/auth/errors';
import { changePassword, sendPasswordLink } from '@/settings/api';
import { passwordFormProblem } from '@/settings/form';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { Button, FormMessage, Link, PasswordField, PasswordRules } from '@/ui/auth';
import { Card, ToggleRow } from '@/ui/rows';
import { spacing, text, colors } from '@/theme';

type FieldKey = 'current' | 'next' | 'confirm';

export default function PasswordScreen() {
  const params = useLocalSearchParams<{ mode?: string; email?: string }>();
  if (params.mode === 'set' && params.email) return <SetPassword email={params.email} />;
  return <ChangePassword />;
}

/** Google-only sellers: Better Auth's reset link creates the password (decision #107). */
function SetPassword({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const { error: failed } = await sendPasswordLink(email);
    setBusy(false);
    if (failed) setError(friendlyAuthError(failed).message);
    else setSent(true);
  }

  return (
    <SettingsLayout
      title="Set a password"
      subtitle="To also sign in with your email"
      loaded
      back={() => goBack('/settings')}
    >
      {sent ? (
        <>
          <FormMessage tone="info">
            We&apos;ve sent a link to {email}. Open it on this phone and choose a password (the link
            works for 1 hour). Then sign in again, with Google or your new password.
          </FormMessage>
          <Button title="Done" onPress={() => goBack('/settings')} />
        </>
      ) : (
        <>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Card padded>
            <Text style={styles.body}>
              You sign in with Google. To also sign in with a password, we&apos;ll email you a link
              to set one.
            </Text>
          </Card>
          <Button title="Send link" onPress={send} loading={busy} />
        </>
      )}
    </SettingsLayout>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: FieldKey; message: string } | null>(null);
  const [done, setDone] = useState(false);

  const errorFor = (field: FieldKey) => (fieldError?.field === field ? fieldError.message : null);

  async function save() {
    setError(null);
    const problem = passwordFormProblem({ current, next, confirm });
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    const { data, error: failed } = await changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: others,
    });
    setBusy(false);
    if (!data) {
      const friendly = friendlyAuthError(failed);
      if (failed?.code === 'INVALID_PASSWORD') {
        setFieldError({ field: 'current', message: friendly.message });
      } else setError(friendly.message);
      return;
    }
    setDone(true);
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  return (
    <SettingsLayout
      title="Change your password"
      subtitle="For signing in with your email"
      loaded
      back={() => goBack('/settings')}
    >
      {done ? (
        <>
          <FormMessage tone="info">
            Password changed.{others ? ' Your other phones are signed out.' : ''} We emailed you to
            confirm.
          </FormMessage>
          <Button title="Done" onPress={() => goBack('/settings')} />
        </>
      ) : (
        <>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Card padded>
            <PasswordField
              label="Current password"
              value={current}
              onChangeText={setCurrent}
              autoComplete="current-password"
              error={errorFor('current')}
            />
            <Text style={styles.forgot}>
              <Link onPress={() => router.push('/forgot-password')}>Forgot it? Reset by email</Link>
            </Text>
            <PasswordField
              label="New password"
              value={next}
              onChangeText={setNext}
              autoComplete="new-password"
              error={errorFor('next')}
            >
              <PasswordRules password={next} />
              <View style={styles.rule}>
                <Text style={[styles.ruleText, next && next !== current && styles.ok]}>
                  {next && next !== current ? '✓ ' : '○ '}Not the same as your old password
                </Text>
              </View>
            </PasswordField>
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Type it again"
              autoComplete="new-password"
              error={errorFor('confirm')}
            />
          </Card>
          <Card>
            <ToggleRow
              first
              title="Log out other phones"
              line="Recommended if someone else knew your password"
              value={others}
              onToggle={setOthers}
            />
          </Card>
          <Button title="Update password" onPress={save} loading={busy} />
        </>
      )}
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  forgot: { ...text('bodyStrong'), marginBottom: spacing.sm },
  body: { ...text('body'), color: colors.text },
  rule: { marginTop: spacing.xs },
  ruleText: { ...text('body'), color: colors.textSecondary },
  ok: { color: colors.green },
});
