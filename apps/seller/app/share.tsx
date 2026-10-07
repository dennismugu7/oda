// Share your shop (design 19b-share, decision #78): pick where you'll post (WhatsApp, Status,
// TikTok, Instagram, Facebook), an image drawn on the phone ("New in" = the newest product,
// "Collection" = the whole shop; the QR code image is deferred), a caption in English or
// Swahili ("Try another"), and share: the caption, with the link tagged for the channel
// (?s=wa|status|tt|ig|fb), is copied, then the image goes to the phone's share sheet.
import Feather from '@expo/vector-icons/Feather';
import { displayUrl, formatKsh, shareUrl, type CaptionLanguage } from '@oda/shared';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { SHOP_BASE_URL } from '@/config';
import { growApi } from '@/insights/api';
import { onboardingApi } from '@/onboarding/api';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { memoryCache, useLoaded } from '@/settings/useLoaded';
import {
  captionsFor,
  captionText,
  captionToShare,
  firstChannel,
  imageKinds,
  SHARE_CHANNELS,
  shareButtonTitle,
  shareNotice,
  viaLine,
  type ImageKind,
  type ShareChannel,
  type ShareData,
} from '@/share/plan';
import { CollectionPoster, NewInPoster } from '@/share/Posters';
import { Button, FormMessage } from '@/ui/auth';
import { BrandIcon, StatusRing } from '@/ui/brandIcons';
import { rowStyles } from '@/ui/rows';
import { colors, radii, spacing, text } from '@/theme';

const cache = memoryCache<ShareData>();

export default function ShareScreen() {
  const { data, error, offline, reload } = useLoaded(growApi.share, cache);
  const [picked, setPicked] = useState<ShareChannel | null>(null);
  const channel = picked ?? firstChannel(data?.channels ?? []);
  return (
    <SettingsLayout
      title="Share your shop"
      subtitle="Where will you post it?"
      loaded={!!data}
      error={error}
      offline={offline}
      onRetry={reload}
      back={() => goBack('/shop')}
      header={data ? <ChannelTabs channel={channel} onPick={setPicked} /> : null}
    >
      {data ? <Sharer data={data} channel={channel} offline={offline} /> : null}
    </SettingsLayout>
  );
}

