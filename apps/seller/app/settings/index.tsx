// Settings (design 20b-settings): your details, change password, pause the shop, share
// feedback, terms and privacy, log out. Theme is hidden (light only, design-changes); Rate the
// app (M8b CP3) opens its sheet (21-rate-app). Delete account opens its own confirm screen.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
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

interface SettingsData {
  details: Details;
  paused: boolean;
}

const cache = memoryCache<SettingsData>();

async function loadSettings() {
  const [details, pause] = await Promise.all([settingsApi.details(), settingsApi.paused()]);
  if (details.data && pause.data) {
    return { data: { details: details.data, paused: pause.data.paused }, error: null };
  }
  return { data: null, error: details.error ?? pause.error };
}

export default function SettingsScreen() {
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
    Alert.alert(
      'Pause your shop?',
      "Buyers can still see your shop and products, but they can't order until you turn this off.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pause shop', onPress: () => setPaused(true) },
      ],
    );
  }

  function logOut() {
    Alert.alert('Log out?', "You'll need your email and password to sign in again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOutOnThisPhone();
          router.replace('/welcome');
        },
      },
    ]);
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
              <Row
                icon="lock"
                title="Change your password"
                onPress={() => router.push('/settings/password')}
              />
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
    </SettingsLayout>
  );
}
