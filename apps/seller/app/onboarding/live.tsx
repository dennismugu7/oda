// Onboarding step 6, "Your shop is live" (design 14, with docs/design-changes.md): the link
// with Copy, share buttons in the order of the seller's channels (each link tagged ?s=…),
// a ready-made post in English or Swahili ("Try another"), and the 7-item "Finish your
// shop" checklist. "See what buyers see" stays hidden until M4 (decision #41 b). Sharing is
// text + link only in M2 (decision #41 c). Done finishes onboarding.
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  caption,
  captionCount,
  displayUrl,
  formatKsh,
  SHARE_LABELS,
  shareButtons,
  shareUrl,
  type CaptionLanguage,
  type FinishItem,
  type ShareTarget,
} from '@oda/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardingApi } from '@/onboarding/api';
import type { IconName } from '@/onboarding/labels';
import { useOnboarding, useSubmit } from '@/onboarding/useOnboarding';
import { FormMessage } from '@/ui/auth';
import { StepStatus } from '@/ui/onboarding';
import { colors, radii, spacing, text } from '@/theme';

const SHARE_ICONS: Record<ShareTarget, IconName> = {
  whatsapp: 'whatsapp',
  whatsapp_status: 'circle-slice-8',
  tiktok: 'music-note',
  instagram: 'instagram',
  facebook: 'facebook',
  more: 'dots-horizontal',
};

const ITEM_HELP: Partial<Record<FinishItem, string>> = {
  shared_link: 'Use the share buttons above. Buyers order from your link.',
  tested_whatsapp: 'Opens your own WhatsApp chat link, the same one buyers tap.',
};

