// Your details (design 20b-your-details, with design-changes: the email note reads "Email
// can't be changed yet" and there is no profile-photo button, initials only).
import { formatKePhone } from '@oda/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/onboarding/labels';
import { DraftBanner } from '@/restore/DraftBanner';
import { useDraft } from '@/restore/useDraft';
import { settingsApi, type Details } from '@/settings/api';
import { displayName, initials, memberSince } from '@/settings/form';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { memoryCache, useLoaded } from '@/settings/useLoaded';
import { Button, Field, FormMessage, InfoNote } from '@/ui/auth';
import { Card } from '@/ui/rows';
import { colors, fonts, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';
import { KenyaFlag } from '@/ui/kenyaFlag';

const cache = memoryCache<Details>();

/** The phone as typed after +254 (e.g. "712 345 678"). */
const localPart = (e164: string | null) => (e164 ? formatKePhone(e164).replace(/^0/, '') : '');

export default function YourDetails() {
  const { data, error, offline, reload, keep } = useLoaded(settingsApi.details, cache);
  return (
    <SettingsLayout
      title="Your details"
      subtitle="Only you see these. Buyers see your shop profile."
      loaded={!!data}
      error={error}
      offline={offline}
      onRetry={reload}
      back={() => goBack('/settings')}
    >
      {data ? <DetailsForm data={data} offline={offline} onSaved={keep} /> : null}
    </SettingsLayout>
  );
}

/** The form, filled once from the first answer (later reloads don't overwrite typing). */
function DetailsForm({
  data,
  offline,
  onSaved,
}: {
  data: Details;
  offline: boolean;
  onSaved: (details: Details) => void;
}) {
  const [first, setFirst] = useState(data.firstName ?? '');
  const [last, setLast] = useState(data.lastName ?? '');
  const [phone, setPhone] = useState(localPart(data.recoveryPhone));
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Unsaved changes survive Android closing the app (decision #100).
  const original = {
    first: data.firstName ?? '',
    last: data.lastName ?? '',
    phone: localPart(data.recoveryPhone),
  };
  const draft = useDraft<typeof original>('settings-details', {
    value: { first, last, phone },
    worthSaving:
      !saved && (first !== original.first || last !== original.last || phone !== original.phone),
    restore: (s) => {
      setFirst(s.first);
      setLast(s.last);
      setPhone(s.phone);
    },
  });

  function discardDraft() {
    draft.discard();
    setFirst(original.first);
    setLast(original.last);
    setPhone(original.phone);
  }

  async function save() {
    setBusy(true);
    setSaveError(null);
    setFields({});
    setSaved(false);
    const { data: next, error: failed } = await settingsApi.saveDetails({
      firstName: first,
      lastName: last,
      recoveryPhone: phone.trim() ? `+254${phone.replace(/\D/g, '').replace(/^0/, '')}` : null,
    });
    setBusy(false);
    if (next) {
      onSaved(next);
      setSaved(true);
      setTimeout(() => goBack('/settings'), 600);
      return;
    }
    setSaveError(errorMessage(failed));
    setFields(failed?.fields ?? {});
  }

  const name = displayName(data.firstName, data.lastName, data.email);
  return (
    <>
      <DraftBanner visible={draft.restored} onDiscard={discardDraft} />
      {saveError ? <FormMessage>{saveError}</FormMessage> : null}
      {saved ? <FormMessage tone="info">Saved.</FormMessage> : null}
      <Card padded>
        <View style={styles.head}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name) || '?'}</Text>
          </View>
          <View style={styles.headText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.owner} numberOfLines={2}>
              Owner of {data.shopName} · {memberSince(data.memberSince)}
            </Text>
          </View>
        </View>
        <View style={styles.names}>
          <View style={styles.half}>
            <Field
              label="First name"
              value={first}
              onChangeText={setFirst}
              maxLength={40}
              autoCapitalize="words"
              error={fields.firstName}
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Last name"
              value={last}
              onChangeText={setLast}
              maxLength={40}
              autoCapitalize="words"
              error={fields.lastName}
            />
          </View>
        </View>
        <Field
          label="Email"
          value={data.email}
          editable={false}
          style={styles.locked}
          right={<Icon name="lock" size={18} color={colors.textMuted} />}
        >
          <Text style={styles.help}>Email can&apos;t be changed yet.</Text>
        </Field>
        <Field
          label="Phone number"
          labelHint="For account recovery"
          left={
            <>
              <KenyaFlag />
              <Text style={styles.prefix}>+254</Text>
            </>
          }
          value={phone}
          onChangeText={setPhone}
          placeholder="712 345 678"
          keyboardType="phone-pad"
          maxLength={13}
          error={fields.recoveryPhone}
        />
      </Card>
      <InfoNote icon="info">
        To change the WhatsApp number buyers use, go to More → Shop profile.
      </InfoNote>
      <Button title="Save changes" onPress={save} loading={busy} disabled={offline} />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('title'), color: colors.primary },
  headText: { flex: 1 },
  name: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  owner: { ...text('body'), color: colors.textSecondary },
  names: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  locked: { color: colors.textSecondary },
  help: { ...text('small'), color: colors.textSecondary, marginTop: spacing.xs },
  prefix: { ...text('bodyStrong'), color: colors.navy },
});
