// Never shown: the "+" tab button opens /products/new instead (see _layout.tsx).
import { Redirect } from 'expo-router';

export default function AddTab() {
  return <Redirect href="/products/new" />;
}
