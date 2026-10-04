// Add product (design 18-edit-product) arrives in CP4; this keeps the "+" button useful.
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabPlaceholder, TabScreen } from '@/ui/tabs';
import { colors, spacing } from '@/theme';

export default function NewProduct() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <TabScreen title="Add product">
        <TabPlaceholder
          icon="plus-circle"
          title="New products"
          line="Adding a product with photos, sizes and colours will happen here."
        />
      </TabScreen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        style={[styles.close, { top: insets.top + spacing.lg }]}
      >
        <Feather name="x" size={26} color={colors.textOnNavy} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  close: { position: 'absolute', right: spacing.lg, padding: spacing.xs },
});
