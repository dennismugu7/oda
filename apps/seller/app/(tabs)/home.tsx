// Home tab: the shop's link and "Finish your shop" for now; the dashboard (designs 15–16)
// arrives in M6 CP3.
import { displayUrl } from '@oda/shared';
import { StyleSheet, Text } from 'react-native';
import { useMe } from '@/auth/useMe';
import { SHOP_BASE_URL } from '@/config';
import { FinishCard } from '@/home/FinishCard';
import { TabPlaceholder, TabScreen } from '@/ui/tabs';
import { colors, text } from '@/theme';

export default function HomeTab() {
  const me = useMe();
  return (
    <TabScreen title="Home" subtitle={me?.shop?.name}>
      <FinishCard />
      <TabPlaceholder
        icon="home"
        title="Your shop at a glance"
        line="New orders and what to do next will show here."
      >
        {me?.shop ? (
          <Text style={styles.link} selectable>
            {displayUrl(SHOP_BASE_URL, me.shop.slug)}
          </Text>
        ) : null}
      </TabPlaceholder>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  link: { ...text('bodyStrong'), color: colors.navy },
});
