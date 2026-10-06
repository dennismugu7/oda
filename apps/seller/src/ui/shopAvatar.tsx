// The shop's square avatar on the Shop tab and More cards: its logo, or the name's first
// letter on the brand colour while there's no logo (carried forward from M6, fixed in M8b).
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radii, text } from '@/theme';

export function ShopAvatar({
  name,
  logoUrl,
  size = 48,
}: {
  name: string | null | undefined;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.box, box]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.box, styles.initialBox, box]}>
      <Text style={styles.initial}>{(name ?? ' ').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.md, backgroundColor: colors.beige },
  initialBox: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initial: { ...text('title'), color: colors.textOnPrimary },
});
