// Onboarding step 3, "Name your shop" (design 11): the shop name with a live link check
// ("… is yours", Edit), the WhatsApp number buyers chat with, and an optional logo (tap
// the avatar in the preview). Saving creates the shop (decision #51); the logo is uploaded
// after that, since uploads belong to a shop.
import Feather from '@expo/vector-icons/Feather';
import { displayUrl, formatKePhone, normalizeKePhone, SLUG_MAX } from '@oda/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SHOP_BASE_URL } from '@/config';
import { onboardingApi, type OnboardingState, type SlugCheck } from '@/onboarding/api';
import { businessTypeLabel, errorMessage } from '@/onboarding/labels';
import { nativePhotoDeps, pickPhotos } from '@/onboarding/nativePhotos';
import { uploadLogo, type Picked } from '@/onboarding/photos';
import { ONBOARDING_ROUTES } from '@/onboarding/steps';
import { useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { Button, Field, FormMessage, Link } from '@/ui/auth';
import { onboardingStyles, OnboardingScreen, StepStatus, StepTitle } from '@/ui/onboarding';
import { colors, radii, spacing, text } from '@/theme';

type Check =
  | { status: 'idle' }
  | { status: 'checking'; slug: string }
  | { status: 'done'; result: SlugCheck }
  | { status: 'failed'; message: string };

/** The phone as typed after +254 (e.g. "712 345 678"). */
function localPart(e164: string | undefined): string {
  return e164 ? formatKePhone(e164).replace(/^0/, '') : '';
}

export default function NameShop() {
  const { state, error, retry } = useOnboarding();
  if (!state) return <StepStatus step={3} error={error} onRetry={retry} />;
  return <Step state={state} />;
}

function Step({ state }: { state: OnboardingState }) {
  const shop = state.shop;
  const { busy, error, fields, submit, setError } = useSubmit();
  const [name, setName] = useState(shop?.name ?? '');
  const [slug, setSlug] = useState(shop?.slug ?? '');
  // Going back to this step: the link was chosen already, so the name no longer drives it.
  const [slugEdited, setSlugEdited] = useState(!!shop);
  const [editingSlug, setEditingSlug] = useState(false);
  const [phone, setPhone] = useState(localPart(shop?.whatsappPhone));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ query: string; check: Check } | null>(null);
  const [logo, setLogo] = useState<{ picked: Picked; preview: string } | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Live link check: from the name until the seller edits the link, then from the link.
  const kind = slugEdited ? 'slug' : 'name';
  const value = slugEdited ? slug.trim().toLowerCase() : name.trim();
  const query = `${kind}:${value}`;
  const ownSlug = kind === 'slug' && value === shop?.slug;
  const check: Check = !value
    ? { status: 'idle' }
    : ownSlug
      ? { status: 'done', result: { slug: value, available: true, message: null, suggestions: [] } }
      : answer?.query === query
        ? answer.check
        : { status: 'checking', slug: kind === 'slug' ? value : '' };

  useEffect(() => {
    if (!value || ownSlug) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error: failed } = await onboardingApi.checkSlug(
        kind === 'slug' ? { slug: value } : { name: value },
      );
      if (cancelled) return;
      if (data) {
        setAnswer({ query, check: { status: 'done', result: data } });
        if (kind === 'name') setSlug(data.slug);
      } else setAnswer({ query, check: { status: 'failed', message: errorMessage(failed) } });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, value, query, ownSlug]);

  const result = check.status === 'done' ? check.result : null;
  const linkOk = !!result?.available && (!slugEdited || result.slug === slug.trim().toLowerCase());
  const logoUri = logo?.preview ?? (logoRemoved ? null : (shop?.logoUrl ?? null));
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  async function pickLogo() {
    const { photos, error: pickError } = await pickPhotos('library', 1);
    if (pickError) setError(pickError);
    const picked = photos[0];
    if (picked) {
      setLogo({ picked, preview: picked.uri });
      setLogoRemoved(false);
    }
  }

  async function next() {
    const whatsappPhone = normalizeKePhone(phone);
    if (!name.trim()) {
      setError('Enter your shop name.');
      return;
    }
    if (!whatsappPhone) {
      setPhoneError('Enter your WhatsApp number, e.g. 712 345 678.');
      return;
    }
    setPhoneError(null);
    if (!linkOk || !result) {
      setError(result?.message ?? 'Pick a shop link that is free.');
      return;
    }
    const saved = await submit(() =>
      onboardingApi.shop({ name: name.trim(), slug: result.slug, whatsappPhone }),
    );
    if (!saved) return;

    if (logo || (logoRemoved && saved.shop?.logoPath)) {
      setUploading(true);
      let logoPath: string | null = null;
      if (logo) {
        const uploaded = await uploadLogo(logo.picked, nativePhotoDeps);
        if (!uploaded.key) {
          setUploading(false);
          setError(
            `Your shop is saved, but the logo didn't upload. ${uploaded.error ?? ''} You can also remove it and add it later.`.trim(),
          );
          return;
        }
        logoPath = uploaded.key;
      }
      const withLogo = await submit(() => onboardingApi.logo(logoPath));
      setUploading(false);
      if (!withLogo) return;
      setLogo(null);
      setLogoRemoved(false);
    }
    router.push(ONBOARDING_ROUTES[4]);
  }

  return (
    <OnboardingScreen
      step={3}
      footer={<Button title="Next" loading={busy || uploading} onPress={next} />}
    >
      <StepTitle>Name your shop</StepTitle>

      <View style={styles.previewWrap} accessibilityLabel="What buyers see">
        <View style={styles.previewHeading}>
          <View style={styles.liveDot} />
          <Text style={styles.overline}>WHAT BUYERS SEE</Text>
        </View>
        <View style={styles.preview}>
          <View style={styles.urlBar}>
            <Feather name="lock" size={12} color={colors.textSecondary} />
            <Text style={styles.url} numberOfLines={1}>
              {displayUrl(SHOP_BASE_URL, '')}
              <Text style={styles.urlSlug}>{result?.slug || slug || 'your-shop'}</Text>
            </Text>
          </View>
          <View style={styles.shopRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={logoUri ? 'Change your logo' : 'Add your logo'}
              onPress={pickLogo}
              style={styles.avatar}
            >
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
              <View style={styles.cameraBadge}>
                <Feather name="camera" size={11} color={colors.textOnNavy} />
              </View>
            </Pressable>
            <View style={styles.shopText}>
              <Text style={styles.shopName} numberOfLines={1}>
                {name.trim() || 'Your shop'}
              </Text>
              <Text style={styles.shopType} numberOfLines={1}>
                {businessTypeLabel(shop?.businessType ?? state.draft.businessType)}
              </Text>
            </View>
            <View style={styles.chat}>
              <Feather name="message-circle" size={14} color={colors.textOnNavy} />
              <Text style={styles.chatText}>Chat</Text>
            </View>
          </View>
          <View style={styles.tiles}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.tile} />
            ))}
          </View>
        </View>
      </View>

      <View style={[onboardingStyles.card, styles.form]}>
        <Field
          label="Shop name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Amani Styles"
          autoCapitalize="words"
          maxLength={60}
          error={fields.name}
          returnKeyType="next"
        />
        <LinkStatus
          check={check}
          slug={slug}
          editing={editingSlug}
          onEdit={() => {
            setEditingSlug(true);
            setSlugEdited(true);
          }}
          onPick={(s) => {
            setSlug(s);
            setSlugEdited(true);
          }}
        />
        {editingSlug ? (
          <Field
            label="Shop link"
            value={slug}
            onChangeText={(v) => setSlug(v.toLowerCase().replace(/\s+/g, '-'))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={SLUG_MAX}
            error={fields.slug}
            left={<Text style={styles.prefixText}>{displayUrl(SHOP_BASE_URL, '')}</Text>}
          />
        ) : null}
        <Field
          label="WhatsApp number"
          labelHint="Buyers chat here"
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            setPhoneError(null);
          }}
          placeholder="712 345 678"
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={16}
          error={phoneError ?? fields.whatsappPhone}
          left={
            <>
              <View style={styles.flag} accessibilityElementsHidden>
                <View style={[styles.flagBand, { backgroundColor: colors.text }]} />
                <View style={[styles.flagBand, { backgroundColor: colors.danger }]} />
                <View style={[styles.flagBand, { backgroundColor: colors.green }]} />
              </View>
              <Text style={styles.prefixStrong}>+254</Text>
            </>
          }
        />
        <Text style={styles.help}>
          {logoUri ? (
            <>
              Tap the logo to change it, or{' '}
              <Link
                onPress={() => {
                  setLogo(null);
                  setLogoRemoved(true);
                }}
              >
                remove it
              </Link>
              .
            </>
          ) : (
            'Tap the logo in the preview to add one. You can do it later.'
          )}
        </Text>
      </View>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </OnboardingScreen>
  );
}

