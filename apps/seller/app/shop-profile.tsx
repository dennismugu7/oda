// Shop profile (design 20b-shop-profile): what buyers see at the top of the shop. Logo, name,
// the link (Change link warns first: the old link keeps working and sends buyers to the new
// one), about, location (Kenyan town / Nairobi area picker or free text), and how buyers reach
// you: WhatsApp (the main button), phone calls, TikTok and Instagram. One "Save changes".
import Feather from '@expo/vector-icons/Feather';
import { formatKePhone, normalizeKePhone, searchLocations, SLUG_MAX } from '@oda/shared';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { onboardingApi, type SlugCheck } from '@/onboarding/api';
import { errorMessage } from '@/onboarding/labels';
import { nativePhotoDeps, pickPhotos } from '@/onboarding/nativePhotos';
import { uploadLogo, type Picked } from '@/onboarding/photos';
import { settingsApi, type ShopProfile } from '@/settings/api';
import { handleLabel, profileChanges, type ProfileForm } from '@/settings/form';
import { SettingsLayout } from '@/settings/SettingsLayout';
import { memoryCache, useLoaded } from '@/settings/useLoaded';
import { Button, Field, FormMessage, InfoNote, LinkButton } from '@/ui/auth';
import { Card, Row, rowStyles, ToggleRow } from '@/ui/rows';
import { Sheet } from '@/ui/sheet';
import { colors, radii, spacing, text } from '@/theme';

const cache = memoryCache<ShopProfile>();

type Editing = 'whatsapp' | 'tiktok' | 'instagram' | 'location' | 'link' | null;

const formOf = (p: ShopProfile): ProfileForm => ({
  name: p.name,
  slug: p.slug,
  logoPath: p.logoPath,
  about: p.about,
  locationLabel: p.locationLabel,
  whatsappPhone: p.whatsappPhone,
  callsEnabled: p.callsEnabled,
  tiktokHandle: p.tiktokHandle,
  instagramHandle: p.instagramHandle,
});

/** "+254 712 345 678" */
const phoneLabel = (e164: string) => formatKePhone(e164).replace(/^0/, '+254 ');

export default function ShopProfileScreen() {
  const { data, error, offline, reload, keep } = useLoaded(settingsApi.profile, cache);
  return (
    <SettingsLayout
      title="Shop profile"
      subtitle="What buyers see at the top of your shop"
      loaded={!!data}
      error={error}
      offline={offline}
      onRetry={reload}
    >
      {data ? <ProfileEditor data={data} offline={offline} onSaved={keep} /> : null}
    </SettingsLayout>
  );
}

