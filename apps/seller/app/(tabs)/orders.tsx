// Orders tab: the order list (design 17) arrives in M5.
import { TabPlaceholder, TabScreen } from '@/ui/tabs';

export default function OrdersTab() {
  return (
    <TabScreen title="Orders">
      <TabPlaceholder icon="file-text" title="No orders yet" line="Your orders will show here." />
    </TabScreen>
  );
}