function LinkStatus({
  check,
  slug,
  editing,
  onEdit,
  onPick,
}: {
  check: Check;
  slug: string;
  editing: boolean;
  onEdit: () => void;
  onPick: (slug: string) => void;
}) {
  if (check.status === 'idle') return null;
  if (check.status === 'checking') {
    return <Text style={styles.linkMuted}>Checking your link…</Text>;
  }
  if (check.status === 'failed') {
    return <Text style={styles.linkProblem}>{check.message}</Text>;
  }
  const { result } = check;
  const shown = displayUrl(SHOP_BASE_URL, result.slug || slug);
  if (result.available) {
    return (
      <View style={styles.linkRow} accessibilityLiveRegion="polite">
        <Feather name="check" size={16} color={colors.green} />
        <Text style={styles.linkText}>
          <Text style={styles.linkStrong}>{shown}</Text> is yours
        </Text>
        {editing ? null : (
          <Text accessibilityRole="button" onPress={onEdit} style={styles.edit}>
            Edit
          </Text>
        )}
      </View>
    );
  }
  return (
    <View style={styles.linkTaken} accessibilityLiveRegion="polite">
      <Text style={styles.linkProblem}>{result.message ?? 'That link is taken.'}</Text>
      {result.suggestions.length ? (
        <View style={styles.suggestions}>
          <Text style={styles.linkMuted}>Try:</Text>
          {result.suggestions.slice(0, 3).map((s) => (
            <Text key={s} accessibilityRole="button" onPress={() => onPick(s)} style={styles.edit}>
              {s}
            </Text>
          ))}
        </View>
      ) : null}
      {editing ? null : (
        <Text accessibilityRole="button" onPress={onEdit} style={styles.edit}>
          Edit the link
        </Text>
      )}
    </View>
  );
}