/** The form, filled once from the first answer (later reloads keep what the seller typed). */
function ProfileEditor({
  data,
  offline,
  onSaved,
}: {
  data: ShopProfile;
  offline: boolean;
  onSaved: (profile: ShopProfile) => void;
}) {
  const [form, setForm] = useState<ProfileForm>(() => formOf(data));
  const [logo, setLogo] = useState<Picked | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<ProfileForm>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  async function pickLogo() {
    const { photos, error: pickError } = await pickPhotos('library', 1);
    if (pickError) setSaveError(pickError);
    if (photos[0]) {
      setLogo(photos[0]);
      setSaved(false);
    }
  }

  function open(what: Exclude<Editing, null>) {
    setDraftError(null);
    setDraft(
      what === 'whatsapp'
        ? formatKePhone(form.whatsappPhone)
        : what === 'tiktok'
          ? (form.tiktokHandle ?? '')
          : what === 'instagram'
            ? (form.instagramHandle ?? '')
            : what === 'link'
              ? form.slug
              : (form.locationLabel ?? ''),
    );
    setEditing(what);
  }

  function applyDraft() {
    const value = draft.trim();
    if (editing === 'whatsapp') {
      const phone = normalizeKePhone(value);
      if (!phone) {
        setDraftError('Enter a Kenyan mobile number, e.g. 0712 345 678.');
        return;
      }
      set({ whatsappPhone: phone });
    } else if (editing === 'tiktok') set({ tiktokHandle: value.replace(/^@/, '') || null });
    else if (editing === 'instagram') set({ instagramHandle: value.replace(/^@/, '') || null });
    else if (editing === 'location') set({ locationLabel: value || null });
    setEditing(null);
  }

  async function save() {
    setBusy(true);
    setSaveError(null);
    setFields({});
    let next = form;
    if (logo) {
      const uploaded = await uploadLogo(logo, nativePhotoDeps);
      if (!uploaded.key) {
        setBusy(false);
        setSaveError(uploaded.error ?? "Couldn't upload your logo. Try again.");
        return;
      }
      next = { ...form, logoPath: uploaded.key };
    }
    const changes = profileChanges(formOf(data), next);
    if (Object.keys(changes).length === 0) {
      setBusy(false);
      setSaved(true);
      return;
    }
    const { data: result, error: failed } = await settingsApi.saveProfile(changes);
    setBusy(false);
    if (result) {
      onSaved(result);
      setForm(formOf(result));
      setLogo(null);
      setSaved(true);
      return;
    }
    setSaveError(errorMessage(failed));
    setFields(failed?.fields ?? {});
  }

  const logoUri = logo?.uri ?? (form.logoPath ? data.logoUrl : null);
  const dirty = !!logo || Object.keys(profileChanges(formOf(data), form)).length > 0;
  const handleSheet = editing === 'tiktok' || editing === 'instagram' || editing === 'whatsapp';

  return (
    <>
      <Sheet
        visible={handleSheet}
        title={
          editing === 'whatsapp' ? 'WhatsApp number' : editing === 'tiktok' ? 'TikTok' : 'Instagram'
        }
        options={[]}
        onClose={() => setEditing(null)}
      >
        <View style={styles.sheetBody}>
          <Field
            label={editing === 'whatsapp' ? 'Number buyers chat with' : 'Your handle'}
            value={draft}
            onChangeText={setDraft}
            placeholder={editing === 'whatsapp' ? '0712 345 678' : 'e.g. amani.styles'}
            keyboardType={editing === 'whatsapp' ? 'phone-pad' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            left={editing === 'whatsapp' ? undefined : <Text style={styles.at}>@</Text>}
            maxLength={editing === 'whatsapp' ? 16 : 31}
            error={draftError}
            autoFocus
          />
          {editing === 'whatsapp' ? (
            <Text style={styles.help}>The Chat and Order buttons on your shop use it.</Text>
          ) : null}
          <Button title="Done" onPress={applyDraft} />
        </View>
      </Sheet>
      <LocationSheet
        visible={editing === 'location'}
        query={draft}
        onQuery={setDraft}
        onPick={(label) => {
          set({ locationLabel: label });
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
      {editing === 'link' ? (
        <LinkSheet
          current={data.slug}
          prefix={data.linkPrefix}
          initial={form.slug}
          onUse={(slug) => {
            set({ slug });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {saveError ? <FormMessage>{saveError}</FormMessage> : null}
      {saved && !dirty ? (
        <FormMessage tone="info">Saved. Your shop shows it now.</FormMessage>
      ) : null}
      <Card padded>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={logoUri ? 'Change your logo' : 'Add your logo'}
            onPress={pickLogo}
            style={styles.logo}
          >
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="cover" />
            ) : (
              <Text style={styles.logoInitial}>
                {form.name.trim().charAt(0).toUpperCase() || 'A'}
              </Text>
            )}
            <View style={styles.camera}>
              <Feather name="camera" size={13} color={colors.textOnNavy} />
            </View>
          </Pressable>
          <View style={styles.flex}>
            <Field
              label="Shop name"
              value={form.name}
              onChangeText={(name) => set({ name })}
              maxLength={40}
              error={fields.name}
            />
          </View>
        </View>
        {form.logoPath && !logo ? (
          <LinkButton textStyle={styles.removeLogo} onPress={() => set({ logoPath: null })}>
            Remove logo
          </LinkButton>
        ) : null}
        <View style={styles.linkRow}>
          <Text style={styles.link} numberOfLines={1}>
            {data.linkPrefix}
            <Text style={styles.linkSlug}>{form.slug}</Text>
          </Text>
          <LinkButton textStyle={styles.change} onPress={() => open('link')}>
            Change link
          </LinkButton>
        </View>
        {form.slug !== data.slug ? (
          <Text style={styles.help}>
            New link saved when you tap Save changes. {data.linkPrefix}
            {data.slug} keeps working.
          </Text>
        ) : null}
        {fields.slug ? <Text style={styles.fieldError}>{fields.slug}</Text> : null}
        <Field
          label="About your shop"
          labelHint="Optional"
          value={form.about ?? ''}
          onChangeText={(about) => set({ about })}
          placeholder="e.g. Ankara and kitenge pieces made in Nairobi. Same-day delivery."
          multiline
          maxLength={300}
          style={styles.about}
          error={fields.about}
        />
        <View>
          <Text style={styles.label}>Location</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Location: ${form.locationLabel ?? 'not set'}`}
            onPress={() => open('location')}
            style={({ pressed }) => [styles.select, pressed && styles.pressed]}
          >
            <Text
              style={[styles.selectText, !form.locationLabel && styles.placeholder]}
              numberOfLines={1}
            >
              {form.locationLabel ?? 'Choose your town or area'}
            </Text>
            <Feather name="chevron-down" size={20} color={colors.navy} />
          </Pressable>
          {fields.locationLabel ? (
            <Text style={styles.fieldError}>{fields.locationLabel}</Text>
          ) : null}
        </View>
      </Card>

      <Card>
        <Text style={[rowStyles.overline, styles.cardTitle]}>HOW BUYERS REACH YOU</Text>
        <Row
          icon="message-circle"
          title="WhatsApp"
          line={phoneLabel(form.whatsappPhone)}
          onPress={() => open('whatsapp')}
          right={
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Main button</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textMuted} />
            </View>
          }
        />
        <ToggleRow
          icon="phone"
          title="Phone calls"
          line="Same number"
          value={form.callsEnabled}
          onToggle={(callsEnabled) => set({ callsEnabled })}
        />
        <Row
          icon="music"
          title="TikTok"
          line={handleLabel(form.tiktokHandle)}
          onPress={() => open('tiktok')}
          right={form.tiktokHandle ? undefined : <Text style={styles.add}>Add</Text>}
        />
        <Row
          icon="instagram"
          title="Instagram"
          line={handleLabel(form.instagramHandle)}
          onPress={() => open('instagram')}
          right={form.instagramHandle ? undefined : <Text style={styles.add}>Add</Text>}
        />
      </Card>
      {fields.whatsappPhone || fields.tiktokHandle || fields.instagramHandle ? (
        <FormMessage>
          {fields.whatsappPhone ?? fields.tiktokHandle ?? fields.instagramHandle}
        </FormMessage>
      ) : null}
      <Button title="Save changes" onPress={save} loading={busy} disabled={offline || !dirty} />
    </>
  );
}

function LocationSheet({
  visible,
  query,
  onQuery,
  onPick,
  onClose,
}: {
  visible: boolean;
  query: string;
  onQuery: (q: string) => void;
  onPick: (label: string | null) => void;
  onClose: () => void;
}) {
  const typed = query.trim();
  const matches = searchLocations(typed, 12);
  return (
    <Sheet
      visible={visible}
      title="Location"
      onClose={onClose}
      header={
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.textSecondary} />
          <TextInput
            accessibilityLabel="Search towns and areas"
            value={query}
            onChangeText={onQuery}
            placeholder="Town or Nairobi area"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            style={styles.searchInput}
          />
        </View>
      }
      options={[
        ...(typed && !matches.some((m) => m.toLowerCase() === typed.toLowerCase())
          ? [
              {
                key: 'typed',
                label: `Use “${typed}”`,
                icon: 'edit-3' as const,
                onPress: () => onPick(typed),
              },
            ]
          : []),
        ...matches.map((label) => ({
          key: label,
          label,
          icon: 'map-pin' as const,
          onPress: () => onPick(label),
        })),
        {
          key: 'none',
          label: 'Don’t show a location',
          icon: 'x' as const,
          onPress: () => onPick(null),
        },
      ]}
    />
  );
}

type Check =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: SlugCheck }
  | { status: 'failed'; message: string };

function LinkSheet({
  current,
  prefix,
  initial,
  onUse,
  onClose,
}: {
  current: string;
  prefix: string;
  initial: string;
  onUse: (slug: string) => void;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState(initial);
  const [answer, setAnswer] = useState<{ slug: string; check: Check } | null>(null);

  // Live check of the typed link (the seller's own current link needs none).
  const value = slug.trim().toLowerCase();
  const needsCheck = !!value && value !== current;
  const check: Check = !needsCheck
    ? { status: 'idle' }
    : answer?.slug === value
      ? answer.check
      : { status: 'checking' };

  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await onboardingApi.checkSlug({ slug: value });
      if (cancelled) return;
      setAnswer({
        slug: value,
        check: data
          ? { status: 'done', result: data }
          : { status: 'failed', message: errorMessage(error) },
      });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsCheck, value]);

  const ok = value === current || (check.status === 'done' && check.result.available);
  return (
    <Sheet visible title="Change your link" options={[]} onClose={onClose}>
      <View style={styles.sheetBody}>
        <InfoNote icon="info">
          Your old link keeps working and sends buyers to the new one. Links you already shared, QR
          codes and posts still open your shop.
        </InfoNote>
        <Field
          label="Shop link"
          left={<Text style={styles.at}>{prefix}</Text>}
          value={slug}
          onChangeText={(v) => setSlug(v.toLowerCase().replace(/\s+/g, '-'))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={SLUG_MAX}
          error={
            check.status === 'done' && !check.result.available
              ? (check.result.message ?? 'That link is taken.')
              : check.status === 'failed'
                ? check.message
                : null
          }
          autoFocus
        />
        {check.status === 'checking' ? <Text style={styles.help}>Checking…</Text> : null}
        {check.status === 'done' && check.result.available ? (
          <Text style={styles.free}>✓ {prefix + value} is free</Text>
        ) : null}
        {check.status === 'done' && check.result.suggestions.length ? (
          <View style={styles.suggestions}>
            {check.result.suggestions.map((s) => (
              <Text
                key={s}
                accessibilityRole="button"
                style={styles.suggestion}
                onPress={() => setSlug(s)}
              >
                {s}
              </Text>
            ))}
          </View>
        ) : null}
        <Button
          title={value === current ? 'Keep this link' : 'Use this link'}
          onPress={() => onUse(value)}
          disabled={!ok}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoImage: { width: 76, height: 76, borderRadius: radii.xl },
  logoInitial: { ...text('headline'), color: colors.textOnPrimary },
  camera: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLogo: { ...text('small'), color: colors.textSecondary, textDecorationLine: 'underline' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { ...text('body'), color: colors.textSecondary, flex: 1 },
  linkSlug: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  change: { ...text('bodyStrong'), color: colors.navy, textDecorationLine: 'underline' },
  about: { minHeight: 72, textAlignVertical: 'top', paddingTop: spacing.sm },
  label: { ...text('bodyStrong'), color: colors.navy, marginBottom: spacing.xs },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
  },
  selectText: { ...text('body'), color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },
  cardTitle: { paddingTop: spacing.md, paddingBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  add: { ...text('bodyStrong'), color: colors.navy, textDecorationLine: 'underline' },
  sheetBody: { gap: spacing.sm, paddingVertical: spacing.sm },
  at: { ...text('bodyStrong'), color: colors.textSecondary },
  help: { ...text('small'), color: colors.textSecondary },
  free: { ...text('small'), color: colors.green },
  fieldError: { ...text('small'), color: colors.danger },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestion: {
    ...text('bodyStrong'),
    color: colors.navy,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { ...text('body'), color: colors.text, flex: 1, minHeight: 48 },
  pressed: { opacity: 0.85 },
});