export default function ShopLive() {
  const { state, error: loadError, retry } = useOnboarding();
  const { busy, error, submit, setError } = useSubmit();
  const insets = useSafeAreaInsets();
  const [language, setLanguage] = useState<CaptionLanguage>('en');
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!state?.shop || !state.checklist) {
    return <StepStatus step={6} error={loadError} onRetry={retry} />;
  }
  const { shop, product, checklist } = state;
  const base = shop.url.slice(0, shop.url.length - shop.slug.length - 1);
  const cover = product?.photos[0];

  function post(target: ShareTarget) {
    return caption(language, index, {
      shop: shop.name,
      product: product?.name ?? 'new stock',
      price: product?.price ?? 0,
      link: shareUrl(base, shop.slug, target),
    });
  }

  async function tick(item: 'shared_link' | 'tested_whatsapp') {
    if (checklist.items.find((i) => i.id === item)?.done) return;
    // Best effort: a failed tick only leaves the item unticked.
    await submit(() => onboardingApi.tick(item));
  }

  async function share(target: ShareTarget) {
    const message = post(target);
    try {
      if (target === 'whatsapp') {
        // Straight into WhatsApp's chat picker; without WhatsApp, the share sheet below.
        const opened = await Linking.openURL(
          `whatsapp://send?text=${encodeURIComponent(message)}`,
        ).then(
          () => true,
          () => false,
        );
        if (opened) {
          await tick('shared_link');
          return;
        }
      }
      const result = await Share.share({ message });
      if (result.action === Share.sharedAction) await tick('shared_link');
    } catch {
      setError("Couldn't open sharing on this phone. Copy the link instead.");
    }
  }

  async function copy() {
    await Clipboard.setStringAsync(shop.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function testWhatsApp() {
    try {
      await Linking.openURL(`https://wa.me/${shop.whatsappPhone.replace(/^\+/, '')}`);
      await tick('tested_whatsapp');
    } catch {
      setError("Couldn't open WhatsApp on this phone.");
    }
  }

  async function done() {
    const finished = await submit(() => onboardingApi.complete());
    if (finished) router.replace('/start');
  }

  const buttons = shareButtons(shop.channels);
  const shown = displayUrl(base, shop.slug);
  const slash = shown.lastIndexOf('/');

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroSide} />
            <Text accessibilityRole="header" accessibilityLabel="oda" style={styles.logo}>
              oda<Text style={styles.logoDot}>.</Text>
            </Text>
            <View style={[styles.heroSide, styles.heroRight]}>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={done} disabled={busy}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.liveRow}>
            <View style={styles.liveCheck}>
              <Feather name="check" size={26} color={colors.textOnNavy} />
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
              <Feather name={copied ? 'check' : 'copy'} size={16} color={colors.navy} />
              <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
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
                    <View
                      style={[
                        styles.shareCircle,
                        i === 0 && styles.shareCircleMain,
                        pressed && styles.pressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={SHARE_ICONS[target]}
                        size={26}
                        color={i === 0 ? colors.textOnNavy : colors.navy}
                      />
                    </View>
                    <Text style={[styles.shareLabel, i === 0 && styles.shareLabelMain]}>
                      {SHARE_LABELS[target]}
                    </Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.postRow}>
              <View style={styles.mini} accessibilityElementsHidden>
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
              <View style={styles.postText}>
                <Text style={styles.postTitle}>Ready-made post</Text>
                <Text style={styles.postBody} selectable>
                  {caption(language, index, {
                    shop: shop.name,
                    product: product?.name ?? 'new stock',
                    price: product?.price ?? 0,
                    link: shown,
                  })}
                </Text>
              </View>
            </View>
            <View style={styles.postActions}>
              <View style={styles.langToggle} accessibilityRole="radiogroup">
                {(['en', 'sw'] as const).map((lang) => (
                  <Pressable
                    key={lang}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: language === lang }}
                    accessibilityLabel={lang === 'en' ? 'English' : 'Swahili'}
                    onPress={() => setLanguage(lang)}
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
                onPress={() => setIndex((n) => (n + 1) % captionCount(language))}
                style={styles.another}
                hitSlop={8}
              >
                <Feather name="rotate-cw" size={15} color={colors.navy} />
                <Text style={styles.anotherText}>Try another</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.finishHead}>
              <Text style={styles.finishTitle}>Finish your shop</Text>
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
            {checklist.items.map((item, i) => (
              <View
                key={item.id}
                style={[styles.item, i > 0 && styles.itemDivider]}
                accessibilityLabel={`${item.label}: ${item.done ? 'done' : 'not yet'}`}
              >
                <View style={[styles.itemMark, item.done && styles.itemMarkDone]}>
                  {item.done ? <Feather name="check" size={14} color={colors.textOnNavy} /> : null}
                </View>
                <View style={styles.itemBody}>
                  <Text style={[styles.itemLabel, item.done && styles.itemLabelDone]}>
                    {item.label}
                  </Text>
                  {!item.done && ITEM_HELP[item.id] ? (
                    <Text style={styles.itemHelp}>{ITEM_HELP[item.id]}</Text>
                  ) : null}
                  {!item.done && item.id === 'tested_whatsapp' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={testWhatsApp}
                      style={({ pressed }) => [styles.itemButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.itemButtonText}>Open WhatsApp</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          {error ? <FormMessage>{error}</FormMessage> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  heroSide: { width: 64 },
  heroRight: { alignItems: 'flex-end' },
  logo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Poppins_700Bold',
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -1,
    color: colors.textOnNavy,
  },
  logoDot: { color: colors.greenBright },
  done: { ...text('subtitle'), fontFamily: text('body').fontFamily, color: colors.textMuted },
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
  linkSlug: { fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  copyText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },

  body: { paddingHorizontal: spacing.lg, gap: spacing.lg, marginTop: spacing.lg },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between' },
  shareItem: { alignItems: 'center', gap: spacing.sm, width: 76 },
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
  shareCircleMain: { backgroundColor: colors.green, borderColor: colors.green },
  shareLabel: { ...text('body'), color: colors.textSecondary },
  shareLabelMain: { fontFamily: 'Poppins_700Bold', color: colors.navy },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  postRow: { flexDirection: 'row', gap: spacing.md },
  mini: {
    width: 112,
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  miniShop: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  miniPhoto: {
    height: 80,
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
  miniOrderText: { fontFamily: 'Poppins_700Bold', fontSize: 10, color: colors.navy },
  postText: { flex: 1, gap: spacing.xs },
  postTitle: { ...text('title'), fontSize: 18, color: colors.navy },
  postBody: { ...text('body'), color: colors.textSecondary },
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
  langText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.textSecondary },
  langTextOn: { color: colors.textOnNavy },
  another: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  anotherText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },

  finishHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  finishTitle: { ...text('title'), color: colors.navy },
  countPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  countText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.green },
  item: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
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
  itemLabel: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
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
    fontFamily: 'Poppins_700Bold',
    color: colors.textOnPrimary,
  },
  pressed: { opacity: 0.85 },
});
