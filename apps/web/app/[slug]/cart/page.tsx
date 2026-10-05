// Cart (web 03): per shop, on this device (spec §6.3). The page gives the client the shop's
// settings and the "Goes well with" candidates (visible products by popularity); the cart
// itself is the client component CartView.
import type { Metadata } from 'next';
import Link from 'next/link';
import { CartView } from '@/components/store/CartView';
import { loadShop, restOf, shopData, takingOrders } from '@/server/storefront';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const shop = await loadShop((await params).slug, restOf('/cart', await searchParams));
  return { title: `Your cart · ${shop.name}`, robots: { index: false } };
}

export default async function Cart({ params, searchParams }: Props) {
  const { slug } = await params;
  const shop = await loadShop(slug, restOf('/cart', await searchParams));
  const popular = (await shopData(shop).catalog({ sort: 'popular' }))
    .filter((p) => p.status === 'available')
    .slice(0, 12);
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-5 pb-48">
      <div className="flex items-center gap-3">
        <Link
          href={`/${shop.slug}`}
          aria-label={`Back to ${shop.name}`}
          className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-navy"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="flex-1 text-headline text-navy">Your cart</h1>
        <Link href={`/${shop.slug}`} className="text-body-strong text-primary">
          Keep shopping
        </Link>
      </div>
      <CartView
        shopId={shop.id}
        slug={shop.slug}
        shopName={shop.name}
        freeDeliveryThreshold={shop.freeDeliveryThreshold}
        canOrder={takingOrders(shop)}
        blockedReason={shop.isPaused ? `${shop.name} is taking a break` : 'Not taking orders yet'}
        suggestions={popular.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          categoryId: p.categoryId,
          hasOptions: p.hasOptions,
          coverUrl: p.coverUrl,
        }))}
      />
    </main>
  );
}
