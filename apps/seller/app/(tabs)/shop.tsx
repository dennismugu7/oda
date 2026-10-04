// Shop tab (design 19): the product list and filters arrive in CP3.
import { useMe } from '@/auth/useMe';
import { TabPlaceholder, TabScreen } from '@/ui/tabs';

export default function ShopTab() {
  const me = useMe();
  return (
    <TabScreen title="Shop" subtitle={me?.shop?.name}>
      <TabPlaceholder
        icon="shopping-bag"
        title="Your products"
        line="Your products will show here, ready to edit."
      />
    </TabScreen>
  );
}
