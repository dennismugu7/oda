// 01 Welcome with the approved animation (docs/design-changes.md → 01-welcome; reference
// design/app/welcome-animation/01-welcome-animation-preview.html). Sizes follow the preview
// (CSS px = dp). Card: "Nairobi · Kilimani", three product tiles, no badge; the green tick
// sits on the "oda" baseline like a full stop. Animation: one clock on the UI thread
// (src/welcome/timeline.ts), transform + opacity only; Remove animations → final state.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiLabel } from '@/config';
import { colors, radii, spacing, text } from '@/theme';
import { ANIMS, END_MS, opacityAt, sample } from '@/welcome/timeline';

const EXTRA_BOLD = 'Poppins_800ExtraBold';
const FINGER = 30;

const tiles = [
  { key: 'fashion', bg: '#FBE3DA', image: require('../assets/welcome/welcome-fashion.png') },
  { key: 'food', bg: '#FBF0D2', image: require('../assets/welcome/welcome-food.png') },
  {
    key: 'accessories',
    bg: '#E2F1E8',
    image: require('../assets/welcome/welcome-accessories.png'),
  },
] as const;

export default function Welcome() {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(reduceMotion ? END_MS : 0);
  // Where the food tile's centre is inside the board (for the finger), from layout.
  const shopPos = useSharedValue({ x: 0, y: 0 });
  const rowPos = useSharedValue({ x: 0, y: 0 });
  const tileBox = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    // Plays once on mount, then stays still. Buttons work from the first frame.
    clock.value = reduceMotion
      ? END_MS
      : withTiming(END_MS, { duration: END_MS, easing: Easing.linear });
  }, [clock, reduceMotion]);

  const shopStyle = useAnimatedStyle(() => {
    const t = clock.value;
    return {
      opacity: opacityAt(ANIMS.shop, t),
      transform: [
        { perspective: 700 },
        { translateY: sample(ANIMS.shop, 'translateY', t) },
        { rotateX: `${sample(ANIMS.shop, 'rotateX', t)}deg` },
        { rotateZ: `${sample(ANIMS.shop, 'rotateZ', t)}deg` },
        { scale: sample(ANIMS.shop, 'scale', t) },
      ],
    };
  });

  const fingerStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const cx = shopPos.value.x + rowPos.value.x + tileBox.value.x + tileBox.value.w / 2;
    const cy = shopPos.value.y + rowPos.value.y + tileBox.value.y + tileBox.value.h / 2;
    const offset = sample(ANIMS.finger, 'offset', t);
    return {
      opacity: tileBox.value.w > 0 ? opacityAt(ANIMS.finger, t) : 0,
      transform: [
        { translateX: cx - FINGER / 2 + offset },
        { translateY: cy - FINGER / 2 + offset },
        { scale: sample(ANIMS.finger, 'scale', t) },
      ],
    };
  });

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sample(ANIMS.tile, 'scale', clock.value) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, sample(ANIMS.tile, 'glow', clock.value))),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacityAt(ANIMS.ring, clock.value),
    transform: [{ scale: sample(ANIMS.ring, 'scale', clock.value) }],
  }));

  const orderStyle = useAnimatedStyle(() => {
    const t = clock.value;
    return {
      opacity: opacityAt(ANIMS.order, t),
      transform: [
        { translateX: sample(ANIMS.order, 'translateX', t) },
        { translateY: sample(ANIMS.order, 'translateY', t) },
        { scale: sample(ANIMS.order, 'scale', t) },
      ],
    };
  });

  const headlineStyle = useAnimatedStyle(() => ({
    opacity: opacityAt(ANIMS.headline, clock.value),
    transform: [{ translateY: sample(ANIMS.headline, 'translateY', clock.value) }],
  }));

  const at = (e: LayoutChangeEvent) => {
    const { x, y } = e.nativeEvent.layout;
    return { x, y };
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.brand}>
        <Text style={styles.logo} accessibilityRole="header" accessibilityLabel="oda">
          oda
          {/* An inline view inside Text sits on the text baseline, like a full stop. */}
          <View style={styles.tickSlot}>
            <View style={styles.tick}>
              <View style={styles.tickMark} />
            </View>
          </View>
        </Text>
        <Text style={styles.tagline}>Your free shop link</Text>
      </View>

      <View style={styles.illo}>
        {/* Decoration: screen readers skip the sample shop and order (the headline stays). */}
        <View
          style={styles.board}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Image
            source={require('../assets/welcome/dot.png')}
            resizeMode="repeat"
            style={StyleSheet.absoluteFill}
          />

          <Animated.View style={[styles.shop, shopStyle]} onLayout={(e) => (shopPos.value = at(e))}>
            <View style={styles.shopHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>AS</Text>
              </View>
              <View>
                <Text style={styles.shopName}>Amani Styles</Text>
                <Text style={styles.small}>Nairobi · Kilimani</Text>
              </View>
            </View>
            <View style={styles.tiles} onLayout={(e) => (rowPos.value = at(e))}>
              {tiles.map((tile) =>
                tile.key === 'food' ? (
                  <Animated.View
                    key={tile.key}
                    style={[styles.tileSlot, tileStyle]}
                    onLayout={(e) => {
                      const { x, y, width, height } = e.nativeEvent.layout;
                      tileBox.value = { x, y, w: width, h: height };
                    }}
                  >
                    {/* Pre-rendered warm glow behind the tile: only its opacity animates. */}
                    <Animated.Image
                      source={require('../assets/welcome/glow.png')}
                      resizeMode="stretch"
                      style={[styles.glow, glowStyle]}
                    />
                    <View style={[styles.tile, { backgroundColor: tile.bg }]}>
                      <Image source={tile.image} resizeMode="contain" style={styles.tileImage} />
                    </View>
                    <Animated.View style={[styles.ring, ringStyle]} />
                  </Animated.View>
                ) : (
                  <View key={tile.key} style={styles.tileSlot}>
                    <View style={[styles.tile, { backgroundColor: tile.bg }]}>
                      <Image source={tile.image} resizeMode="contain" style={styles.tileImage} />
                    </View>
                  </View>
                ),
              )}
            </View>
            <Text style={[styles.small, styles.meta]}>126 deliveries · ★ 4.8</Text>
          </Animated.View>

          <Animated.View style={[styles.order, orderStyle]}>
            <View style={styles.orderHead}>
              <View style={styles.orderIcon}>
                <View style={styles.orderIconRing} />
              </View>
              <Text style={styles.small} numberOfLines={1}>
                oda · now
              </Text>
            </View>
            <Text style={styles.orderTitle}>New order #1042</Text>
            <Text style={styles.small}>Wanjiku · KSh 2,500 · TikTok</Text>
          </Animated.View>

          <Animated.View pointerEvents="none" style={[styles.finger, fingerStyle]} />
        </View>

        <Animated.Text style={[styles.headline, headlineStyle]}>
          Turn your posts{'\n'}into orders.
        </Animated.Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sign-in')}
          style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>Sign in</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sign-up')}
          style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, { color: colors.primary }]}>Create new shop</Text>
        </Pressable>
        {__DEV__ ? <Text style={styles.devLabel}>API: {apiLabel()}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const cardShadow = {
  shadowColor: colors.navy,
  shadowOpacity: 0.1,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: 28,
  },
  brand: { alignItems: 'center', marginTop: 6 },
  logo: {
    fontFamily: EXTRA_BOLD,
    fontSize: 64,
    lineHeight: 72,
    letterSpacing: -2,
    color: colors.primary,
  },
  tickSlot: { width: 24, height: 20, alignItems: 'flex-end' },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: {
    width: 9,
    height: 5,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.surface,
    transform: [{ rotate: '-45deg' }, { translateY: -1 }],
  },
  tagline: {
    ...text('body'),
    fontSize: 17,
    lineHeight: 24,
    color: colors.textSecondary,
    marginTop: 2,
  },

  illo: {
    backgroundColor: '#F4F4F4',
    marginTop: 26,
    marginHorizontal: -4,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  board: { height: 222, borderRadius: 22, backgroundColor: '#FCEFEA', overflow: 'hidden' },
  shop: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: '57%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 10,
    transformOrigin: '30% 100%',
    ...cardShadow,
  },
  shopHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...text('button'), fontSize: 10, lineHeight: 13, color: colors.surface },
  shopName: { ...text('bodyStrong'), fontSize: 12, lineHeight: 16, color: colors.navy },
  small: { ...text('small'), fontSize: 9, lineHeight: 13, color: colors.textSecondary },
  tiles: { flexDirection: 'row', gap: 6, marginTop: 8 },
  tileSlot: { flex: 1, height: 44 },
  tile: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: { width: '78%', height: '78%' },
  glow: { position: 'absolute', left: -24, right: -24, top: -24, bottom: -24 },
  ring: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  meta: { marginTop: 7 },

  order: {
    position: 'absolute',
    right: 10,
    bottom: 12,
    width: '55%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    ...cardShadow,
    shadowOpacity: 0.14,
    elevation: 5,
  },
  orderHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderIcon: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderIconRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  orderTitle: {
    ...text('bodyStrong'),
    fontSize: 12,
    lineHeight: 16,
    color: colors.navy,
    marginTop: 3,
  },

  finger: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: FINGER,
    height: FINGER,
    borderRadius: FINGER / 2,
    backgroundColor: 'rgba(28,27,46,0.28)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  headline: {
    fontFamily: EXTRA_BOLD,
    fontSize: 30,
    lineHeight: 32.4,
    letterSpacing: -0.8,
    color: colors.navy,
    marginTop: 16,
    paddingLeft: 4,
  },

  actions: { marginTop: 'auto', paddingTop: 36, gap: 12, paddingBottom: 22 },
  button: {
    height: 55,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.85 },
  buttonText: { ...text('button'), fontSize: 18, lineHeight: 24 },
  devLabel: { ...text('small'), color: colors.textMuted, textAlign: 'center' },
});
