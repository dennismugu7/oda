// The seller's tabs (design 15 onwards; decision #32 (10)): Home · Orders · + · Shop · More.
// The raised "+" in the middle adds a product; it opens a screen, not a tab.
import Feather from '@expo/vector-icons/Feather';
import { router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, text } from '@/theme';

type IconName = ComponentProps<typeof Feather>['name'];

const tabIcon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Feather name={name} size={24} color={color} />;
  };

function AddButton() {
  return (
    <View style={styles.addSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add product"
        onPress={() => router.push('/products/new')}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      >
        <Feather name="plus" size={30} color={colors.textOnNavy} />
      </Pressable>
      <Text style={styles.addLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        Add product
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          height: 68 + insets.bottom,
          paddingTop: spacing.sm,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: tabIcon('file-text') }} />
      <Tabs.Screen
        name="add"
        options={{ title: 'Add product', tabBarButton: () => <AddButton /> }}
      />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: tabIcon('shopping-bag') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('grid') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { ...text('small'), fontFamily: text('bodyStrong').fontFamily },
  addSlot: { flex: 1, alignItems: 'center' },
  addButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -26,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.navy,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addLabel: { ...text('small'), color: colors.textSecondary, marginTop: spacing.xs },
  pressed: { opacity: 0.85 },
});
