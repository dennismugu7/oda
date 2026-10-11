// Onboarding step 6, "Your shop is live" (design 14, with docs/design-changes.md and the
// owner's review stop B changes, Step 58): the link with Copy, share buttons in the order
// of the seller's channels that open their app directly (src/onboarding/shareActions.ts),
// the "Finish setting up" checklist near the top, a ready-made post the seller can edit
// (EN/SW, "Try another"; the shop link is always included, tagged ?s=… per button), and
// "Go to my shop". "See what buyers see" opens the real shop in the in-app browser (M4,
// decision #60).
import {
  caption,
  captionCount,
  displayUrl,
  formatKsh,
  postForShare,
  SHARE_LABELS,
  shareButtons,
  type CaptionLanguage,
  type ShareTarget,
} from '@oda/shared';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardingApi, type OnboardingState } from '@/onboarding/api';
import type { IconName } from '@/onboarding/labels';
import { openBuyerView } from '@/catalogue/preview';
import { shareTo, type ShareDeps } from '@/onboarding/shareActions';
import { setOnboardingState, useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { Button, FormMessage } from '@/ui/auth';
import { BrandIcon, StatusRing, type Brand } from '@/ui/brandIcons';
import { StepStatus } from '@/ui/onboarding';
import { colors, fonts, radii, spacing, text } from '@/theme';
import { Icon } from '@/ui/icon';

// Official brand marks for WhatsApp, Instagram and Facebook; TikTok needs written
// permission, so a neutral icon with its name (decision #55).
const BRANDS: Partial<Record<ShareTarget, Brand>> = {
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  facebook: 'facebook',
};
const NEUTRAL_ICONS: Partial<Record<ShareTarget, IconName>> = {
  tiktok: 'music-note',
  more: 'dots-horizontal',
};

const phoneShare: ShareDeps = {
  openUrl: (url) =>
    Linking.openURL(url).then(
      () => true,
      () => false,
    ),
  shareSheet: (message) =>
    Share.share({ message }).then(
      (result) => result.action === Share.sharedAction,
      () => false,
    ),
  copy: async (value) => {
    await Clipboard.setStringAsync(value);
  },
};

export default function ShopLive() {
  const { state, error, retry } = useOnboarding();
  if (!state?.shop || !state.checklist)
    return <StepStatus step={6} error={error} onRetry={retry} />;
  return <Step state={state} />;
}

function Step({ state }: { state: OnboardingState }) {
  const shop = state.shop!;
  const checklist = state.checklist!;
  const product = state.product;
  const { busy, error, submit, setError } = useSubmit();
  const insets = useSafeAreaInsets();
  const [language, setLanguage] = useState<CaptionLanguage>('en');
  const [index, setIndex] = useState(0);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Back from the Delivery screen: refresh the checklist (best effort).
  useFocusEffect(
    useCallback(() => {
      onboardingApi.get().then(({ data }) => {
        if (data) setOnboardingState(data);
      });
    }, []),
  );

  const base = shop.url.slice(0, shop.url.length - shop.slug.length - 1);
  const cover = product?.photos[0];
  const template = caption(language, index, {
    shop: shop.name,
    product: product?.name ?? 'new stock',
    price: product?.price ?? 0,
    link: shop.url,
  });
  const postText = edited ?? template;
  const linkMissing = postForShare(postText, base, shop.slug, 'more').linkAdded;

  async function tick(item: 'shared_link' | 'tested_whatsapp') {
    if (checklist.items.find((i) => i.id === item)?.done) return;
    // Best effort: a failed tick only leaves the item unticked.
    await submit(() => onboardingApi.tick(item));
  }

  async function share(target: ShareTarget) {
    setError(null);
    const { message } = postForShare(postText, base, shop.slug, target);
    const outcome = await shareTo(target, message, phoneShare);
    setNotice(outcome.notice);
    if (outcome.shared) await tick('shared_link');
  }

  async function copy() {
    await Clipboard.setStringAsync(shop.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function testWhatsApp() {
    const opened = await phoneShare.openUrl(
      `https://wa.me/${shop.whatsappPhone.replace(/^\+/, '')}`,
    );
    if (opened) await tick('tested_whatsapp');
    else setError("Couldn't open WhatsApp on this phone.");
  }

  /** EN/SW and "Try another" replace the text; ask first when the seller edited it. */
  function changeTemplate(apply: () => void) {
    if (edited === null || edited === template) {
      setEdited(null);
      apply();
      return;
    }
    Alert.alert('Replace your text?', 'Your changes to the post will be lost.', [
      { text: 'Keep my text', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: () => {
          setEdited(null);
          apply();
        },
      },
    ]);
  }

  async function done() {
    const finished = await submit(() => onboardingApi.complete());
    if (finished) router.replace('/home');
  }

  const buttons = shareButtons(shop.channels);
  const shown = displayUrl(base, shop.slug);
  const slash = shown.lastIndexOf('/');
  // The WhatsApp test first: it is the one buyers depend on.
  const items = [...checklist.items].sort(
    (a, b) => Number(b.id === 'tested_whatsapp') - Number(a.id === 'tested_whatsapp'),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroSide} />
            <Text accessibilityRole="header" accessibilityLabel="oda" style={styles.logo}>
              oda<Text style={styles.logoDot}>.</Text>
            </Text>
            <View style={[styles.heroSide, styles.heroRight]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done, go to my shop"
                hitSlop={12}
                onPress={done}
                disabled={busy}
                style={styles.doneButton}
              >
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.liveRow}>
            <View style={styles.liveCheck}>
              <Icon name="check" size={26} color={colors.textOnNavy} />
            </View>
            <Text accessibilityRole="header" style={styles.liveTitle}>
              Your shop is live
            </Text>
          </View>
          <Text style={styles.liveSub}>Share your link and buyers can order today.</Text>
          <View style={styles.linkPill}>
            <Text style={styles.linkText} numberOfLines={1}>
              {shown.slice(0, slash + 1)}
              <Text style={styles.linkSlug}>{shown.slice(slash + 1)}</Text>
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copied ? 'Link copied' : 'Copy link'}
              onPress={copy}
              style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
            >
              <Icon name={copied ? 'check' : 'copy'} size={16} color={colors.navy} />
              <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => openBuyerView(shop.url)}
            hitSlop={8}
            style={styles.seeBuyers}
          >
            <Text style={styles.seeBuyersText}>See what buyers see</Text>
            <Icon name="arrow-right" size={18} color={colors.textOnNavy} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.shareRow}>
            {buttons.map((target, i) => (
              <Pressable
                key={target}
                accessibilityRole="button"
                accessibilityLabel={`Share on ${SHARE_LABELS[target]}`}
                onPress={() => share(target)}
                style={styles.shareItem}
              >
                {({ pressed }) => (
                  <>
                    <View style={[styles.shareCircle, pressed && styles.pressed]}>
                      {target === 'whatsapp_status' ? (
                        <StatusRing />
                      ) : BRANDS[target] ? (
                        <BrandIcon brand={BRANDS[target]!} size={28} />
                      ) : (
                        <Icon
                          name={NEUTRAL_ICONS[target] ?? 'dots-horizontal'}
                          size={26}
                          color={colors.navy}
                        />
                      )}
                    </View>
                    <Text
                      style={[styles.shareLabel, i === 0 && styles.shareLabelMain]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      maxFontSizeMultiplier={1.4}
                    >
                      {SHARE_LABELS[target]}
                    </Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
          {notice ? (
            <FormMessage tone="info" revealKey={notice}>
              {notice}
            </FormMessage>
          ) : null}

          <View style={styles.card}>
            <View style={styles.finishHead}>
              <Text accessibilityRole="header" style={styles.finishTitle}>
                Finish setting up
              </Text>
              <View style={styles.countPill}>
                <Text style={styles.countText}>
                  {checklist.done} of {checklist.total}
                </Text>
              </View>
            </View>
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityLabel={`${checklist.done} of ${checklist.total} done`}
            >
              <View
                style={[
                  styles.trackFill,
                  { width: `${(checklist.done / checklist.total) * 100}%` },
                ]}
              />
            </View>
            {items.map((item, i) => {
              const test = item.id === 'tested_whatsapp' && !item.done;
              return (
                <View
                  key={item.id}
                  style={[styles.item, i > 0 && styles.itemDivider, test && styles.itemFeatured]}
                  accessibilityLabel={`${item.label}: ${item.done ? 'done' : 'not yet'}`}
                >
                  <View style={[styles.itemMark, item.done && styles.itemMarkDone]}>
                    {item.done ? <Icon name="check" size={14} color={colors.textOnNavy} /> : null}
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemLabel, item.done && styles.itemLabelDone]}>
                      {item.label}
                    </Text>
                    {test ? (
                      <>
                        <Text style={styles.itemHelp}>
                          See what buyers see when they tap Chat on WhatsApp.
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={testWhatsApp}
                          style={({ pressed }) => [styles.itemButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.itemButtonText}>Open WhatsApp</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {item.id === 'shared_link' && !item.done ? (
                      <Text style={styles.itemHelp}>Use the share buttons above.</Text>
                    ) : null}
                    {item.id === 'delivery' && !item.done ? (
                      <>
                        <Text style={styles.itemHelp}>
                          Buyers can order once you add a delivery area or pickup.
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push('/delivery')}
                          style={({ pressed }) => [styles.itemButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.itemButtonText}>Add delivery options</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <View style={styles.postRow}>
              <View
                style={styles.mini}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.miniShop} numberOfLines={1}>
                  {shop.name}
                </Text>
                <View style={styles.miniPhoto}>
                  {cover?.thumbUrl || cover?.url ? (
                    <Image
                      source={{ uri: cover.thumbUrl ?? cover.url ?? undefined }}
                      style={styles.miniImage}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
                <View style={styles.miniOrder}>
                  <Text style={styles.miniOrderText} numberOfLines={1}>
                    Order · {formatKsh(product?.price ?? 0)}
                  </Text>
                </View>
              </View>
              <View style={styles.postHead}>
                <Text style={styles.postTitle}>Ready-made post</Text>
                <Text style={styles.postHint}>Edit it before you share, if you like.</Text>
              </View>
            </View>
            <TextInput
              accessibilityLabel="Ready-made post"
              value={postText}
              onChangeText={setEdited}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              style={styles.postInput}
            />
            {linkMissing ? (
              <Text style={styles.linkWarning}>
                Your shop link isn&apos;t in the text: we&apos;ll add it at the end when you share.
              </Text>
            ) : null}
            <View style={styles.postActions}>
              <View style={styles.langToggle} accessibilityRole="radiogroup">
                {(['en', 'sw'] as const).map((lang) => (
                  <Pressable
                    key={lang}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: language === lang }}
                    accessibilityLabel={lang === 'en' ? 'English' : 'Swahili'}
                    onPress={() => lang !== language && changeTemplate(() => setLanguage(lang))}
                    hitSlop={LANG_SLOP}
                    style={[styles.lang, language === lang && styles.langOn]}
                  >
                    <Text style={[styles.langText, language === lang && styles.langTextOn]}>
                      {lang.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  changeTemplate(() => setIndex((n) => (n + 1) % captionCount(language)))
                }
                style={styles.another}
                hitSlop={8}
              >
                <Icon name="rotate-cw" size={15} color={colors.navy} />
                <Text style={styles.anotherText}>Try another</Text>
              </Pressable>
            </View>
          </View>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button title="Go to my shop" loading={busy} onPress={done} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** 38 dp pills reach 44 dp into the toggle's padding. */
const LANG_SLOP = { top: 3, bottom: 3 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  hero: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.sheet + 8,
    borderBottomRightRadius: radii.sheet + 8,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  heroSide: { width: 72 },
  heroRight: { alignItems: 'flex-end' },
  logo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -1,
    color: colors.textOnNavy,
  },
  logoDot: { color: colors.greenBright },
  doneButton: { minHeight: 44, justifyContent: 'center' },
  done: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.textOnNavy },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  liveCheck: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTitle: {
    ...text('headline'),
    fontSize: 30,
    lineHeight: 36,
    color: colors.textOnNavy,
    flex: 1,
  },
  liveSub: { ...text('body'), fontSize: 16, color: colors.toggleOff, marginTop: spacing.md },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.navyRaised,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.navyMuted,
    paddingLeft: spacing.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  linkText: { ...text('body'), fontSize: 16, color: colors.toggleOff, flex: 1 },
  linkSlug: { fontFamily: fonts.bold, color: colors.textOnNavy },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  seeBuyers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  seeBuyersText: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.textOnNavy },
  copyText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },

  body: { paddingHorizontal: spacing.lg, gap: spacing.lg, marginTop: spacing.lg },
  shareRow: { flexDirection: 'row', gap: spacing.xs },
  shareItem: { flex: 1, alignItems: 'center', gap: spacing.sm },
  shareCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLabel: {
    ...text('body'),
    color: colors.textSecondary,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  shareLabelMain: { fontFamily: fonts.bold, color: colors.navy },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  finishHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  finishTitle: { ...text('title'), color: colors.navy, flex: 1 },
  countPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  countText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.green },
  item: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  itemFeatured: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    borderTopWidth: 0,
    padding: spacing.md,
  },
  itemMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  itemMarkDone: { borderStyle: 'solid', backgroundColor: colors.green, borderColor: colors.green },
  itemBody: { flex: 1, gap: spacing.xs },
  itemLabel: { ...text('subtitle'), fontFamily: fonts.bold, color: colors.navy },
  itemLabelDone: { color: colors.textSecondary },
  itemHelp: { ...text('body'), color: colors.textSecondary },
  itemButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    height: 44,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  itemButtonText: {
    ...text('bodyStrong'),
    fontFamily: fonts.bold,
    color: colors.textOnPrimary,
  },

  postRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  mini: {
    width: 96,
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  miniShop: { ...text('small'), fontFamily: fonts.bold, color: colors.textOnNavy },
  miniPhoto: {
    height: 64,
    borderRadius: radii.sm,
    backgroundColor: colors.beige,
    overflow: 'hidden',
  },
  miniImage: { width: '100%', height: '100%' },
  miniOrder: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingVertical: spacing.xxs,
    alignItems: 'center',
  },
  miniOrderText: { fontFamily: fonts.bold, fontSize: 10, color: colors.navy },
  postHead: { flex: 1, gap: spacing.xs },
  postTitle: { ...text('title'), fontSize: 18, color: colors.navy },
  postHint: { ...text('small'), color: colors.textSecondary },
  postInput: {
    ...text('body'),
    lineHeight: undefined,
    color: colors.text,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  linkWarning: { ...text('small'), color: colors.warningText },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  langToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 3,
  },
  lang: {
    minWidth: 48,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langOn: { backgroundColor: colors.navy },
  langText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.textSecondary },
  langTextOn: { color: colors.textOnNavy },
  another: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  anotherText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  pressed: { opacity: 0.85 },
});