function ChannelTabs({
  channel,
  onPick,
}: {
  channel: ShareChannel;
  onPick: (c: ShareChannel) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.channels}
      accessibilityRole="tablist"
    >
      {SHARE_CHANNELS.map((c) => {
        const on = c === channel;
        return (
          <Pressable
            key={c}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={CHANNEL_NAMES[c]}
            onPress={() => onPick(c)}
            style={[styles.channel, on && styles.channelOn]}
          >
            <ChannelMark channel={c} />
            <Text style={[styles.channelText, on && styles.channelTextOn]}>{CHANNEL_NAMES[c]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const CHANNEL_NAMES: Record<ShareChannel, string> = {
  whatsapp: 'WhatsApp',
  whatsapp_status: 'Status',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

/** Official marks on a white circle (decision #56); TikTok stays a neutral note. */
function ChannelMark({ channel }: { channel: ShareChannel }) {
  return (
    <View style={styles.markCircle}>
      {channel === 'whatsapp' ? (
        <BrandIcon brand="whatsapp" size={24} />
      ) : channel === 'whatsapp_status' ? (
        <StatusRing size={24} />
      ) : channel === 'instagram' ? (
        <BrandIcon brand="instagram" size={24} />
      ) : channel === 'facebook' ? (
        <BrandIcon brand="facebook" size={24} />
      ) : (
        <Feather name="music" size={20} color={colors.navy} />
      )}
    </View>
  );
}

function Sharer({
  data,
  channel,
  offline,
}: {
  data: ShareData;
  channel: ShareChannel;
  offline: boolean;
}) {
  const insets = useSafeAreaInsets();
  const kinds = imageKinds(data);
  const [kind, setKind] = useState<ImageKind>(kinds[0]!);
  const [language, setLanguage] = useState<CaptionLanguage>('en');
  const [index, setIndex] = useState(0);
  const [imageReady, setImageReady] = useState(kind === 'collection');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const poster = useRef<View>(null);
  const link = displayUrl(SHOP_BASE_URL, data.shop.slug);
  const captionNow = captionText(data, SHOP_BASE_URL, kind, language, index);

  // The product photo needs a moment to load before it can be captured; don't wait forever.
  useEffect(() => {
    if (imageReady) return;
    const timer = setTimeout(() => setImageReady(true), 6000);
    return () => clearTimeout(timer);
  }, [imageReady]);

  function pickKind(next: ImageKind) {
    setKind(next);
    setIndex(0);
    setNotice(null);
  }

  async function copy(what: 'caption' | 'link') {
    await Clipboard.setStringAsync(
      what === 'caption'
        ? captionToShare(captionNow, SHOP_BASE_URL, data.shop.slug, channel)
        : shareUrl(SHOP_BASE_URL, data.shop.slug, channel),
    );
    setNotice({ text: what === 'caption' ? 'Caption copied.' : 'Link copied.' });
  }

  async function share() {
    setBusy(true);
    setNotice(null);
    try {
      await Clipboard.setStringAsync(
        captionToShare(captionNow, SHOP_BASE_URL, data.shop.slug, channel),
      );
      const uri = await captureRef(poster, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        setNotice({
          text: 'Sharing isn’t available on this phone. The caption is copied.',
          error: true,
        });
        return;
      }
      setNotice({ text: shareNotice(channel) });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: shareButtonTitle(channel),
      });
      // "Share your link" on Home's checklist counts as done.
      onboardingApi.tick('shared_link').catch(() => {});
    } catch {
      setNotice({ text: 'Couldn’t make the image. Try again.', error: true });
    } finally {
      setBusy(false);
    }
  }

  const [before, after] = captionNow.split(link);
  return (
    <>
      <View style={styles.card}>
        <Text style={rowStyles.overline}>PICK AN IMAGE</Text>
        <View style={styles.images}>
          {kinds.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ checked: k === kind }}
              accessibilityLabel={k === 'new' ? 'New in image' : 'Collection image'}
              accessibilityHint={k === 'new' ? 'Your latest product' : 'All your products'}
              onPress={() => pickKind(k)}
              style={styles.imageChoice}
            >
              <View style={[styles.thumb, k === kind && styles.thumbOn]}>
                {k === 'new' && data.latest ? (
                  <View style={[styles.thumbInner, styles.thumbNavy]}>
                    <Text style={styles.thumbShop} numberOfLines={1}>
                      {data.shop.name}
                    </Text>
                    <Image source={{ uri: data.latest.photoUrl! }} style={styles.thumbPhoto} />
                    <View style={styles.thumbPill}>
                      <Text style={styles.thumbPillText} numberOfLines={1}>
                        {formatKsh(data.latest.price)} · Order
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.thumbInner, styles.thumbOrange]}>
                    <Text style={styles.thumbOverline} numberOfLines={1}>
                      {data.shop.name.toUpperCase()}
                    </Text>
                    <Text style={styles.thumbHeadline}>
                      {data.productCount > 1
                        ? `${data.productCount} pieces, one link`
                        : 'Shop with one link'}
                    </Text>
                  </View>
                )}
                {k === kind ? (
                  <View style={styles.check}>
                    <Feather name="check" size={14} color={colors.textOnPrimary} />
                  </View>
                ) : null}
              </View>
              <Text style={styles.imageTitle}>{k === 'new' ? 'New in' : 'Collection'}</Text>
              <Text style={styles.imageLine}>
                {k === 'new' ? 'Your latest product' : 'All your products'}
              </Text>
            </Pressable>
          ))}
        </View>
        {!data.latest?.photoUrl ? (
          <Text style={styles.hint}>Add a product with a photo to share it as “New in”.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.captionHead}>
          <Text style={rowStyles.overline}>CAPTION</Text>
          <View style={styles.lang} accessibilityRole="radiogroup">
            {(['en', 'sw'] as const).map((l) => (
              <Pressable
                key={l}
                accessibilityRole="radio"
                accessibilityState={{ checked: l === language }}
                accessibilityLabel={l === 'en' ? 'English' : 'Swahili'}
                onPress={() => {
                  setLanguage(l);
                  setIndex(0);
                }}
                hitSlop={LANG_SLOP}
                style={[styles.langOption, l === language && styles.langOn]}
              >
                <Text style={[styles.langText, l === language && styles.langTextOn]}>
                  {l.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.captionBox}>
          <Text style={styles.captionText}>
            {before}
            {after !== undefined ? <Text style={styles.captionLink}>{link}</Text> : null}
            {after}
          </Text>
        </View>
        <View style={styles.captionActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIndex((i) => (i + 1) % captionsFor(kind, language))}
            style={styles.textAction}
          >
            <Feather name="refresh-cw" size={18} color={colors.navy} />
            <Text style={styles.textActionLabel}>Try another</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => copy('caption')}
            style={styles.textAction}
          >
            <Feather name="copy" size={18} color={colors.navy} />
            <Text style={styles.textActionLabel}>Copy caption</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, styles.linkCard]}>
        <View style={styles.flex}>
          <Text style={styles.muted}>Your link</Text>
          <Text style={styles.link} numberOfLines={1}>
            {data.shop.linkPrefix}
            <Text style={styles.linkSlug}>{data.shop.slug}</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy your link"
          onPress={() => copy('link')}
          style={styles.copyButton}
        >
          <Feather name="copy" size={18} color={colors.navy} />
          <Text style={styles.textActionLabel}>Copy</Text>
        </Pressable>
      </View>

      {notice ? (
        <FormMessage tone={notice.error ? 'error' : 'info'}>{notice.text}</FormMessage>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Button
          title={shareButtonTitle(channel)}
          onPress={share}
          loading={busy || (kind === 'new' && !imageReady)}
          disabled={offline}
        />
        <Text style={styles.via}>{viaLine(channel)}</Text>
      </View>

      {/* The full-size image, drawn off screen and captured when sharing. */}
      <View
        style={styles.offscreen}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {kind === 'new' && data.latest?.photoUrl ? (
          <NewInPoster
            ref={poster}
            data={data}
            link={link}
            onImageReady={() => setImageReady(true)}
          />
        ) : (
          <CollectionPoster ref={poster} data={data} link={link} />
        )}
      </View>
    </>
  );
}

/** 36 dp pills reach 44 dp into the toggle's padding and border. */
const LANG_SLOP = { top: 4, bottom: 4 };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  channels: { gap: spacing.sm, paddingRight: spacing.lg },
  channel: {
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 92,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.navyRaised,
  },
  channelOn: { backgroundColor: colors.surface },
  markCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.toggleOff },
  channelTextOn: { color: colors.navy },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  images: { flexDirection: 'row', gap: spacing.md },
  imageChoice: { flex: 1, maxWidth: 160, gap: 2 },
  thumb: { aspectRatio: 4 / 5, borderRadius: radii.lg, padding: 3 },
  thumbOn: { borderWidth: 3, borderColor: colors.primary, padding: 0 },
  thumbInner: {
    flex: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  thumbNavy: { backgroundColor: colors.navy },
  thumbOrange: { backgroundColor: colors.primary },
  thumbShop: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  thumbPhoto: { flex: 1, borderRadius: radii.sm, backgroundColor: colors.beige },
  thumbPill: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: 2,
    alignItems: 'center',
  },
  thumbPillText: { fontFamily: 'Poppins_700Bold', fontSize: 10, color: colors.navy },
  thumbOverline: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: colors.textOnPrimary },
  thumbHeadline: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
    lineHeight: 24,
    color: colors.textOnPrimary,
  },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageTitle: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.navy,
    marginTop: spacing.xs,
  },
  imageLine: { ...text('small'), color: colors.textSecondary },
  hint: { ...text('small'), color: colors.textSecondary },
  captionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lang: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 3,
  },
  langOption: {
    minWidth: 48,
    minHeight: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langOn: { backgroundColor: colors.navy },
  langText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.textSecondary },
  langTextOn: { color: colors.textOnNavy },
  captionBox: { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: spacing.md },
  captionText: { ...text('body'), color: colors.text },
  captionLink: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  captionActions: { flexDirection: 'row', justifyContent: 'space-between' },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  textActionLabel: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  linkCard: { flexDirection: 'row', alignItems: 'center' },
  muted: { ...text('body'), color: colors.textSecondary },
  link: { ...text('subtitle'), color: colors.textSecondary },
  linkSlug: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: { gap: spacing.sm },
  via: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  offscreen: { position: 'absolute', left: -2000, top: 0 },
});
