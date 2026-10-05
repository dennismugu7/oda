// Every page of a shop: the demo banner on demo shops (decision #61 g). No database read here,
// so an unknown shop still answers 404 from its page.
import { DemoBanner } from '@/components/store/DemoBanner';
import { isDemoShop } from '@/server/demo';

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      {isDemoShop(slug) ? <DemoBanner /> : null}
      {children}
    </>
  );
}
