// Settings (design 20b-settings): your details, change password, pause the shop, share
// feedback, terms and privacy, log out. Theme is hidden (light only, design-changes); Rate the
// app (M8b CP3) opens its sheet (21-rate-app). Delete account opens its own confirm screen.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { fetchMe } from '@/api';
import { meCache } from '@/auth/useMe';
import { SHOP_BASE_URL } from '@/config';
import { errorMessage } from '@/onboarding/labels';
import { settingsApi, type Details } from '@/settings/api';
import { displayName } from '@/settings/form';
import { signOutOnThisPhone } from '@/settings/signOut';
import { RateSheet } from '@/settings/RateSheet';
import { SettingsLayout } from '@/settings/SettingsLayout';
import { memoryCache, useLoaded } from '@/settings/useLoaded';
import { FormMessage } from '@/ui/auth';
import { Card, Row, rowStyles, Section, ToggleRow } from '@/ui/rows';
import { Sheet } from '@/ui/sheet';
import { useConfirm } from '@/ui/confirmSheet';

interface SettingsData {
  details: Details;
  paused: boolean;
  /** False for a Google-only seller (decision #107): "Set a password" instead of "Change". */
  hasPassword: boolean;
}

const cache = memoryCache<SettingsData>();

async function loadSettings() {
  const [details, pause, me] = await Promise.all([
    settingsApi.details(),
    settingsApi.paused(),
    fetchMe(),
  ]);
  if (details.data && pause.data) {
    // Without an answer from /api/me, assume a password (the usual case; the screen still works).
    const hasPassword = me.kind === 'ok' ? me.me.hasPassword !== false : true;
    return {
      data: { details: details.data, paused: pause.data.paused, hasPassword },
      error: null,
    };
  }
  return { data: null, error: details.error ?? pause.error };
}

export default function SettingsScreen() {
  const confirm = useConfirm();
  const { data, error, offline, reload, keep } = useLoaded(loadSettings, cache);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [legal, setLegal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [rating, setRating] = useState(false);

  const setPaused = useCallback(
    async (paused: boolean) => {
      if (!data) return;
      setBusy(true);
      setActionError(null);
      const { data: saved, error: failed } = await settingsApi.setPaused(paused);
      setBusy(false);
      if (saved) keep({ ...data, paused: saved.paused });
      else setActionError(errorMessage(failed));
    },
    [data, keep],
  );

  function togglePause(on: boolean) {
    if (!on) return setPaused(false);
    confirm.ask({
      title: 'Pause your shop?',
      message:
        "Buyers can still see your shop and products, but they can't order until you turn this off.",
      confirmLabel: 'Pause shop',
      onConfirm: () => setPaused(true),
    });
  }

  function logOut() {
    // The full address for every account (owner, decision #109 a); it wraps, never truncated.
    const email = data?.details.email ?? meCache.get()?.email;
    confirm.ask({
      title: 'Log out?',
      message: email
        ? `Are you sure you want to log out of ${email}?`
        : 'Are you sure you want to log out?',
      confirmLabel: 'Log out',
      destructive: true,
      onConfirm: async () => {
        setSigningOut(true);
        await signOutOnThisPhone();
        router.replace('/welcome');
      },
    });
  }

  const open = (path: string) => {
    setLegal(false);
    WebBrowser.openBrowserAsync(`${SHOP_BASE_URL}${path}`).catch(() => {
      setActionError("Couldn't open the page. Try again.");
    });
  };

  const details = data?.details;
  return (
    <SettingsLayout
      title="Settings"
      subtitle={details?.email ?? null}
      loaded={!!data}
      error={error}
      offline={offline}
      onRetry={reload}
      overlay={
        <>
          <RateSheet visible={rating} onClose={() => setRating(false)} />
          <Sheet
            visible={legal}
            title="Terms and privacy"
            onClose={() => setLegal(false)}
            options={[
              {
                key: 'terms',
                label: 'Terms of use',
                icon: 'file-text',
                onPress: () => open('/terms'),
              },
              {
                key: 'privacy',
                label: 'Privacy policy',
                icon: 'lock',
                onPress: () => open('/privacy'),
              },
            ]}
          />
        </>
      }
    >
      {actionError ? <FormMessage>{actionError}</FormMessage> : null}
      {details ? (
        <>
          <Section title="ACCOUNT">
            <Card>
              <Row
                first
                icon="user"
                title="Your details"
                value={displayName(details.firstName, details.lastName, details.email)}
                onPress={() => router.push('/settings/details')}
              />
              {data.hasPassword ? (
                <Row
                  icon="lock"
                  title="Change your password"
                  onPress={() => router.push('/settings/password')}
                />
              ) : (
                <Row
                  icon="lock"
                  title="Set a password"
                  value="You sign in with Google"
                  onPress={() =>
                    router.push({
                      pathname: '/settings/password',
                      params: { mode: 'set', email: details.email },
                    })
                  }
                />
              )}
            </Card>
          </Section>

          <Section title="SHOP">
            <Card>
              <ToggleRow
                first
                icon="pause-circle"
                title="Pause my shop"
                value={data.paused}
                onToggle={togglePause}
                disabled={busy || offline}
              />
            </Card>
            <Text style={rowStyles.note}>
              {data.paused
                ? "Your shop is paused. Buyers can look around but can't order until you turn this off."
                : "Going away? Buyers can still see your shop but can't order until you're back."}
            </Text>
          </Section>

          <Section title="FEEDBACK">
            <Card>
              <Row
                first
                icon="message-square"
                title="Share feedback"
                value="Tell us what to improve"
                onPress={() => router.push('/settings/feedback')}
              />
              <Row
                icon="star"
                title="Rate the app"
                value="Play Store"
                onPress={() => setRating(true)}
              />
            </Card>
          </Section>

          <Section title="LEGAL">
            <Card>
              <Row
                first
                icon="file-text"
                title="Terms and privacy"
                onPress={() => setLegal(true)}
              />
            </Card>
          </Section>

          <Card>
            <Row
              first
              icon="log-out"
              title={signingOut ? 'Logging out…' : 'Log out'}
              onPress={logOut}
              disabled={signingOut}
              right={<></>}
            />
            <Row
              icon="trash-2"
              title="Delete account"
              danger
              onPress={() => router.push('/settings/delete')}
              disabled={offline}
              right={<></>}
            />
          </Card>
        </>
      ) : null}
      {confirm.sheet}
    </SettingsLayout>
  );
}
