// The images the Share screen posts (19b-share), drawn on the phone and captured with
// react-native-view-shot (decision #78): "New in" (the newest product) and "Collection" (the
// whole shop). Fixed 320 × 400 dp layouts (4:5, fine for Status, TikTok and Instagram), so
// the image looks the same on every phone; the small cards in "Pick an image" are previews.
import { formatKsh } from '@oda/shared';
import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, text } from '@/theme';
import type { ShareData } from './plan';

export const POSTER = { width: 320, height: 400 };

export const NewInPoster = forwardRef<
  View,
  { data: ShareData; link: string; onImageReady: () => void }
>(function NewInPoster({ data, link, onImageReady }, ref) {
  const product = data.latest!;
  return (
    <View ref={ref} collapsable={false} style={[styles.poster, styles.navy]}>
      <View style={styles.head}>
        {data.shop.logoUrl ? (
          <Image source={{ uri: data.shop.logoUrl }} style={styles.logo} />
        ) : null}
        <Text style={styles.shopOnNavy} numberOfLines={1}>
          {data.shop.name}
        </Text>
      </View>
      <View style={styles.photoBox}>
        <Image
          source={{ uri: product.photoUrl! }}
          style={styles.photo}
          resizeMode="cover"
          onLoad={onImageReady}
          onError={onImageReady}
        />
      </View>
      <Text style={styles.productName} numberOfLines={1}>
        {product.name}
      </Text>
      <View style={styles.pill}>
        <Text style={styles.pillText} numberOfLines={1}>
          {formatKsh(product.price)} · Order at {link}
        </Text>
      </View>
    </View>
  );
});

export const CollectionPoster = forwardRef<View, { data: ShareData; link: string }>(
  function CollectionPoster({ data, link }, ref) {
    const n = data.productCount;
    return (
      <View ref={ref} collapsable={false} style={[styles.poster, styles.orange]}>
        <Text style={styles.overline} numberOfLines={1}>
          {data.shop.name.toUpperCase()}
        </Text>
        <Text style={styles.headline}>
          {n > 1 ? `${n} pieces,\none link` : 'Shop with\none link'}
        </Text>
        <View style={styles.flex} />
        <Text style={styles.orderOn}>Order on</Text>
        <Text style={styles.link} numberOfLines={2}>
          {link}
        </Text>
        <Text style={styles.footer}>Pay the seller directly on M-Pesa</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  poster: {
    width: POSTER.width,
    height: POSTER.height,
    borderRadius: radii.xl,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  navy: { backgroundColor: colors.navy, gap: spacing.md },
  orange: { backgroundColor: colors.primary },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 32, height: 32, borderRadius: radii.sm },
  shopOnNavy: {
    ...text('subtitle'),
    fontFamily: 'Poppins_700Bold',
    color: colors.textOnNavy,
    flex: 1,
  },
  photoBox: { flex: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.beige },
  photo: { width: '100%', height: '100%' },
  productName: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  pill: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  pillText: { ...text('small'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  overline: { ...text('bodyStrong'), color: colors.textOnPrimary, letterSpacing: 1 },
  headline: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 40,
    lineHeight: 46,
    color: colors.textOnPrimary,
    marginTop: spacing.lg,
  },
  orderOn: { ...text('body'), color: colors.textOnPrimary },
  link: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.textOnPrimary },
  footer: { ...text('small'), color: colors.textOnPrimary, marginTop: spacing.sm, opacity: 0.9 },
});
