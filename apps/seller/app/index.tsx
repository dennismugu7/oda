// Welcome (design/app/01-welcome.png). Static in M0; Sign in / Create new shop are wired in M2.
// Deviation from the image (plan Q4): "Payment checked" → "M-Pesa till checked", "KES" → "KSh".
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, sizes, spacing, text } from '@/theme';

const DOT_ROWS = 17;
const DOT_COLS = 25;

export default function Welcome() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brand}>
        <View style={styles.logoRow}>
          <Text style={styles.logo} accessibilityRole="header" accessibilityLabel="oda">
            oda
          </Text>
          <CheckBadge size={22} />
        </View>
        <Text style={styles.tagline}>Your free shop link</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.dotPanel}>
          <DotGrid />
          <View style={styles.shopCard}>
            <View style={styles.shopHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>AS</Text>
              </View>
              <View style={styles.shopMeta}>
                <Text style={styles.shopName}>Amani Styles</Text>
                <View style={styles.checkedChip}>
                  <Text style={styles.checkedChipText}>✓ M-Pesa till checked</Text>
                </View>
              </View>
            </View>
            <View style={styles.swatches}>
              <View style={[styles.swatch, { backgroundColor: '#2A2A35' }]} />
              <View style={[styles.swatch, { backgroundColor: '#E8C35B' }]} />
              <View style={[styles.swatch, { backgroundColor: '#C96A4B' }]} />
            </View>
            <Text style={styles.shopStats}>126 deliveries · ★ 4.8</Text>
          </View>

          <View style={styles.notification}>
            <View style={styles.notificationApp}>
              <View style={styles.notificationIcon}>
                <View style={styles.notificationIconRing} />
              </View>
              <Text style={styles.notificationMeta}>oda · now</Text>
            </View>
            <Text style={styles.notificationTitle}>New order #1042</Text>
            <Text style={styles.notificationBody}>Wanjiku · KSh 2,500 · TikTok</Text>
          </View>
        </View>

        <Text style={styles.headline}>Turn your posts{'\n'}into orders.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>Sign in</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, { color: colors.primary }]}>Create new shop</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CheckBadge({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.green,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.42,
          height: size * 0.24,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: colors.surface,
          transform: [{ rotate: '-45deg' }, { translateY: -1 }],
        }}
      />
    </View>
  );
}

function DotGrid() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: DOT_ROWS }, (_, r) => (
        <View key={r} style={styles.dotRow}>
          {Array.from({ length: DOT_COLS }, (_, c) => (
            <View key={c} style={styles.dot} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', paddingTop: spacing.xl },
  logoRow: { flexDirection: 'row', alignItems: 'flex-end' },
  logo: {
    ...text('display'),
    fontSize: 72,
    lineHeight: 80,
    letterSpacing: -3,
    color: colors.primary,
  },
  tagline: { ...text('title'), fontFamily: text('body').fontFamily, color: colors.textSecondary },

  hero: {
    marginTop: spacing.xxxl,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dotPanel: {
    height: 160,
    borderRadius: radii.xl,
    backgroundColor: colors.primaryTint,
    overflow: 'hidden',
    padding: spacing.md,
  },
  dotRow: { flexDirection: 'row', justifyContent: 'space-around', flex: 1, alignItems: 'center' },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.primarySoft },

  shopCard: {
    width: 118,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  shopHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('overline'), fontSize: 7, lineHeight: 9, letterSpacing: 0, color: '#fff' },
  shopMeta: { flex: 1, gap: 2 },
  shopName: { ...text('bodyStrong'), fontSize: 9, lineHeight: 11, color: colors.navy },
  checkedChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  checkedChipText: { ...text('bodyStrong'), fontSize: 6, lineHeight: 8, color: colors.green },
  swatches: { flexDirection: 'row', gap: 4 },
  swatch: { flex: 1, height: 30, borderRadius: 6 },
  shopStats: { ...text('small'), fontSize: 7, lineHeight: 9, color: colors.textSecondary },

  notification: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 124,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 1,
  },
  notificationApp: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notificationIcon: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIconRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  notificationMeta: { ...text('small'), fontSize: 7, lineHeight: 9, color: colors.textSecondary },
  notificationTitle: { ...text('bodyStrong'), fontSize: 9, lineHeight: 12, color: colors.navy },
  notificationBody: { ...text('small'), fontSize: 7, lineHeight: 9, color: colors.textSecondary },

  headline: { ...text('headline'), color: colors.navy, marginTop: spacing.md },

  actions: { marginTop: 'auto', gap: spacing.md, paddingBottom: spacing.xl },
  button: {
    height: sizes.buttonHeight,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.85 },
  buttonText: text('button'),
});