const AVATAR = 64;

const styles = StyleSheet.create({
  previewWrap: {
    backgroundColor: colors.beige,
    borderRadius: radii.xl + 4,
    padding: spacing.md,
    gap: spacing.md,
  },
  previewHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.xs,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.greenBright },
  overline: { ...text('overline'), color: colors.textSecondary },
  preview: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  url: { ...text('small'), color: colors.textSecondary, flexShrink: 1 },
  urlSlug: { fontFamily: text('bodyStrong').fontFamily, color: colors.navy },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radii.md + 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: AVATAR, height: AVATAR, borderRadius: radii.md + 2 },
  avatarInitial: { ...text('title'), fontSize: 24, color: colors.textOnPrimary },
  cameraBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopText: { flex: 1 },
  shopName: { ...text('title'), fontSize: 18, color: colors.navy },
  shopType: { ...text('body'), color: colors.textSecondary },
  chat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.green,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chatText: { ...text('bodyStrong'), color: colors.textOnNavy },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  tile: {
    flex: 1,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    backgroundColor: colors.background,
  },

  form: { marginTop: spacing.lg, paddingTop: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: -spacing.xs },
  linkText: { ...text('body'), color: colors.green, flex: 1 },
  linkStrong: { fontFamily: text('bodyStrong').fontFamily, color: colors.navy },
  linkMuted: { ...text('body'), color: colors.textMuted },
  linkProblem: { ...text('body'), color: colors.danger },
  linkTaken: { gap: spacing.xs, marginTop: -spacing.xs },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
  edit: {
    ...text('bodyStrong'),
    color: colors.navy,
    textDecorationLine: 'underline',
    minHeight: 24,
  },
  prefixText: { ...text('body'), color: colors.textSecondary },
  prefixStrong: { ...text('bodyStrong'), fontSize: 16, color: colors.navy },
  flag: { width: 20, height: 14, borderRadius: 3, overflow: 'hidden' },
  flagBand: { flex: 1 },
  help: { ...text('body'), color: colors.textSecondary },
});
