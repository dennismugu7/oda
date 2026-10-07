// The "Enjoying oda?" sheet (design 21-rate-app) over Settings: five stars (all on to start),
// then Play's in-app review for 4–5 stars once oda is on Google Play, a clear message before
// that, and the feedback screen for 1–3 stars (src/settings/rate.ts, decision #78).
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/auth';
import { colors, radii, spacing, text } from '@/theme';
import { rateButtonTitle, rateNext, STAR_LABELS } from './rate';

export function RateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(5);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setNotice(null);
    setStars(5);
    onClose();
  }

  async function rate() {
    setBusy(true);
    const onPlay = !!StoreReview.storeUrl() && (await StoreReview.hasAction().catch(() => false));
    const next = rateNext(stars, onPlay);
    setBusy(false);
    if (next === 'feedback') {
      close();
      router.push({ pathname: '/settings/feedback', params: { kind: 'idea' } });
      return;
    }
    if (next === 'review') {
      await StoreReview.requestReview().catch(() => {});
      close();
      return;
    }
    setNotice(
      'oda isn’t on Google Play yet, so there’s nowhere to rate it. Thank you! We’ll ask again once it is.',
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={close}
          style={styles.close}
        >
          <Feather name="x" size={22} color={colors.navy} />
        </Pressable>
        <View style={styles.logo}>
          <Text style={styles.logoText}>
            oda<Text style={styles.logoDot}>.</Text>
          </Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Enjoying oda?
        </Text>
        {notice ? (
          <>
            <Text style={styles.line} accessibilityLiveRegion="polite">
              {notice}
            </Text>
            <Button title="Done" onPress={close} />
          </>
        ) : (
          <>
            <Text style={styles.line}>
              Tap a star to rate it. It takes a second and helps other sellers find us.
            </Text>
            <View
              style={styles.stars}
              accessibilityRole="adjustable"
              accessibilityLabel={`${stars} of 5 stars`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`}
                  hitSlop={6}
                  onPress={() => setStars(n)}
                >
                  <Text style={[styles.star, n > stars && styles.starOff]}>★</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>{STAR_LABELS[stars - 1]}</Text>
            <Button title={rateButtonTitle(stars)} onPress={rate} loading={busy} />
            <Pressable accessibilityRole="button" onPress={close} style={styles.notNow}>
              <Text style={styles.notNowText}>Not now</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,46,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'stretch',
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.toggleOff,
  },
  close: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { ...text('title'), fontFamily: 'Poppins_700Bold', color: colors.textOnNavy },
  logoDot: { color: colors.greenBright },
  title: { ...text('headline'), color: colors.navy, textAlign: 'center' },
  line: { ...text('body'), color: colors.textSecondary, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  star: { fontSize: 40, lineHeight: 48, color: colors.star },
  starOff: { color: colors.toggleOff },
  label: {
    ...text('bodyStrong'),
    fontFamily: 'Poppins_700Bold',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  notNow: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  notNowText: { ...text('bodyStrong'), fontFamily: 'Poppins_700Bold', color: colors.navy },
});
